import { ChildProcess, spawn } from "child_process";
import { EventEmitter } from "events";

export class ShellProcess extends EventEmitter {
  child: ChildProcess;
  stdout: string = "";
  stdoutTimeout?: NodeJS.Timeout;
  boundStdoutHandler: (data: string) => void = this.stdoutHandler.bind(this);

  constructor(command: string) {
    super();
    this.child = spawn(command, { shell: true });
    this.child.stdout?.on("data", this.boundStdoutHandler);
    this.child.stderr?.on("data", this.boundStdoutHandler);
    this.child.once("close", (code) => {
      if (this.stdoutTimeout) {
        clearTimeout(this.stdoutTimeout);
      }
      this.child.stdout?.off("data", this.boundStdoutHandler);
      this.child.stderr?.off("data", this.boundStdoutHandler);
      this.kill();
      this.emit("close", code);
    });
  }

  get pid(): number {
    return this.child.pid!;
  }

  write(data: string) {
    this.child.stdin?.write(data);
  }

  kill(signal?: NodeJS.Signals) {
    this.child.kill(signal);
  }

  stdoutHandler(data: string) {
    this.stdout += data;
    if (this.stdoutTimeout) {
      clearTimeout(this.stdoutTimeout);
    }
    this.stdoutTimeout = setTimeout(() => {
      this.emit("stdout", this.stdout);
      this.stdout = "";
    }, 2000);
  }
}
