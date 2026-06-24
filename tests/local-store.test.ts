import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Talos } from "../src/core/talos.js";
import LocalStore from "../src/plugins/local-store/init.js";

test("local store creates a key file and persists encrypted records", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "talos-store-test-"));
  const storeFile = path.join(dir, "store.json");
  const keyFile = path.join(dir, "store.key");
  const agent = new Talos(
    {
      audit_file: path.join(dir, "audit.jsonl"),
      privacy: {
        audit: { enabled: true },
        approvals: { allowlist: ["local-store/append"] },
      },
    },
    {},
  );
  const localStore = new LocalStore({
    file: storeFile,
    key_file: keyFile,
  });

  await localStore.load(agent);
  await agent.callTool("local-store/append", {
    collection: "memories",
    record: { text: "private note" },
  });

  const status = (await agent.callTool("local-store/status", {})) as {
    file: string;
    key_file: string;
  };
  assert.equal(status.file, storeFile);
  assert.equal(status.key_file, keyFile);

  const raw = await fs.readFile(storeFile, "utf8");
  assert.doesNotMatch(raw, /private note/);

  const records = (await agent.callTool("local-store/read", {
    collection: "memories",
  })) as { records: Array<{ text: string }> };
  assert.equal(records.records[0].text, "private note");
});
