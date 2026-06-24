import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Talos } from "../src/core/talos.js";

test("Talos loads the local-first control plane without model credentials", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "talos-smoke-test-"));
  const agent = new Talos(
    {
      audit_file: path.join(dir, "audit.jsonl"),
      privacy: {
        audit: { enabled: true },
        approvals: { allowlist: [] },
      },
      plugins: {
        clock: {},
        skills: { directory: path.join(dir, "skills") },
        task: {},
        "generated-plugins": { directory: path.join(dir, "generated-plugins") },
        "local-store": {
          file: path.join(dir, "store.json"),
          key_file: path.join(dir, "store.key"),
        },
        talos: {},
      },
    },
    {},
  );

  await agent.loadPlugins();
  assert.equal("talos/load-plugin" in agent.tools, true);
  assert.equal("skills/list" in agent.tools, true);
  assert.equal("task/list" in agent.tools, true);
  assert.equal("local-store/status" in agent.tools, true);
  await agent.unloadPlugins();
});
