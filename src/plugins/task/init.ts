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
    return "Use task/start and task/complete to mark explicit task boundaries. Only use task/reflect after a task is complete or when the user explicitly asks for reflection.";
  }

  async load(agent: Talos) {
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
          if (task.status !== "completed") {
            throw new Error("Task must be completed before reflection.");
          }
          task.reflection = args.reflection;
          return { status: "success" };
        },
      },
    );
  }

  async unload(agent: Talos) {
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
