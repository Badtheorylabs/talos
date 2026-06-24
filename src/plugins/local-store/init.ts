import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

import { Talos, Dict } from "../../core/talos.js";
import { PluginBase } from "../plugin-base.js";

interface IEncryptedStore {
  version: 1;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

export default class LocalStore extends PluginBase {
  file = "configs/talos-private-store.json";
  keyFile = "configs/talos-private-store.key";
  requireExistingKeyFile = false;
  key?: Buffer;

  desc() {
    return "A local encrypted store is available for privacy-first state. Use it for local-only private records when a specialized plugin tool is not available.";
  }

  async load(agent: Talos) {
    this.file =
      this.config.file ?? agent.config.private_store?.db_file ?? this.file;
    this.keyFile =
      this.config.key_file ??
      agent.config.private_store?.key_file ??
      this.keyFile;
    this.requireExistingKeyFile =
      this.config.require_existing_key_file ??
      agent.config.private_store?.require_existing_key_file ??
      false;
    this.key = await this.loadOrCreateKey();
    await this.ensureStore();

    agent.registerTool(
      {
        name: "local-store/status",
        desc: "Show local encrypted store status.",
        risk: "read",
        privacy: { touchesFiles: true },
        args: {},
        retvals: {
          file: {
            type: "string",
            desc: "Store file.",
            required: true,
          },
          encrypted: {
            type: "boolean",
            desc: "Whether the store is encrypted.",
            required: true,
          },
          key_file: {
            type: "string",
            desc: "Local encryption key file.",
            required: true,
          },
        },
      },
      {
        fn: async () => ({
          file: this.file,
          encrypted: true,
          key_file: this.keyFile,
        }),
      },
    );

    agent.registerTool(
      {
        name: "local-store/append",
        desc: "Append a private local record to the encrypted store.",
        risk: "write",
        privacy: { touchesFiles: true, mayExposeUserData: true },
        args: {
          collection: {
            type: "string",
            desc: "Collection name.",
            required: true,
          },
          record: {
            type: "object",
            desc: "Record to append.",
            required: true,
          },
        },
        retvals: {
          status: {
            type: "string",
            desc: "Status.",
            required: true,
          },
        },
      },
      {
        fn: async (args) => {
          const store = await this.readStore();
          store[args.collection] = store[args.collection] ?? [];
          store[args.collection].push({
            ...args.record,
            created_at: new Date().toISOString(),
          });
          await this.writeStore(store);
          return { status: "success" };
        },
      },
    );

    agent.registerTool(
      {
        name: "local-store/list",
        desc: "List encrypted local store collections.",
        risk: "read",
        privacy: { touchesFiles: true },
        args: {},
        retvals: {
          collections: {
            type: "array",
            desc: "Collection names and counts.",
            required: true,
            of: {
              type: "object",
              desc: "Collection metadata.",
              required: true,
              of: {
                name: {
                  type: "string",
                  desc: "Collection name.",
                  required: true,
                },
                count: {
                  type: "number",
                  desc: "Record count.",
                  required: true,
                },
              },
            },
          },
        },
      },
      {
        fn: async () => {
          const store = await this.readStore();
          return {
            collections: Object.entries(store).map(([name, records]) => ({
              name,
              count: records.length,
            })),
          };
        },
      },
    );

    agent.registerTool(
      {
        name: "local-store/read",
        desc: "Read records from an encrypted local store collection.",
        risk: "read",
        privacy: { touchesFiles: true, mayExposeUserData: true },
        args: {
          collection: {
            type: "string",
            desc: "Collection name.",
            required: true,
          },
          limit: {
            type: "number",
            desc: "Maximum records to return.",
            required: false,
          },
        },
        retvals: {
          records: {
            type: "array",
            desc: "Records.",
            required: true,
          },
        },
      },
      {
        fn: async (args) => {
          const store = await this.readStore();
          const records = store[args.collection] ?? [];
          return { records: records.slice(-(args.limit ?? 20)) };
        },
      },
    );
  }

  async unload(agent: Talos) {
    agent.deregisterTool("local-store/status");
    agent.deregisterTool("local-store/append");
    agent.deregisterTool("local-store/list");
    agent.deregisterTool("local-store/read");
  }

  async ensureStore() {
    try {
      await fs.access(this.file);
    } catch {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await this.writeStore({});
    }
  }

  async loadOrCreateKey() {
    try {
      const encodedKey = await fs.readFile(this.keyFile, "utf8");
      return Buffer.from(encodedKey.trim(), "base64");
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      if (this.requireExistingKeyFile) {
        throw new Error(`Local store key file ${this.keyFile} does not exist.`);
      }
      const key = crypto.randomBytes(32);
      await fs.mkdir(path.dirname(this.keyFile), { recursive: true });
      await fs.writeFile(this.keyFile, `${key.toString("base64")}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      return key;
    }
  }

  async readStore(): Promise<Dict<any[]>> {
    const encrypted = JSON.parse(await fs.readFile(this.file, "utf8"));
    return this.decrypt(encrypted);
  }

  async writeStore(store: Dict<any[]>) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(
      this.file,
      `${JSON.stringify(this.encrypt(store), null, 2)}\n`,
      "utf8",
    );
  }

  encrypt(store: Dict<any[]>): IEncryptedStore {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.scryptSync(this.key!, salt, 32);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(store), "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return {
      version: 1,
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      data: data.toString("base64"),
    };
  }

  decrypt(encrypted: IEncryptedStore): Dict<any[]> {
    const salt = Buffer.from(encrypted.salt, "base64");
    const iv = Buffer.from(encrypted.iv, "base64");
    const tag = Buffer.from(encrypted.tag, "base64");
    const data = Buffer.from(encrypted.data, "base64");
    const key = crypto.scryptSync(this.key!, salt, 32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"),
    );
  }
}
