import fs from "fs/promises";
import path from "path";

import { Dict } from "./talos.js";

export type ITalosRisk =
  | "read"
  | "network"
  | "write"
  | "execute"
  | "destructive"
  | "unknown";

export interface ITalosPrivacyMetadata {
  touchesFiles?: boolean;
  sendsNetwork?: boolean;
  mayExposeUserData?: boolean;
}

export interface ITalosNetworkMetadata {
  name: string;
  endpoints: string[];
  sendsUserData: boolean;
}

export interface IAuditRecord {
  id: string;
  timestamp: string;
  kind:
    | "tool_call"
    | "tool_result"
    | "approval"
    | "model_call"
    | "network_endpoint";
  tool?: string;
  model?: string;
  risk?: ITalosRisk;
  approved?: boolean;
  summary: string;
  redactedArgs?: unknown;
  redactedResult?: unknown;
  endpoint?: string;
}

const SECRET_KEY_PATTERN =
  /api[_-]?key|token|secret|password|authorization|cookie/i;

export function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function redact(value: unknown, config: Dict<any> = {}): unknown {
  const privacyConfig = config.privacy ?? {};
  const redactionConfig = privacyConfig.redaction ?? {};
  const sensitivePaths = redactionConfig.sensitive_paths ?? [
    ".env",
    "configs/config.yaml",
  ];
  const secretKeys = redactionConfig.secret_keys ?? [
    "api_key",
    "token",
    "secret",
    "password",
    "authorization",
    "cookie",
  ];
  const secretKeyPattern = new RegExp(
    [...secretKeys, SECRET_KEY_PATTERN.source].join("|"),
    "i",
  );

  const redactString = (input: string) => {
    if (
      sensitivePaths.some((sensitivePath: string) =>
        input.includes(sensitivePath),
      )
    ) {
      return "[REDACTED_PATH]";
    }
    if (input.includes(".env")) {
      return "[REDACTED_PATH]";
    }
    if (/bearer\s+[a-z0-9._-]+/i.test(input)) {
      return input.replace(/bearer\s+[a-z0-9._-]+/gi, "Bearer [REDACTED]");
    }
    if (/sk-[a-z0-9_-]{12,}/i.test(input)) {
      return input.replace(/sk-[a-z0-9_-]{12,}/gi, "sk-[REDACTED]");
    }
    return input;
  };

  const visit = (item: unknown): unknown => {
    if (item === null || item === undefined) {
      return item;
    }
    if (typeof item === "string") {
      return redactString(item);
    }
    if (typeof item !== "object") {
      return item;
    }
    if (Array.isArray(item)) {
      return item.map(visit);
    }
    return Object.fromEntries(
      Object.entries(item as Dict<any>).map(([key, child]) => [
        key,
        secretKeyPattern.test(key) ? "[REDACTED]" : visit(child),
      ]),
    );
  };

  return visit(value);
}

export class AuditLogger {
  config: Dict<any>;
  file: string;

  constructor(config: Dict<any>) {
    this.config = config;
    this.file =
      config.privacy?.audit?.file ??
      config.audit_file ??
      "configs/talos-audit.jsonl";
  }

  async append(record: Omit<IAuditRecord, "id" | "timestamp">) {
    if (this.config.privacy?.audit?.enabled === false) {
      return;
    }
    const fullRecord: IAuditRecord = {
      id: makeId("audit"),
      timestamp: new Date().toISOString(),
      ...record,
    };
    const dir = path.dirname(this.file);
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(this.file, `${JSON.stringify(fullRecord)}\n`, "utf8");
  }

  async tail(limit: number = 20): Promise<IAuditRecord[]> {
    try {
      const content = await fs.readFile(this.file, "utf8");
      return content
        .trim()
        .split("\n")
        .filter(Boolean)
        .slice(-limit)
        .map((line) => JSON.parse(line) as IAuditRecord);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
}
