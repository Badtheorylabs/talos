import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";

import { Talos } from "../../core/talos.js";
import { PluginBase } from "../plugin-base.js";

export default class GeneratedPlugins extends PluginBase {
  directory = "generated-plugins";

  desc() {
    return "Generated plugin proposals must be written as drafts, pass checks, and receive user approval before loading through talos/load-plugin.";
  }

  async load(agent: Talos) {
    this.directory = this.config.directory ?? "generated-plugins";
    await fs.mkdir(this.directory, { recursive: true });

    agent.registerTool(
      {
        name: "generated-plugins/propose",
        desc: "Write a generated plugin proposal draft.",
        risk: "write",
        privacy: { touchesFiles: true },
        args: {
          name: {
            type: "string",
            desc: "Plugin name.",
            required: true,
          },
          init_ts: {
            type: "string",
            desc: "The init.ts content.",
            required: true,
          },
          purpose: {
            type: "string",
            desc: "Why this plugin should exist.",
            required: true,
          },
        },
        retvals: {
          path: {
            type: "string",
            desc: "Draft path.",
            required: true,
          },
        },
      },
      {
        fn: async (args) => {
          const pluginDir = path.join(this.directory, this.slug(args.name));
          await fs.mkdir(pluginDir, { recursive: true });
          await fs.writeFile(
            path.join(pluginDir, "init.ts"),
            args.init_ts,
            "utf8",
          );
          await fs.writeFile(
            path.join(pluginDir, "proposal.md"),
            `# ${this.slug(args.name)}\n\n${args.purpose}\n`,
            "utf8",
          );
          return { path: pluginDir };
        },
      },
    );

    agent.registerTool(
      {
        name: "generated-plugins/check",
        desc: "Run repository checks before a generated plugin can be loaded.",
        risk: "execute",
        privacy: { touchesFiles: true },
        args: {},
        retvals: {
          result: {
            type: "string",
            desc: "Check result.",
            required: true,
          },
        },
      },
      {
        fn: async () =>
          new Promise((resolve, reject) => {
            exec(
              "pnpm run typecheck && pnpm run lint",
              (error, stdout, stderr) => {
                if (error) {
                  reject(Error(`${stdout}\n${stderr}`));
                } else {
                  resolve({ result: stdout });
                }
              },
            );
          }),
      },
    );
  }

  async unload(agent: Talos) {
    agent.deregisterTool("generated-plugins/propose");
    agent.deregisterTool("generated-plugins/check");
  }

  slug(name: string) {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
