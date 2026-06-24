import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import LocalStore from "../src/plugins/local-store/init.js";
import { TalosHarness } from "./harness/talos-harness.js";

test("local store creates a key file and persists encrypted records", async () => {
  const harness = await TalosHarness.create({
    approvalsAllowlist: ["local-store/append"],
  });
  const storeFile = harness.path("store.json");
  const keyFile = harness.path("store.key");
  const localStore = new LocalStore({
    file: storeFile,
    key_file: keyFile,
  });

  await harness.loadPluginInstance("local-store", localStore);
  await harness.callTool("local-store/append", {
    collection: "memories",
    record: { text: "private note" },
  });

  const status = (await harness.callTool("local-store/status", {})) as {
    file: string;
    key_file: string;
  };
  assert.equal(status.file, storeFile);
  assert.equal(status.key_file, keyFile);

  const raw = await fs.readFile(storeFile, "utf8");
  assert.doesNotMatch(raw, /private note/);

  const records = (await harness.callTool("local-store/read", {
    collection: "memories",
  })) as { records: Array<{ text: string }> };
  assert.equal(records.records[0].text, "private note");
  await harness.cleanup();
});
