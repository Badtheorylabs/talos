import { render } from "ink";
import React from "react";
import { Talos, Dict } from "../../core/talos.js";
import { ITalosApprovalRequest } from "../../core/talos.js";
import { PluginBase } from "../plugin-base.js";
import { App, type Message } from "./components/App.js";

export default class CLIUI extends PluginBase {
  agent!: Talos;
  boundAgentPrivateEventHandler!: (event: string, args: Dict<any>) => void;
  messages: Message[] = [];
  isThinking: boolean = false;
  prompt: string = "<User> ";
  pendingApproval?: ITalosApprovalRequest;
  app?: ReturnType<typeof render>;

  desc() {
    return "You can interact with the user using UI tools and events. When the user asks you to do something, think about what information and/or details you need to do that. If you need something only the user can provide, you need to ask the user for that information. Ask the users about task details if the request is vague. Be proactive and update the user on your progress, milestones, and obstacles and how you are going to overcome them.";
  }

  async load(agent: Talos) {
    this.agent = agent;
    this.boundAgentPrivateEventHandler =
      this.agentPrivateEventHandler.bind(this);

    agent.on("private-event", this.boundAgentPrivateEventHandler);

    agent.registerEvent({
      name: "ui/message-received",
      desc: "Triggered when a message is received from the user.",
      args: {
        content: {
          type: "string",
          desc: "The message received from the user.",
          required: true,
        },
        time: {
          type: "string",
          desc: "The time the message was sent.",
          required: true,
        },
      },
    });

    agent.registerTool(
      {
        name: "ui/send-message",
        desc: "Sends a message to the user.",
        risk: "read",
        args: {
          content: {
            type: "string",
            desc: "The message to send to the user. Don't output any Markdown formatting.",
            required: true,
          },
        },
        retvals: {
          status: {
            type: "string",
            desc: "Status of the operation.",
            required: true,
          },
        },
      },
      {
        fn: async (args: Dict<any>) => {
          this.addMessage("agent", args.content);
          return { status: "success" };
        },
      },
    );

    agent.once("plugins-loaded", async () => {
      this.addMessage("agent", "Welcome to Talos!");
      this.renderUI();
    });
  }

  async unload(agent: Talos) {
    agent.off("private-event", this.boundAgentPrivateEventHandler);
    agent.deregisterTool("ui/send-message");
    agent.deregisterEvent("ui/message-received");
    this.app?.unmount();
  }

  agentPrivateEventHandler(event: string, args: Dict<any>) {
    if (event === "cerebrum/thinking") {
      this.addMessage("thinking", args.content);
    } else if (event === "talos/tool-call") {
      this.addMessage("tool-call", args.summary);
    } else if (event === "talos/tool-result") {
      this.addMessage("tool-result", args.summary);
    } else if (event === "talos/event") {
      this.addMessage("event", args.summary);
    } else if (event === "cerebrum/busy") {
      this.isThinking = args.busy;
      this.prompt = args.busy ? "<Thinking> " : "<User> ";
      this.renderUI();
    } else if (event === "privacy/approval-requested") {
      this.pendingApproval = args.request;
      this.addMessage(
        "event",
        `Approval required for ${args.request.tool}. Type y to approve or n to deny.`,
      );
    } else if (event === "privacy/approval-resolved") {
      this.pendingApproval = undefined;
      this.addMessage(
        "event",
        `Approval ${args.id} ${args.approved ? "approved" : "denied"}.`,
      );
    }
  }

  addMessage(type: Message["type"], content: string) {
    this.messages.push({
      type,
      content,
      timestamp: new Date().toISOString(),
    });
    this.renderUI();
  }

  async handleMessage(content: string) {
    const trimmed = content.trim();
    if (
      this.pendingApproval &&
      ["y", "yes", "n", "no"].includes(trimmed.toLowerCase())
    ) {
      const approved = ["y", "yes"].includes(trimmed.toLowerCase());
      this.agent.decideApproval(this.pendingApproval.id, approved);
      return;
    }
    if (trimmed.startsWith("/")) {
      await this.handleCommand(trimmed);
      return;
    }
    this.addMessage("user", content);
    this.agent.emitEvent("ui/message-received", {
      content,
      time: new Date().toISOString(),
    });
  }

  async handleCommand(command: string) {
    const [name, ...parts] = command.split(/\s+/);
    const arg = parts[0];
    if (name === "/privacy") {
      const approvals = this.agent.getApprovalSnapshot();
      const network = Object.entries(this.agent.network)
        .map(
          ([plugin, metadata]) =>
            `${plugin}: ${metadata.endpoints.join(", ")} (sends user data: ${
              metadata.sendsUserData
            })`,
        )
        .join("\n");
      this.addMessage(
        "agent",
        [
          `Audit file: ${this.agent.audit.file}`,
          await this.localStoreStatus(),
          `Active approval: ${approvals.active ? approvals.active.tool : "none"}`,
          `Queued approvals: ${approvals.queued.length}`,
          `Outbound plugins:\n${network || "none registered"}`,
        ].join("\n"),
      );
      return;
    }
    if (name === "/audit") {
      const limit = arg ? Number(arg) : 20;
      const records = await this.agent.getAuditTail(
        Number.isFinite(limit) ? limit : 20,
      );
      this.addMessage(
        "agent",
        records
          .map(
            (record) =>
              `${record.timestamp} ${record.kind} ${record.tool ?? record.model ?? ""} ${record.summary}`,
          )
          .join("\n") || "No audit records.",
      );
      return;
    }
    if (name === "/approvals") {
      const approvals = this.agent.getApprovalSnapshot();
      this.addMessage(
        "agent",
        [
          approvals.active
            ? `Active: ${approvals.active.id} ${approvals.active.tool}`
            : "Active: none",
          ...approvals.queued.map(
            (approval) => `Queued: ${approval.id} ${approval.tool}`,
          ),
        ].join("\n"),
      );
      return;
    }
    if (name === "/models") {
      this.addMessage(
        "agent",
        this.agent.recentModelCalls
          .map((call) => `${call.timestamp} ${call.model} ${call.endpoint}`)
          .join("\n") || "No model calls recorded.",
      );
      return;
    }
    if (name === "/skills") {
      await this.handleSkillsCommand(parts);
      return;
    }
    if (name === "/jobs") {
      await this.handleJobsCommand(parts);
      return;
    }
    if (name === "/memory") {
      await this.handleMemoryCommand(parts);
      return;
    }
    if (name === "/task") {
      await this.handleTaskCommand(parts);
      return;
    }
    this.addMessage("agent", `Unknown command: ${name}`);
  }

  async handleSkillsCommand(parts: string[]) {
    const action = parts[0] ?? "list";
    try {
      if (action === "list") {
        const result = (await this.agent.callTool(
          "skills/list",
          {},
        )) as Dict<any>;
        this.addMessage(
          "agent",
          result.skills
            .map((skill: Dict<any>) => `${skill.name} (${skill.state})`)
            .join("\n") || "No skills.",
        );
        return;
      }
      if (action === "read") {
        const skillName = parts[1];
        if (!skillName) {
          this.addMessage("agent", "Usage: /skills read <name>");
          return;
        }
        const result = (await this.agent.callTool("skills/read", {
          name: skillName,
        })) as Dict<any>;
        this.addMessage(
          "agent",
          `${JSON.stringify(result.metadata)}\n\n${result.content}`,
        );
        return;
      }
      if (action === "activate" || action === "deprecate") {
        const skillName = parts[1];
        if (!skillName) {
          this.addMessage("agent", `Usage: /skills ${action} <name>`);
          return;
        }
        await this.agent.callTool(`skills/${action}`, { name: skillName });
        this.addMessage("agent", `Skill ${skillName} ${action}d.`);
        return;
      }
      this.addMessage(
        "agent",
        "Usage: /skills list | /skills read <name> | /skills activate <name> | /skills deprecate <name>",
      );
    } catch (error: any) {
      this.addMessage("agent", `Skills command failed: ${error.message}`);
    }
  }

  async handleJobsCommand(parts: string[]) {
    const action = parts[0] ?? "list";
    try {
      if (action === "list") {
        const result = (await this.agent.callTool(
          "clock/list-timeouts",
          {},
        )) as Dict<any>;
        this.addMessage(
          "agent",
          result.timeouts
            .map(
              (timeout: Dict<any>) =>
                `${timeout.id} ${timeout.next_trigger_time} recurring=${timeout.recurring} ${timeout.reason}`,
            )
            .join("\n") || "No scheduled jobs.",
        );
        return;
      }
      if (action === "cancel") {
        const id = parts[1];
        if (!id) {
          this.addMessage("agent", "Usage: /jobs cancel <id>");
          return;
        }
        await this.agent.callTool("clock/clear-timeout", { id });
        this.addMessage("agent", `Job ${id} cancelled.`);
        return;
      }
      this.addMessage("agent", "Usage: /jobs list | /jobs cancel <id>");
    } catch (error: any) {
      this.addMessage("agent", `Jobs command failed: ${error.message}`);
    }
  }

  async handleMemoryCommand(parts: string[]) {
    const action = parts[0] ?? "list";
    try {
      if (action === "list") {
        if ("ltm/list" in this.agent.tools) {
          const result = await this.agent.callTool("ltm/list", {});
          const typedResult = result as Dict<any>;
          this.addMessage(
            "agent",
            typedResult.list
              .map((item: Dict<any>) => `${item.id}: ${item.desc}`)
              .join("\n") || "No long-term memories.",
          );
          return;
        }
        if ("local-store/list" in this.agent.tools) {
          const result = await this.agent.callTool("local-store/list", {});
          const typedResult = result as Dict<any>;
          this.addMessage(
            "agent",
            typedResult.collections
              .map(
                (collection: Dict<any>) =>
                  `${collection.name}: ${collection.count}`,
              )
              .join("\n") || "No local-store collections.",
          );
          return;
        }
        this.addMessage("agent", "No memory tools are loaded.");
        return;
      }
      if (action === "show") {
        const id = parts[1];
        if (!id) {
          this.addMessage("agent", "Usage: /memory show <id>");
          return;
        }
        const result = (await this.agent.callTool("ltm/list", {})) as Dict<any>;
        const memory = result.list.find((item: Dict<any>) => item.id === id);
        this.addMessage("agent", JSON.stringify(memory ?? null, null, 2));
        return;
      }
      if (action === "delete") {
        const id = parts[1];
        if (!id) {
          this.addMessage("agent", "Usage: /memory delete <id>");
          return;
        }
        await this.agent.callTool("ltm/delete", { id });
        this.addMessage("agent", `Memory ${id} deleted.`);
        return;
      }
      this.addMessage(
        "agent",
        "Usage: /memory list | /memory show <id> | /memory delete <id>",
      );
    } catch (error: any) {
      this.addMessage("agent", `Memory command failed: ${error.message}`);
    }
  }

  async localStoreStatus() {
    if (!("local-store/status" in this.agent.tools)) {
      return "Private store: not loaded";
    }
    try {
      const status = await this.agent.callTool("local-store/status", {});
      return `Private store: ${status.file} (key: ${status.key_file})`;
    } catch (error: any) {
      return `Private store: unavailable (${error.message})`;
    }
  }

  async handleTaskCommand(parts: string[]) {
    const action = parts[0] ?? "list";
    try {
      if (action === "list") {
        const result = (await this.agent.callTool(
          "task/list",
          {},
        )) as Dict<any>;
        this.addMessage(
          "agent",
          result.tasks
            .map(
              (task: Dict<any>) =>
                `${task.id} ${task.status} ${task.title}${
                  task.reflection ? " (reflected)" : ""
                }`,
            )
            .join("\n") || "No tasks.",
        );
        return;
      }
      if (action === "start") {
        const title = parts.slice(1).join(" ").trim();
        if (!title) {
          this.addMessage("agent", "Usage: /task start <title>");
          return;
        }
        const result = (await this.agent.callTool("task/start", {
          title,
        })) as Dict<any>;
        this.addMessage("agent", `Task started: ${result.id}`);
        return;
      }
      if (action === "complete") {
        const id = parts[1];
        if (!id) {
          this.addMessage("agent", "Usage: /task complete <id>");
          return;
        }
        await this.agent.callTool("task/complete", { id });
        this.addMessage("agent", `Task completed: ${id}`);
        return;
      }
      if (action === "reflect") {
        const id = parts[1];
        const reflection = parts.slice(2).join(" ").trim();
        if (!id || !reflection) {
          this.addMessage("agent", "Usage: /task reflect <id> <reflection>");
          return;
        }
        await this.agent.callTool("task/reflect", { id, reflection });
        this.addMessage("agent", `Task reflected: ${id}`);
        return;
      }
      this.addMessage(
        "agent",
        "Usage: /task list | /task start <title> | /task complete <id> | /task reflect <id> <reflection>",
      );
    } catch (error: any) {
      this.addMessage("agent", `Task command failed: ${error.message}`);
    }
  }

  renderUI() {
    const app = React.createElement(App, {
      onMessage: this.handleMessage.bind(this),
      messages: this.messages,
      prompt: this.prompt,
      isThinking: this.isThinking,
      pendingApproval: this.pendingApproval,
    });
    if (this.app) {
      this.app.rerender(app);
      return;
    }
    this.app = render(app);
  }
}
