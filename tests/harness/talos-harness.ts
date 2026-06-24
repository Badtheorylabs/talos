import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  Talos,
  Dict,
  ITalosArgument,
  ITalosTool,
} from "../../src/core/talos.js";
import { IAuditRecord, ITalosRisk } from "../../src/core/privacy.js";
import { PluginBase } from "../../src/plugins/plugin-base.js";

type ToolArgs = Dict<ITalosArgument>;
type ToolRetvals = Dict<ITalosArgument>;

interface HarnessOptions {
  config?: Dict<any>;
  states?: Dict<Dict<any>>;
  approvalsAllowlist?: string[];
  auditEnabled?: boolean;
  prefix?: string;
}

interface FakeToolOptions {
  name: string;
  risk?: ITalosRisk;
  args?: ToolArgs;
  retvals?: ToolRetvals;
  result?: Dict<any>;
  fn?: ITalosTool<any, any>["fn"];
  explainSummary?: string;
}

const okRetvals = {
  ok: { type: "boolean", desc: "OK.", required: true },
} satisfies ToolRetvals;

export class TalosHarness {
  agent: Talos;
  dir: string;
  auditFile: string;

  private constructor(agent: Talos, dir: string, auditFile: string) {
    this.agent = agent;
    this.dir = dir;
    this.auditFile = auditFile;
  }

  static async create(options: HarnessOptions = {}) {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), options.prefix ?? "talos-harness-"),
    );
    const auditFile = path.join(dir, "audit.jsonl");
    const config = mergeConfig(
      {
        audit_file: auditFile,
        privacy: {
          audit: { enabled: options.auditEnabled ?? true },
          approvals: { allowlist: options.approvalsAllowlist ?? [] },
        },
      },
      options.config ?? {},
    );
    const agent = new Talos(config, options.states ?? {});
    return new TalosHarness(agent, dir, auditFile);
  }

  path(...parts: string[]) {
    return path.join(this.dir, ...parts);
  }

  registerTool(options: FakeToolOptions) {
    this.agent.registerTool(
      {
        name: options.name,
        desc: `Harness tool ${options.name}.`,
        risk: options.risk,
        args: options.args ?? {},
        retvals: options.retvals ?? okRetvals,
      },
      {
        fn:
          options.fn ??
          (async () => {
            return options.result ?? { ok: true };
          }),
        explain_args: options.explainSummary
          ? () => ({ summary: options.explainSummary! })
          : undefined,
      },
    );
  }

  async loadPluginInstance(name: string, plugin: PluginBase) {
    this.agent.plugins[name] = plugin;
    await plugin.load(this.agent);
    const state = this.agent.states[name];
    if (state) {
      plugin.setState(state);
    }
    return plugin;
  }

  async loadConfiguredPlugins(plugins: Dict<any>) {
    this.agent.config.plugins = plugins;
    await this.agent.loadPlugins();
  }

  callTool<T extends Dict<any> = Dict<any>>(name: string, args: Dict<any>) {
    return this.agent.callTool(name, args) as Promise<T>;
  }

  async waitForActiveApproval() {
    await this.waitFor(
      () => Boolean(this.agent.getApprovalSnapshot().active),
      "active approval",
    );
    return this.agent.getApprovalSnapshot().active!;
  }

  async waitForApprovalCounts(activeCount: 0 | 1, queuedCount: number) {
    await this.waitFor(() => {
      const snapshot = this.agent.getApprovalSnapshot();
      return (
        (snapshot.active ? 1 : 0) === activeCount &&
        snapshot.queued.length === queuedCount
      );
    }, `approval counts ${activeCount}/${queuedCount}`);
    return this.agent.getApprovalSnapshot();
  }

  async approveNext() {
    const active = await this.waitForActiveApproval();
    this.agent.decideApproval(active.id, true);
    await this.flush();
    return active;
  }

  async denyNext() {
    const active = await this.waitForActiveApproval();
    this.agent.decideApproval(active.id, false);
    await this.flush();
    return active;
  }

  async drainApprovals(approved: boolean) {
    const resolved = [];
    while (this.agent.getApprovalSnapshot().active) {
      resolved.push(
        approved ? await this.approveNext() : await this.denyNext(),
      );
    }
    return resolved;
  }

  async auditRecords() {
    try {
      const content = await fs.readFile(this.auditFile, "utf8");
      return content
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as IAuditRecord);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async auditTail(limit = 20) {
    return this.agent.getAuditTail(limit);
  }

  async waitForAudit(
    predicate: (records: IAuditRecord[]) => boolean,
    label = "audit records",
  ) {
    await this.waitFor(async () => predicate(await this.auditRecords()), label);
    return this.auditRecords();
  }

  async cleanup() {
    await this.agent.unloadPlugins();
    await fs.rm(this.dir, { recursive: true, force: true });
  }

  async flush() {
    await new Promise((resolve) => setImmediate(resolve));
  }

  private async waitFor(
    predicate: () => boolean | Promise<boolean>,
    label: string,
    timeoutMs = 1000,
  ) {
    const deadline = Date.now() + timeoutMs;
    while (!(await predicate())) {
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for ${label}`);
      }
      await this.flush();
    }
  }
}

function mergeConfig(base: Dict<any>, override: Dict<any>): Dict<any> {
  const result: Dict<any> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      result[key] = mergeConfig(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
