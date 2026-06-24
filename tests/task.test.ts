import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Talos } from "../src/core/talos.js";
import Skills from "../src/plugins/skills/init.js";
import Task from "../src/plugins/task/init.js";

async function makeAgent() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "talos-task-test-"));
  const agent = new Talos(
    {
      audit_file: path.join(dir, "audit.jsonl"),
      privacy: {
        audit: { enabled: true },
        approvals: {
          allowlist: [
            "task/start",
            "task/complete",
            "task/reflect",
            "skills/create-draft",
          ],
        },
      },
    },
    {},
  );
  const skills = new Skills({ directory: path.join(dir, "skills") });
  const task = new Task({});
  agent.plugins.skills = skills;
  agent.plugins.task = task;
  await skills.load(agent);
  await task.load(agent);
  return { agent, dir };
}

test("task reflection can propose a local skill draft", async () => {
  const { agent, dir } = await makeAgent();
  const started = (await agent.callTool("task/start", {
    title: "write a weekly research brief",
  })) as { id: string };
  await agent.callTool("task/complete", { id: started.id });
  await agent.callTool("task/reflect", {
    id: started.id,
    reflection: "This workflow should become a reusable research brief skill.",
    proposed_skill_name: "weekly-brief",
    proposed_skill_content:
      "# Weekly Brief\n\nCollect sources, summarize, and list next actions.\n",
  });

  const skill = await fs.readFile(
    path.join(dir, "skills", "weekly-brief", "SKILL.md"),
    "utf8",
  );
  assert.match(skill, /Collect sources/);

  const tasks = (await agent.callTool("task/list", {})) as { tasks: any[] };
  assert.equal(tasks.tasks[0].reflection?.includes("reusable"), true);
});
