---
name: Live-room fairness
description: Timing and ranking decisions for competitive live quizzes.
---

Use the server's clock to calibrate each client's shared question deadline. Award time-based points in full-second bands and allow matching scores/correct counts to share a rank.

**Why:** Device clocks and ordinary network jitter made students who answered together appear out of sync and incorrectly separated in the standings.

**How to apply:** Any future live-game timer or ranking change must preserve a server-authoritative deadline, reconnecting realtime updates, and tie-safe ranking rather than relying on a browser's local clock or sub-second request arrival order.