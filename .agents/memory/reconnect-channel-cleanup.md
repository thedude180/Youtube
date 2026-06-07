---
name: Reconnect channel cleanup
description: How stale youtube/youtubeshorts channels are pruned after OAuth reconnect
---

## Rule
Every successful YouTube OAuth reconnect (handleCallback in server/youtube.ts) now runs a Step 4 that deletes all OTHER youtube/youtubeshorts channels for the user, keeping only the just-saved pair.

## Why
Reconnecting creates a new channel row (incrementing ID) while leaving old dead rows (needs_reconnect=true, null tokens) behind. After a few reconnects you accumulate channels 50, 52, 53 etc. — publishers may pick up the wrong one, startup-orchestrator floods logs with "disconnected channel" warnings, and disconnection/reconnection breaks because deleteChannel() cascades fail on orphaned data.

## How to apply
- `storage.deleteChannel(id)` is the safe cascade-delete — always use it, never raw DELETE FROM channels
- Step 4 safety: it identifies the two active IDs (youtube + youtubeshorts), builds a Set, then calls deleteChannel on everything outside that Set
- Migration 017 is the one-time boot cleanup for existing stale rows — uses the same safety guard: only deletes if a connected replacement exists on the same platform
