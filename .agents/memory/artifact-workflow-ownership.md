---
name: Artifact workflow ownership
description: Avoiding duplicate MedQrown preview processes and stale port listeners.
---

Run MedQrown through its artifact-owned workflow rather than creating a separate legacy preview workflow. If a legacy workflow is removed after it has started, verify that its process tree released port 5000 before restarting the managed artifact.

**Why:** A duplicate workflow left an orphaned Node process bound to port 5000, causing the registered artifact to fail with `EADDRINUSE` even though the page still appeared to render.

**How to apply:** Use the exact managed artifact workflow for starts and restarts. On `EADDRINUSE`, inspect the listener and process start time, terminate only the stale workflow tree, confirm the port is free, then restart the managed artifact once.