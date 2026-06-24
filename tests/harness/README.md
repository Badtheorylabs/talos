# Talos Test Harness

`TalosHarness` runs Talos in-process with an isolated temp directory, audit log,
and approval queue. Use it for scenario tests that must not touch real model,
network, or user data paths.

Core helpers:

- `TalosHarness.create()` creates an isolated agent.
- `harness.path("file")` returns a path inside the temp workspace.
- `harness.loadPluginInstance(name, plugin)` loads a plugin without dynamic imports.
- `harness.loadConfiguredPlugins(config)` exercises the normal plugin loader.
- `harness.registerTool(...)` registers fake tools with risk metadata.
- `harness.approveNext()` / `harness.denyNext()` resolves the active approval.
- `harness.waitForApprovalCounts(active, queued)` asserts serialized approval state.
- `harness.auditRecords()` and `harness.waitForAudit(...)` inspect JSONL audit output.
- `harness.cleanup()` unloads plugins and removes the temp workspace.

Prefer scenario tests that verify privacy and self-improvement invariants:

- risky tools queue FIFO and wait for approval
- destructive tools cannot execute when denied
- audit output is redacted
- local storage never writes plaintext payloads
- skills do not become active without approval
- model and network transparency records are visible
