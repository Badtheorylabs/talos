import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Talos } from "../src/core/talos.js";
import { redact } from "../src/core/privacy.js";

async function makeAgent() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "talos-test-"));
  const agent = new Talos(
    {
      audit_file: path.join(dir, "audit.jsonl"),
      privacy: {
        audit: { enabled: true },
        approvals: { allowlist: [] },
      },
    },
    {},
  );
  return { agent, dir };
}

test("read and network tools run without approval", async () => {
  const { agent } = await makeAgent();
  agent.registerTool(
    {
      name: "test/read",
      desc: "Read something.",
      risk: "read",
      args: {},
      retvals: { ok: { type: "boolean", desc: "OK.", required: true } },
    },
    { fn: async () => ({ ok: true }) },
  );
  agent.registerTool(
    {
      name: "test/network",
      desc: "Network something.",
      risk: "network",
      args: {},
      retvals: { ok: { type: "boolean", desc: "OK.", required: true } },
    },
    { fn: async () => ({ ok: true }) },
  );

  assert.deepEqual(await agent.callTool("test/read", {}), { ok: true });
  assert.deepEqual(await agent.callTool("test/network", {}), { ok: true });
  assert.equal(agent.getApprovalSnapshot().active, undefined);
});

test("unannotated and risky tools require serialized approval", async () => {
  const { agent } = await makeAgent();
  for (const [name, risk] of [
    ["test/unknown", undefined],
    ["test/write", "write"],
    ["test/execute", "execute"],
    ["test/destructive", "destructive"],
  ] as const) {
    agent.registerTool(
      {
        name,
        desc: name,
        risk,
        args: {},
        retvals: { ok: { type: "boolean", desc: "OK.", required: true } },
      },
      { fn: async () => ({ ok: true }) },
    );
  }

  const calls = [
    agent.callTool("test/unknown", {}),
    agent.callTool("test/write", {}),
    agent.callTool("test/execute", {}),
    agent.callTool("test/destructive", {}),
  ];

  while (
    !agent.getApprovalSnapshot().active ||
    agent.getApprovalSnapshot().queued.length < 3
  ) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(agent.getApprovalSnapshot().queued.length, 3);

  while (agent.getApprovalSnapshot().active) {
    agent.decideApproval(agent.getApprovalSnapshot().active!.id, true);
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.deepEqual(await Promise.all(calls), [
    { ok: true },
    { ok: true },
    { ok: true },
    { ok: true },
  ]);
});

test("denied tool calls reject and are audited", async () => {
  const { agent } = await makeAgent();
  agent.registerTool(
    {
      name: "test/write",
      desc: "Write something.",
      risk: "write",
      args: {},
      retvals: { ok: { type: "boolean", desc: "OK.", required: true } },
    },
    { fn: async () => ({ ok: true }) },
  );

  const call = agent.callTool("test/write", {});
  while (!agent.getApprovalSnapshot().active) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  agent.decideApproval(agent.getApprovalSnapshot().active!.id, false);

  await assert.rejects(call, /denied/);
  const audit = await agent.getAuditTail(10);
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
