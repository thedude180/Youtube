---
name: AI client request timeout
description: OpenAI/Anthropic SDK clients had no timeout, defaulting to 600s — root cause of 8-min AI slot holds when HTTP requests hung
---

## Rule
Every OpenAI and Anthropic SDK client constructor **must** include a `timeout` option.
- Text/chat clients: `timeout: 90_000` (90 seconds)
- Image generation clients: `timeout: 120_000` (120 seconds — DALL-E/gpt-image-1 can take 60s+)

## Why
The OpenAI Node.js SDK defaults to 600,000ms (10 minutes) if no timeout is set. The Anthropic SDK also has a high default. When the Replit AI integration gateway is under load or a TCP connection hangs, `fn()` inside `withRetry()` never resolves. The AI slot stays held until the 8-minute stuck-slot watchdog force-releases it — blocking up to 5 queued callers for the full 8 minutes on every stuck request.

## How to apply
- Any time a new `OpenAI({...})` or `new Anthropic({...})` constructor is added, include the appropriate timeout.
- The `withRetry()` wrapper in `openai.ts` / `claude.ts` releases the slot on error, so once the request times out (90s) the slot is freed correctly.
- Callers affected: repurpose-engine, pipelines, all background AI services — all go through `openai.ts`/`claude.ts` factories which are now patched at the constructor level.
