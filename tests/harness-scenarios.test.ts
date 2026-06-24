import assert from "node:assert/strict";
import test from "node:test";

import Clock from "../src/plugins/clock/init.js";
import TalosPlugin from "../src/plugins/talos/init.js";
import { TalosHarness } from "./harness/talos-harness.js";

test("approval harness preserves FIFO order for concurrent risky calls", async () => {
  const harness = await TalosHarness.create();
  const executed: string[] = [];

  for (const name of ["first", "second", "third"]) {
    harness.registerTool({
      name: `test/${name}`,
      risk: "write",
      fn: async () => {
        executed.push(name);
        return { ok: true };
      },
    });
  }

  const calls = [
    harness.callTool("test/first", {}),
    harness.callTool("test/second", {}),
    harness.callTool("test/third", {}),
  ];

  await harness.waitForApprovalCounts(1, 2);
  assert.deepEqual(
    [
      harness.agent.getApprovalSnapshot().active?.tool,
      ...harness.agent.getApprovalSnapshot().queued.map((item) => item.tool),
    ],
    ["test/first", "test/second", "test/third"],
  );

  assert.equal(executed.length, 0);
  assert.equal((await harness.approveNext()).tool, "test/first");
  await calls[0];
  assert.deepEqual(executed, ["first"]);
  assert.equal((await harness.approveNext()).tool, "test/second");
  await calls[1];
  assert.deepEqual(executed, ["first", "second"]);
  assert.equal((await harness.approveNext()).tool, "test/third");
  await calls[2];
  assert.deepEqual(executed, ["first", "second", "third"]);
  await harness.cleanup();
});

test("talos/load-plugin is destructive and cannot execute without approval", async () => {
  const harness = await TalosHarness.create();
  await harness.loadPluginInstance("talos", new TalosPlugin({}));

  const call = harness.callTool("talos/load-plugin", {
    name: "skills",
    args: { directory: harness.path("skills") },
  });
  const request = await harness.denyNext();

  assert.equal(request.tool, "talos/load-plugin");
  assert.equal(request.risk, "destructive");
  await assert.rejects(call, /denied/);
  assert.equal("skills/list" in harness.agent.tools, false);
  await harness.cleanup();
});

test("clock timers expose stable IDs and clear by ID", async () => {
  const harness = await TalosHarness.create();
  await harness.loadPluginInstance("clock", new Clock({}));

  const timer = harness.callTool("clock/set-timer", {
    seconds: 60,
    reason: "scenario harness timer",
    recurring: false,
  });
  assert.equal((await harness.approveNext()).tool, "clock/set-timer");
  await timer;

  const listed = (await harness.callTool("clock/list-timeouts", {})) as {
    timeouts: Array<{ id: string; reason: string }>;
  };
  assert.equal(listed.timeouts.length, 1);
  assert.match(listed.timeouts[0].id, /^timeout_/);
  assert.equal(listed.timeouts[0].reason, "scenario harness timer");

  const clear = harness.callTool("clock/clear-timeout", {
    id: listed.timeouts[0].id,
  });
  assert.equal((await harness.approveNext()).tool, "clock/clear-timeout");
  await clear;

  const afterClear = (await harness.callTool("clock/list-timeouts", {})) as {
    timeouts: Array<{ id: string }>;
  };
  assert.deepEqual(afterClear.timeouts, []);
  await harness.cleanup();
});

test("audit harness captures model calls and registered network endpoints", async () => {
  const harness = await TalosHarness.create();
  harness.agent.registerNetwork("test-network", {
    name: "Test Network",
    endpoints: ["https://api.example.test/v1"],
    sendsUserData: true,
  });
  harness.agent.recordModelCall(
    "test-model",
    "https://models.example.test/v1",
    "Harness model call.",
  );

  const audit = await harness.waitForAudit(
    (records) =>
      records.some(
        (record) =>
          record.kind === "network_endpoint" &&
          record.endpoint === "https://api.example.test/v1",
      ) &&
      records.some(
        (record) =>
          record.kind === "model_call" && record.model === "test-model",
      ),
    "network and model audit records",
  );
  assert.equal(
    audit.some(
      (record) =>
        record.kind === "network_endpoint" &&
        record.endpoint === "https://api.example.test/v1",
    ),
    true,
  );
  assert.equal(
    audit.some(
      (record) => record.kind === "model_call" && record.model === "test-model",
    ),
    true,
  );
  await harness.cleanup();
});
