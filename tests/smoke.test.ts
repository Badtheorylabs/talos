import assert from "node:assert/strict";
import test from "node:test";

import { TalosHarness } from "./harness/talos-harness.js";

test("Talos loads the local-first control plane without model credentials", async () => {
  const harness = await TalosHarness.create();

  await harness.loadConfiguredPlugins({
    clock: {},
    skills: { directory: harness.path("skills") },
    task: {},
    "generated-plugins": { directory: harness.path("generated-plugins") },
    "local-store": {
      file: harness.path("store.json"),
      key_file: harness.path("store.key"),
    },
    talos: {},
  });
  assert.equal("talos/load-plugin" in harness.agent.tools, true);
  assert.equal("skills/list" in harness.agent.tools, true);
  assert.equal("task/list" in harness.agent.tools, true);
  assert.equal("local-store/status" in harness.agent.tools, true);
  await harness.cleanup();
});
