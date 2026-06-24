import { EventEmitter } from "events";

import { PluginBase } from "../plugins/plugin-base.js";
import logger from "../utils/logger.js";
import {
  AuditLogger,
  ITalosNetworkMetadata,
  ITalosPrivacyMetadata,
  ITalosRisk,
  makeId,
  redact,
} from "./privacy.js";

export type Dict<T> = { [key: string]: T };

type ITalosArgumentPrimitive = {
  type: "string" | "number" | "boolean";
  desc: string;
  required: boolean;
};

export type ITalosArgument =
  | ITalosArgumentPrimitive
  | {
      type: "object" | "array";
      desc: string;
      required: boolean;
      of?: Dict<ITalosArgument> | ITalosArgument;
    };
type ITalosArgumentInstance<T extends ITalosArgument> =
  T extends ITalosArgumentPrimitive
    ? T["type"] extends "string"
      ? T["required"] extends true
        ? string
        : string | undefined
      : T["type"] extends "number"
        ? T["required"] extends true
          ? number
          : number | undefined
        : T["type"] extends "boolean"
          ? T["required"] extends true
            ? boolean
            : boolean | undefined
          : never
    : T extends { of: Dict<ITalosArgument> }
      ? T["required"] extends true
        ? { [K in keyof T["of"]]: ITalosArgumentInstance<T["of"][K]> }
        :
            | { [K in keyof T["of"]]: ITalosArgumentInstance<T["of"][K]> }
            | undefined
      : T extends { of: ITalosArgument }
        ? T["required"] extends true
          ? ITalosArgumentInstance<T["of"]>[]
          : ITalosArgumentInstance<T["of"]>[] | undefined
        : T extends { type: "object" }
          ? T["required"] extends true
            ? { [K in keyof T["of"]]: any }
            : { [K in keyof T["of"]]: any } | undefined
          : T extends { type: "array" }
            ? T["required"] extends true
              ? any[]
              : (any | undefined)[]
            : never;

export interface ITalosTool<
  Args extends Dict<ITalosArgument> = Dict<ITalosArgument>,
  RetArgs extends Dict<ITalosArgument> = Dict<ITalosArgument>,
> {
  name: string;
  desc: string;
  risk?: ITalosRisk;
  privacy?: ITalosPrivacyMetadata;
  args: Args;
  retvals: RetArgs;
  fn: (args: {
    [K in keyof Args]: Args[K] extends ITalosArgument
      ? ITalosArgumentInstance<Args[K]>
      : never;
  }) => Promise<{
    [K in keyof RetArgs]: RetArgs[K] extends ITalosArgument
      ? ITalosArgumentInstance<RetArgs[K]>
      : never;
  }>;
  explain_args?: (args: Dict<any>) => ITalosExplanation;
  explain_retvals?: (args: Dict<any>, retvals: Dict<any>) => ITalosExplanation;
}

export interface ITalosEvent {
  name: string;
  desc: string;
  args: Dict<ITalosArgument>;
  explain_args?: (args: Dict<any>) => ITalosExplanation;
}

export interface ITalosExplanation {
  summary: string;
  details?: string;
}

export interface ITalosApprovalRequest {
  id: string;
  tool: string;
  risk: ITalosRisk;
  args: Dict<any>;
  summary: string;
  created_at: string;
}

interface ITalosApprovalQueueItem {
  request: ITalosApprovalRequest;
  resolve: (approved: boolean) => void;
}

export class Talos extends EventEmitter {
  config: Dict<any>;
  states: Dict<Dict<any>>;
  plugins: Dict<PluginBase>;
  tools: Dict<ITalosTool<any, any>>;
  events: Dict<ITalosEvent>;
  audit: AuditLogger;
  approvalQueue: ITalosApprovalQueueItem[] = [];
  activeApproval?: ITalosApprovalQueueItem;
  approvals: ITalosApprovalRequest[] = [];
  recentModelCalls: Dict<any>[] = [];
  network: Dict<ITalosNetworkMetadata> = {};

  constructor(config: Dict<any>, states: Dict<Dict<any>>) {
    super();
    this.config = config;
    this.states = states;
    this.plugins = {};
    this.tools = {};
    this.events = {};
    this.audit = new AuditLogger(config);
  }

  async loadPlugins() {
    const plugins = this.config.plugins;
    if (!plugins) {
      logger.warn("No plugins found in config");
    }
    for (const [name, args] of Object.entries(plugins)) {
      await this.loadPlugin(name, args ?? {});
    }
    this.emit("plugins-loaded");
  }

  async unloadPlugins() {
    const plugins = Object.keys(this.plugins);
    for (const name of plugins) {
      try {
        await this.unloadPlugin(name);
      } catch (error) {
        logger.error(`Failed to unload plugin ${name}: ${error}`);
        if (name in this.plugins) {
          delete this.plugins[name];
        }
      }
    }
  }

  async loadPlugin(name: string, args: Dict<any>) {
    if (name in this.plugins) {
      throw new Error(`Plugin ${name} already loaded`);
    }
    const Plugin = (await import(`../plugins/${name}/init.js`)).default;
    const plugin = new Plugin(args) as PluginBase;
    plugin.logger = logger.child({
      plugin: name,
    });
    this.plugins[name] = plugin;
    await plugin.load(this);
    const state = this.states[name];
    if (state) {
      plugin.setState(state);
    }
    logger.warn(`Plugin ${name} is loaded`);
  }

  async unloadPlugin(name: string) {
    if (!(name in this.plugins)) {
      throw new Error(`Plugin ${name} not loaded`);
    }
    this.gatherState(name);
    await this.plugins[name].unload(this);
    delete this.plugins[name];
    logger.warn(`Plugin ${name} is unloaded`);
  }

  registerTool<
    Args extends Dict<ITalosArgument>,
    RetArgs extends Dict<ITalosArgument>,
    Tool extends ITalosTool<Args, RetArgs>,
  >(
    config: {
      name: string;
      desc: string;
      risk?: ITalosRisk;
      privacy?: ITalosPrivacyMetadata;
      args: Args;
      retvals: RetArgs;
    },
    toolImpl: {
      fn: Tool["fn"];
      explain_args?: Tool["explain_args"];
      explain_retvals?: Tool["explain_retvals"];
    },
  ) {
    const tool = {
      ...config,
      ...toolImpl,
    };
    if (tool.name in this.tools) {
      throw new Error(`Tool ${tool.name} already registered`);
    }
    this.tools[tool.name] = tool as unknown as ITalosTool<any, any>;
    logger.warn(`Tool ${tool.name} is registered`);
  }

  registerNetwork(plugin: string, network: ITalosNetworkMetadata) {
    this.network[plugin] = network;
    this.audit
      .append({
        kind: "network_endpoint",
        summary: `${network.name} endpoints registered.`,
        endpoint: network.endpoints.join(", "),
      })
      .catch((error) =>
        logger.error(`Failed to audit network metadata: ${error}`),
      );
  }

  deregisterTool(name: string) {
    if (!(name in this.tools)) {
      throw new Error(`Tool ${name} not registered`);
    }
    delete this.tools[name];
    logger.warn(`Tool ${name} is deregistered`);
  }

  registerEvent(event: ITalosEvent) {
    if (event.name in this.events) {
      throw new Error(`Event ${event.name} already registered`);
    }
    this.events[event.name] = event;
    logger.warn(`Event ${event.name} is registered`);
  }

  deregisterEvent(name: string) {
    if (!(name in this.events)) {
      throw new Error(`Event ${name} not registered`);
    }
    delete this.events[name];
    logger.warn(`Event ${name} is deregistered`);
  }

  gatherState(plugin: string) {
    if (!(plugin in this.plugins)) {
      throw new Error(`Plugin ${plugin} not loaded`);
    }
    const state = this.plugins[plugin].state();
    if (state) {
      this.states[plugin] = state;
    }
  }

  gatherStates() {
    for (const plugin of Object.keys(this.plugins)) {
      try {
        this.gatherState(plugin);
      } catch (error) {
        logger.error(`Failed to gather state for plugin ${plugin}: ${error}`);
      }
    }
  }

  async callTool(name: string, args: Dict<any>) {
    if (!(name in this.tools)) {
      throw new Error(`Tool ${name} not registered`);
    }
    const tool = this.tools[name];
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }
    const risk = tool.risk ?? "unknown";
    const approvalRequired = this.isApprovalRequired(tool);
    await this.audit.append({
      kind: "tool_call",
      tool: name,
      risk,
      summary: `Calling ${name}.`,
      redactedArgs: redact(args, this.config),
    });
    if (approvalRequired) {
      const approved = await this.requestApproval({
        tool: name,
        risk,
        args,
        summary: tool.explain_args?.(args).summary ?? `Approve ${name}?`,
      });
      await this.audit.append({
        kind: "approval",
        tool: name,
        risk,
        approved,
        summary: `${name} was ${approved ? "approved" : "denied"}.`,
        redactedArgs: redact(args, this.config),
      });
      if (!approved) {
        throw new Error(`Tool call denied by user: ${name}`);
      }
    }
    if (tool.explain_args) {
      this.emitPrivateEvent("talos/tool-call", tool.explain_args(args));
    }
    const retvals = await tool.fn(args);
    await this.audit.append({
      kind: "tool_result",
      tool: name,
      risk,
      summary: `${name} completed.`,
      redactedResult: redact(retvals, this.config),
    });
    if (tool.explain_retvals) {
      this.emitPrivateEvent(
        "talos/tool-result",
        tool.explain_retvals(args, retvals),
      );
    }
    return retvals;
  }

  isApprovalRequired(tool: ITalosTool<any, any>) {
    const risk = tool.risk ?? "unknown";
    const allowlist = this.config.privacy?.approvals?.allowlist ?? [];
    if (allowlist.includes(tool.name)) {
      return false;
    }
    if (risk === "read" || risk === "network") {
      return false;
    }
    return true;
  }

  requestApproval(request: Omit<ITalosApprovalRequest, "id" | "created_at">) {
    const approvalRequest: ITalosApprovalRequest = {
      id: makeId("approval"),
      created_at: new Date().toISOString(),
      ...request,
      args: redact(request.args, this.config) as Dict<any>,
    };
    this.approvals.push(approvalRequest);
    return new Promise<boolean>((resolve) => {
      this.approvalQueue.push({ request: approvalRequest, resolve });
      this.emitPrivateEvent("privacy/approval-queued", {
        request: approvalRequest,
        queue_length: this.approvalQueue.length,
      });
      this.processApprovalQueue();
    });
  }

  processApprovalQueue() {
    if (this.activeApproval || this.approvalQueue.length === 0) {
      return;
    }
    this.activeApproval = this.approvalQueue.shift();
    if (!this.activeApproval) {
      return;
    }
    this.emitPrivateEvent("privacy/approval-requested", {
      request: this.activeApproval.request,
      queue_length: this.approvalQueue.length,
    });
  }

  decideApproval(id: string, approved: boolean) {
    if (!this.activeApproval || this.activeApproval.request.id !== id) {
      throw new Error(`Approval request ${id} is not active`);
    }
    const activeApproval = this.activeApproval;
    this.activeApproval = undefined;
    this.approvals = this.approvals.filter((approval) => approval.id !== id);
    activeApproval.resolve(approved);
    this.emitPrivateEvent("privacy/approval-resolved", {
      id,
      approved,
      queue_length: this.approvalQueue.length,
    });
    this.processApprovalQueue();
  }

  getApprovalSnapshot() {
    return {
      active: this.activeApproval?.request,
      queued: this.approvalQueue.map((item) => item.request),
    };
  }

  async getAuditTail(limit: number = 20) {
    return this.audit.tail(limit);
  }

  recordModelCall(model: string, endpoint: string, summary: string) {
    const record = {
      timestamp: new Date().toISOString(),
      model,
      endpoint,
      summary,
    };
    this.recentModelCalls.push(record);
    this.recentModelCalls = this.recentModelCalls.slice(-50);
    this.audit
      .append({
        kind: "model_call",
        model,
        endpoint,
        summary,
      })
      .catch((error) => logger.error(`Failed to audit model call: ${error}`));
  }

  emitEvent(name: string, args: Dict<any>) {
    if (!(name in this.events)) {
      throw new Error(`Event ${name} not registered`);
    }
    const event = this.events[name];
    if (event.explain_args) {
      this.emitPrivateEvent("talos/event", event.explain_args(args));
    }
    this.emit("event", name, args);
  }

  emitPrivateEvent(name: string, args: Dict<any>) {
    this.emit("private-event", name, args);
  }
}
