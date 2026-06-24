import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import Skills from "../src/plugins/skills/init.js";
import Task from "../src/plugins/task/init.js";
import { TalosHarness } from "./harness/talos-harness.js";

async function makeHarness() {
  const harness = await TalosHarness.create({
    approvalsAllowlist: [
      "task/start",
      "task/complete",
      "task/reflect",
      "skills/create-draft",
    ],
  });
  const skills = new Skills({ directory: harness.path("skills") });
  const task = new Task({});
  await harness.loadPluginInstance("skills", skills);
  await harness.loadPluginInstance("task", task);
  return { harness, skills };
}

test("task reflection can propose a local skill draft", async () => {
  const { harness } = await makeHarness();
  const started = (await harness.callTool("task/start", {
    title: "write a weekly research brief",
  })) as { id: string };
  await harness.callTool("task/complete", { id: started.id });
  await harness.callTool("task/reflect", {
    id: started.id,
    reflection: "This workflow should become a reusable research brief skill.",
    proposed_skill_name: "weekly-brief",
    proposed_skill_content:
      "# Weekly Brief\n\nCollect sources, summarize, and list next actions.\n",
  });

  const skill = await fs.readFile(
    path.join(harness.dir, "skills", "weekly-brief", "SKILL.md"),
    "utf8",
  );
  assert.match(skill, /Collect sources/);

  const tasks = (await harness.callTool("task/list", {})) as { tasks: any[] };
  assert.equal(tasks.tasks[0].reflection?.includes("reusable"), true);
  await harness.cleanup();
});

test("skill activation requires approval before active prompt summaries change", async () => {
  const { harness, skills } = await makeHarness();
  await harness.callTool("skills/create-draft", {
    name: "brief-review",
    content: "# Brief Review\n\nCheck claims, sources, and next actions.\n",
  });

  assert.deepEqual(await skills.activeSkillSummaries(), []);

  const activation = harness.callTool("skills/activate", {
    name: "brief-review",
  });
  const request = await harness.approveNext();
  assert.equal(request.tool, "skills/activate");
  await activation;

  const summaries = await skills.activeSkillSummaries();
  assert.equal(summaries.length, 1);
  assert.match(summaries[0], /Brief Review/);
  await harness.cleanup();
});
