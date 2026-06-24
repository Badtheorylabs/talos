import { Talos, Dict } from "../../core/talos.js";
import { makeId } from "../../core/privacy.js";
import { PluginBase } from "../plugin-base.js";

interface ITimeout {
  id: string;
  reason: string;
  next_trigger_time: number;
  recurring: boolean;
  interval: number;
}

export default class Clock extends PluginBase {
  agent!: Talos;
  timeouts: ITimeout[] = [];
  timeout?: NodeJS.Timeout;

  async load(agent: Talos) {
    this.agent = agent;
    agent.registerEvent({
      name: "clock/timeout-triggered",
      desc: "This event is triggered when a timeout is reached.",
      args: {
        reason: {
          type: "string",
          desc: "The reason why the timeout was triggered.",
          required: true,
        },
        recurring: {
          type: "boolean",
          desc: "Whether the timeout is recurring.",
          required: true,
        },
        interval: {
          type: "number",
          desc: "The interval of the timeout.",
          required: true,
        },
        now: {
          type: "string",
          desc: "The current date and time.",
          required: true,
        },
      },
      explain_args: (args: Dict<any>) => ({
        summary: "A timeout was triggered.",
        details: args.reason,
      }),
    });
    agent.registerTool(
      {
        name: "clock/get-time",
        desc: "Get the current date and time.",
        risk: "read",
        args: {},
        retvals: {
          time: {
            type: "string",
            desc: "The current date and time.",
            required: true,
          },
        },
      },
      {
        fn: async () => {
          return { time: new Date().toString() };
        },
        explain_args: () => ({
          summary: "Getting the current date and time...",
        }),
        explain_retvals: (args: Dict<any>, retvals: Dict<any>) => ({
          summary: `The current date and time is ${retvals.time}.`,
        }),
      },
    );
    agent.registerTool(
      {
        name: "clock/set-timer",
        desc: "Set a timer.",
        risk: "write",
        args: {
          seconds: {
            type: "number",
            desc: "The number of seconds to wait before triggering the timer.",
            required: false,
          },
          minutes: {
            type: "number",
            desc: "The number of minutes to wait before triggering the timer.",
            required: false,
          },
          hours: {
            type: "number",
            desc: "The number of hours to wait before triggering the timer.",
            required: false,
          },
          reason: {
            type: "string",
            desc: "The reason why the timer was set. Include as much detail as possible.",
            required: true,
          },
          recurring: {
            type: "boolean",
            desc: "Whether the timer is recurring.",
            required: true,
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
          const interval =
            (args.seconds || 0) * 1000 +
            (args.minutes || 0) * 60 * 1000 +
            (args.hours || 0) * 60 * 60 * 1000;
          this.timeouts.push({
            id: makeId("timeout"),
            reason: args.reason,
            next_trigger_time: Date.now() + interval,
            recurring: args.recurring,
            interval,
          });
          this.updateTimeout();
          return { status: "success" };
        },
        explain_args: (args: Dict<any>) => ({
          summary: `Setting a ${
            args.recurring ? "recurring" : "one-time"
          } timer for ${args.hours || 0} hours, ${
            args.minutes || 0
          } minutes, and ${args.seconds || 0} seconds...`,
          details: args.reason,
        }),
      },
    );
    agent.registerTool(
      {
        name: "clock/set-alarm",
        desc: "Set an alarm.",
        risk: "write",
        args: {
          time: {
            type: "string",
            desc: "The date and time to set the alarm for. Need to specify timezone.",
            required: true,
          },
          reason: {
            type: "string",
            desc: "The reason why the alarm was set. Include as much detail as possible.",
            required: true,
          },
          recurring: {
            type: "boolean",
            desc: "Whether the alarm is recurring.",
            required: true,
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
          const time = new Date(args.time);
          const now = new Date();
          if (time <= now) {
            throw new Error("Alarm time must be in the future.");
          }
          this.timeouts.push({
            id: makeId("timeout"),
            reason: args.reason,
            next_trigger_time: time.getTime(),
            recurring: args.recurring,
            interval: 24 * 60 * 60 * 1000,
          });
          this.updateTimeout();
          return { status: "success" };
        },
        explain_args: (args: Dict<any>) => ({
          summary: `Setting a ${
            args.recurring ? "recurring" : "one-time"
          } alarm for ${args.time}...`,
          details: args.reason,
        }),
      },
    );
    agent.registerTool(
      {
        name: "clock/clear-timeout",
        desc: "Clear a timeout.",
        risk: "write",
        args: {
          id: {
            type: "string",
            desc: "The stable ID of the timeout to clear.",
            required: true,
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
          this.timeouts = this.timeouts.filter(
            (timeout) => timeout.id !== args.id,
          );
          this.updateTimeout();
          return { status: "success" };
        },
        explain_args: (args: Dict<any>) => ({
          summary: `Clearing the timeout ${args.id}...`,
        }),
      },
    );
    agent.registerTool(
      {
        name: "clock/list-timeouts",
        desc: "List all timeouts.",
        risk: "read",
        args: {},
        retvals: {
          timeouts: {
            type: "array",
            desc: "The list of timeouts.",
            required: true,
            of: {
              type: "object",
              desc: "A timeout.",
              required: true,
              of: {
                id: {
                  type: "string",
                  desc: "The stable ID of the timeout.",
                  required: true,
                },
                reason: {
                  type: "string",
                  desc: "The reason why the timeout was set.",
                  required: true,
                },
                next_trigger_time: {
                  type: "string",
                  desc: "The next trigger time of the timeout.",
                  required: true,
                },
                recurring: {
                  type: "boolean",
                  desc: "Whether the timeout is recurring.",
                  required: true,
                },
                interval: {
                  type: "number",
                  desc: "The interval of the timeout, in seconds.",
                  required: true,
                },
              },
            },
          },
        },
      },
      {
        fn: async () => {
          return {
            timeouts: this.timeouts.map((t) => ({
              id: t.id,
              reason: t.reason,
              next_trigger_time: new Date(t.next_trigger_time).toString(),
              recurring: t.recurring,
              interval: t.interval / 1000,
            })),
          };
        },
      },
    );
  }

  async unload(agent: Talos) {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    agent.deregisterEvent("clock/timeout-triggered");
    agent.deregisterTool("clock/get-time");
    agent.deregisterTool("clock/set-timer");
    agent.deregisterTool("clock/set-alarm");
    agent.deregisterTool("clock/clear-timeout");
    agent.deregisterTool("clock/list-timeouts");
  }

  state() {
    return {
      timeouts: this.timeouts,
    };
  }

  setState(state: Dict<any>) {
    this.timeouts = state.timeouts;
    this.timeouts = this.timeouts.map((timeout) => ({
      ...timeout,
      id: timeout.id ?? makeId("timeout"),
    }));
    const now = Date.now();
    this.timeouts = this.timeouts.filter((t) => {
      if (t.next_trigger_time > now) {
        return true;
      }
      if (t.recurring) {
        while (t.next_trigger_time <= now) {
          t.next_trigger_time += t.interval;
        }
        return true;
      }
      return false;
    });
    this.updateTimeout();
  }

  updateTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    if (this.timeouts.length === 0) {
      return;
    }
    const closestNextTriggerTime = this.timeouts.reduce((min, t) => {
      return Math.min(min, t.next_trigger_time);
    }, Infinity);
    this.timeout = setTimeout(() => {
      const now = Date.now();
      const firedTimeouts = this.timeouts.filter(
        (t) => t.next_trigger_time <= now,
      );
      for (const timeout of firedTimeouts) {
        this.agent.emitEvent("clock/timeout-triggered", {
          reason: timeout.reason,
          recurring: timeout.recurring,
          interval: timeout.interval,
          now: new Date().toString(),
        });
      }
      this.timeouts = this.timeouts.filter((t) => {
        if (t.next_trigger_time > now) {
          return true;
        }
        if (t.recurring) {
          while (t.next_trigger_time <= now) {
            t.next_trigger_time += t.interval;
          }
          return true;
        }
        return false;
      });
      this.updateTimeout();
    }, closestNextTriggerTime - Date.now());
  }
}
