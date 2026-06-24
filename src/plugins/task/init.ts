import { Talos, Dict } from "../../core/talos.js";
import { makeId } from "../../core/privacy.js";
import { PluginBase } from "../plugin-base.js";

interface ITaskBoundary {
  id: string;
  title: string;
  status: "active" | "completed";
  started_at: string;
  completed_at?: string;
  reflection?: string;
}

export default class Task extends PluginBase {
  tasks: ITaskBoundary[] = [];

  desc() {
    return "Use task/start and task/complete to mark explicit task boundaries. Only use task/reflect after a task is complete or when the user explicitly asks for reflection. Reflections can propose a reusable skill draft when a workflow should be learned.";
  }

  async load(agent: Talos) {
    agent.registerTool(
      {
        name: "task/list",
        desc: "List explicit task boundaries.",
        risk: "read",
        args: {},
        retvals: {
          tasks: {
            type: "array",
            desc: "Tasks.",
            required: true,
          },
        },
      },
      {
        fn: async () => ({ tasks: this.tasks }),
      },
    );

    agent.registerTool(
      {
        name: "task/start",
        desc: "Start an explicit task boundary.",
        risk: "write",
        args: {
          title: {
            type: "string",
            desc: "Task title.",
            required: true,
          },
        },
        retvals: {
          id: {
            type: "string",
            desc: "Task ID.",
            required: true,
          },
        },
      },
      {
        fn: async (args) => {
          const task = {
            id: makeId("task"),
            title: args.title,
            status: "active" as const,
            started_at: new Date().toISOString(),
          };
          this.tasks.push(task);
          return { id: task.id };
        },
      },
    );

    agent.registerTool(
      {
        name: "task/complete",
        desc: "Complete an explicit task boundary.",
        risk: "write",
        args: {
          id: {
            type: "string",
            desc: "Task ID.",
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
          const task = this.tasks.find((item) => item.id === args.id);
          if (!task) {
            throw new Error("Task not found.");
          }
          task.status = "completed";
          task.completed_at = new Date().toISOString();
          return { status: "success" };
        },
      },
    );

    agent.registerTool(
      {
        name: "task/reflect",
        desc: "Store a reflection after an explicit task completes.",
        risk: "write",
        args: {
          id: {
            type: "string",
            desc: "Task ID.",
            required: true,
          },
          reflection: {
            type: "string",
            desc: "Reflection text.",
            required: true,
          },
          proposed_skill_name: {
            type: "string",
            desc: "Optional draft skill name to create from this reflection.",
            required: false,
          },
          proposed_skill_content: {
            type: "string",
            desc: "Optional draft skill markdown to create from this reflection.",
            required: false,
          },
        },
        retvals: {
          status: {
            type: "string",
            desc: "Status.",
            required: true,
          },
          skill_draft_created: {
            type: "boolean",
            desc: "Whether a skill draft was created.",
            required: true,
          },
        },
      },
      {
        fn: async (args) => {
          const task = this.tasks.find((item) => item.id === args.id);
          if (!task) {
            throw new Error("Task not found.");
          }
          if (task.status !== "completed") {
            throw new Error("Task must be completed before reflection.");
          }
          task.reflection = args.reflection;
          let skillDraftCreated = false;
          if (args.proposed_skill_name && args.proposed_skill_content) {
            if (!("skills/create-draft" in agent.tools)) {
              throw new Error("Skills plugin is not loaded.");
            }
            await agent.callTool("skills/create-draft", {
              name: args.proposed_skill_name,
              content: args.proposed_skill_content,
            });
            skillDraftCreated = true;
          }
          return { status: "success", skill_draft_created: skillDraftCreated };
        },
      },
    );
  }

  async unload(agent: Talos) {
    agent.deregisterTool("task/list");
    agent.deregisterTool("task/start");
    agent.deregisterTool("task/complete");
    agent.deregisterTool("task/reflect");
  }

  state() {
    return { tasks: this.tasks };
  }

  setState(state: Dict<any>) {
    this.tasks = state.tasks ?? [];
  }
}
