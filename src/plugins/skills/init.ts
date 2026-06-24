import fs from "fs/promises";
import path from "path";

import { Talos, Dict } from "../../core/talos.js";
import { PluginBase } from "../plugin-base.js";

type SkillState = "draft" | "active" | "deprecated";

interface ISkillMetadata {
  name: string;
  state: SkillState;
  created_at: string;
  updated_at: string;
}

export default class Skills extends PluginBase {
  directory = "skills";

  desc() {
    return "You can use local skills. Active skills are reusable procedures stored locally. Create drafts for repeated workflows, but do not activate or promote them without approval.";
  }

  async load(agent: Talos) {
    this.directory = this.config.directory ?? "skills";
    await fs.mkdir(this.directory, { recursive: true });

    agent.registerTool(
      {
        name: "skills/list",
        desc: "List local skills and their states.",
        risk: "read",
        privacy: { touchesFiles: true },
        args: {},
        retvals: {
          skills: {
            type: "array",
            desc: "The local skills.",
            required: true,
            of: {
              type: "object",
              desc: "A local skill.",
              required: true,
              of: {
                name: {
                  type: "string",
                  desc: "Skill name.",
                  required: true,
                },
                state: {
                  type: "string",
                  desc: "Skill state.",
                  required: true,
                },
              },
            },
          },
        },
      },
      {
        fn: async () => ({ skills: await this.listSkills() }),
      },
    );

    agent.registerTool(
      {
        name: "skills/read",
        desc: "Read a local skill.",
        risk: "read",
        privacy: { touchesFiles: true },
        args: {
          name: {
            type: "string",
            desc: "Skill name.",
            required: true,
          },
        },
        retvals: {
          content: {
            type: "string",
            desc: "Skill markdown.",
            required: true,
          },
          metadata: {
            type: "object",
            desc: "Skill metadata.",
            required: true,
          },
        },
      },
      {
        fn: async (args) => ({
          content: await fs.readFile(this.skillFile(args.name), "utf8"),
          metadata: await this.readMetadata(args.name),
        }),
      },
    );

    agent.registerTool(
      {
        name: "skills/create-draft",
        desc: "Create a draft local skill.",
        risk: "write",
        privacy: { touchesFiles: true },
        args: {
          name: {
            type: "string",
            desc: "Skill name.",
            required: true,
          },
          content: {
            type: "string",
            desc: "Skill markdown.",
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
          await this.writeSkill(args.name, args.content, "draft");
          return { status: "success" };
        },
      },
    );

    agent.registerTool(
      {
        name: "skills/update-draft",
        desc: "Update a draft local skill.",
        risk: "write",
        privacy: { touchesFiles: true },
        args: {
          name: {
            type: "string",
            desc: "Skill name.",
            required: true,
          },
          content: {
            type: "string",
            desc: "Skill markdown.",
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
          const metadata = await this.readMetadata(args.name);
          if (metadata.state !== "draft") {
            throw new Error("Only draft skills can be updated.");
          }
          await this.writeSkill(args.name, args.content, "draft", metadata);
          return { status: "success" };
        },
      },
    );

    agent.registerTool(
      {
        name: "skills/activate",
        desc: "Activate a local skill.",
        risk: "write",
        privacy: { touchesFiles: true },
        args: {
          name: {
            type: "string",
            desc: "Skill name.",
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
          await this.setSkillState(args.name, "active");
          return { status: "success" };
        },
      },
    );

    agent.registerTool(
      {
        name: "skills/deprecate",
        desc: "Deprecate a local skill.",
        risk: "write",
        privacy: { touchesFiles: true },
        args: {
          name: {
            type: "string",
            desc: "Skill name.",
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
          await this.setSkillState(args.name, "deprecated");
          return { status: "success" };
        },
      },
    );

    agent.registerTool(
      {
        name: "skills/search",
        desc: "Search local skills by text.",
        risk: "read",
        privacy: { touchesFiles: true },
        args: {
          query: {
            type: "string",
            desc: "Search query.",
            required: true,
          },
        },
        retvals: {
          results: {
            type: "array",
            desc: "Matching skills.",
            required: true,
            of: {
              type: "string",
              desc: "Skill name.",
              required: true,
            },
          },
        },
      },
      {
        fn: async (args) => {
          const skills = await this.listSkills();
          const results = [];
          for (const skill of skills) {
            const content = await fs.readFile(
              this.skillFile(skill.name),
              "utf8",
            );
            if (
              skill.name.includes(args.query) ||
              content.toLowerCase().includes(args.query.toLowerCase())
            ) {
              results.push(skill.name);
            }
          }
          return { results };
        },
      },
    );
  }

  async unload(agent: Talos) {
    agent.deregisterTool("skills/list");
    agent.deregisterTool("skills/read");
    agent.deregisterTool("skills/create-draft");
    agent.deregisterTool("skills/update-draft");
    agent.deregisterTool("skills/activate");
    agent.deregisterTool("skills/deprecate");
    agent.deregisterTool("skills/search");
  }

  async activeSkillSummaries() {
    const skills = await this.listSkills();
    const active = skills.filter((skill) => skill.state === "active");
    const summaries = [];
    for (const skill of active) {
      const content = await fs.readFile(this.skillFile(skill.name), "utf8");
      summaries.push(`Skill ${skill.name}:\n${content.slice(0, 2000)}`);
    }
    return summaries;
  }

  async listSkills() {
    const entries = await fs.readdir(this.directory, { withFileTypes: true });
    const skills = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      try {
        const metadata = await this.readMetadata(entry.name);
        skills.push({ name: metadata.name, state: metadata.state });
      } catch {}
    }
    return skills;
  }

  async writeSkill(
    name: string,
    content: string,
    state: SkillState,
    previous?: ISkillMetadata,
  ) {
    const now = new Date().toISOString();
    const metadata: ISkillMetadata = {
      name: this.slug(name),
      state,
      created_at: previous?.created_at ?? now,
      updated_at: now,
    };
    await fs.mkdir(this.skillDir(name), { recursive: true });
    await fs.writeFile(this.skillFile(name), content, "utf8");
    await fs.writeFile(
      this.metadataFile(name),
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8",
    );
  }

  async setSkillState(name: string, state: SkillState) {
    const metadata = await this.readMetadata(name);
    await this.writeSkill(
      name,
      await fs.readFile(this.skillFile(name), "utf8"),
      state,
      metadata,
    );
  }

  async readMetadata(name: string): Promise<ISkillMetadata> {
    return JSON.parse(await fs.readFile(this.metadataFile(name), "utf8"));
  }

  skillDir(name: string) {
    return path.join(this.directory, this.slug(name));
  }

  skillFile(name: string) {
    return path.join(this.skillDir(name), "SKILL.md");
  }

  metadataFile(name: string) {
    return path.join(this.skillDir(name), "metadata.json");
  }

  slug(name: string) {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
