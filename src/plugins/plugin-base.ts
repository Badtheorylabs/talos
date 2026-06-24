import { Logger } from "winston";

import { Talos, Dict } from "../core/talos.js";

export abstract class PluginBase {
  config: Dict<any>;
  logger!: Logger;

  constructor(config: Dict<any>) {
    this.config = config;
  }

  desc(): string | null {
    return null;
  }

  async load(agent: Talos): Promise<void> {}

  async unload(agent: Talos): Promise<void> {}

  state(): Dict<any> | null {
    return null;
  }

  setState(state: Dict<any>): void {}
}
