import assert from "node:assert/strict";
import test from "node:test";

import { redact } from "../src/core/privacy.js";
import { TalosHarness } from "./harness/talos-harness.js";

test("read and network tools run without approval", async () => {
  const harness = await TalosHarness.create();
  harness.registerTool({ name: "test/read", risk: "read" });
  harness.registerTool({ name: "test/network", risk: "network" });

  assert.deepEqual(await harness.callTool("test/read", {}), { ok: true });
  assert.deepEqual(await harness.callTool("test/network", {}), { ok: true });
  assert.equal(harness.agent.getApprovalSnapshot().active, undefined);
  await harness.cleanup();
});

test("unannotated and risky tools require serialized approval", async () => {
  const harness = await TalosHarness.create();
  for (const [name, risk] of [
    ["test/unknown", undefined],
    ["test/write", "write"],
    ["test/execute", "execute"],
    ["test/destructive", "destructive"],
  ] as const) {
    harness.registerTool({ name, risk });
  }

  const calls = [
    harness.callTool("test/unknown", {}),
    harness.callTool("test/write", {}),
    harness.callTool("test/execute", {}),
    harness.callTool("test/destructive", {}),
  ];

  await harness.waitForApprovalCounts(1, 3);
  assert.deepEqual(
    [
      harness.agent.getApprovalSnapshot().active?.tool,
      ...harness.agent.getApprovalSnapshot().queued.map((item) => item.tool),
    ],
    ["test/unknown", "test/write", "test/execute", "test/destructive"],
  );

  await harness.drainApprovals(true);

  assert.deepEqual(await Promise.all(calls), [
    { ok: true },
    { ok: true },
    { ok: true },
    { ok: true },
  ]);
  await harness.cleanup();
});

test("denied tool calls reject and are audited", async () => {
  const harness = await TalosHarness.create();
  harness.registerTool({ name: "test/write", risk: "write" });

  const call = harness.callTool("test/write", {
    token: "should-not-log",
    file: "/tmp/work/.env",
  });
  await harness.denyNext();

  await assert.rejects(call, /denied/);
  const audit = await harness.auditTail(10);
  assert.equal(
    audit.some((record) => record.kind === "approval"),
    true,
  );
  assert.equal(
    audit.some(
      (record) => record.kind === "approval" && record.approved === false,
    ),
    true,
  );
  assert.equal(JSON.stringify(audit).includes("should-not-log"), false);
  assert.equal(JSON.stringify(audit).includes("/tmp/work/.env"), false);
  await harness.cleanup();
});

test("redaction removes obvious secrets and sensitive paths", () => {
  const redacted = redact({
    api_key: "sk-1234567890abcdef",
    nested: {
      authorization: "Bearer abc.def.ghi",
      path: "/tmp/project/.env",
    },
  });

  assert.deepEqual(redacted, {
    api_key: "[REDACTED]",
    nested: {
      authorization: "[REDACTED]",
      path: "[REDACTED_PATH]",
    },
  });
});
