import { Talos, Dict } from "../../core/talos.js";
import { PluginBase } from "../plugin-base.js";

interface ITask {
  content: string;
  finished: boolean;
}

export default class ShortTermMemory extends PluginBase {
  tasks: ITask[] = [];

  desc() {
    return `You have a short-term memory. You must use it to keep track of your tasks while you are working on them. When you receive a task from the user and it requires multiple steps to complete, you must think thoroughly about the steps and break them down into smaller tasks. Try to be as detailed as possible and include all necessary information and append these tasks to your short-term memory. Afterwards, you must follow the task list and work on your unfinished tasks, unless the user asks you to do something else. After you have completed a task or multiple tasks at once, you must mark them as finished. After you have finished all tasks, you must clear your short-term memory. Your current short-term memory is: ${JSON.stringify(
      this.tasks,
    )}. If the results of a task to show to the user is textual and long, you should create a Markdown file and append to it gradually as you complete the task. At the end, you should prepare your response according to this file.`;
  }

  async load(agent: Talos) {
    agent.registerTool(
      {
        name: "stm/append-tasks",
        desc: "Append an array of tasks to the short-term memory.",
        risk: "write",
        args: {
          tasks: {
            type: "array",
            desc: "The array of tasks to append.",
            required: true,
            of: {
              type: "string",
              desc: "The content of the task.",
              required: true,
            },
          },
        },
        retvals: {
          status: {
            type: "string",
            desc: "The status of the operation.",
            required: true,
          },
        },
      },
      {
        fn: async (args: Dict<any>) => {
          this.tasks.push(
            ...args.tasks.map((task: string) => ({
              content: task,
              finished: false,
            })),
          );
          return { status: "success" };
        },
      },
    );
    agent.registerTool(
      {
        name: "stm/mark-task-finished",
        desc: "Mark tasks as finished.",
        risk: "write",
        args: {
          indices: {
            type: "array",
            desc: "The indices of the tasks to mark as finished.",
            required: true,
            of: {
              type: "number",
              desc: "The index of the task to mark as finished.",
              required: true,
            },
          },
        },
        retvals: {
          status: {
            type: "string",
            desc: "The status of the operation.",
            required: true,
          },
        },
      },
      {
        fn: async (args: Dict<any>) => {
          args.indices.forEach((index: number) => {
            this.tasks[index].finished = true;
          });
          return { status: "success" };
        },
      },
    );
    agent.registerTool(
      {
        name: "stm/clear-tasks",
        desc: "Clear all tasks.",
        risk: "write",
        args: {},
        retvals: {
          status: {
            type: "string",
            desc: "The status of the operation.",
            required: true,
          },
        },
      },
      {
        fn: async () => {
          this.tasks = [];
          return { status: "success" };
        },
      },
    );
  }

  async unload(agent: Talos) {
    agent.deregisterTool("stm/append-tasks");
    agent.deregisterTool("stm/mark-task-finished");
    agent.deregisterTool("stm/clear-tasks");
  }

  state() {
    return { tasks: this.tasks };
  }

  setState(state: Dict<any>) {
    this.tasks = state.tasks;
  }
}
