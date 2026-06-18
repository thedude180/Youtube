---
name: gpt-5 temperature rejection
description: gpt-5 rejects any temperature parameter other than the default (1.0) with HTTP 400; fix pattern for this codebase.
---

## Rule
Never pass `temperature` to `gpt-5`. The model returns HTTP 400 "Unsupported value: 'temperature' does not support X with this model. Only the default (1) value is supported."

**Why:** gpt-5 is a reasoning-class model; temperature is fixed at 1.0 by design. ~40 services in this codebase call gpt-5 directly with temperature values copied from older gpt-4o patterns.

**How to apply:**
- The fix is already in `server/lib/openai.ts` — both `getOpenAIClient()` and `getOpenAIClientBackground()` automatically strip `temperature` from any call where `params.model === "gpt-5"`. New callers do NOT need to worry about this.
- `server/services/ai-model-router.ts` TASK_MAPPINGS for gpt-5 entries also have temperature removed, and `executeRoutedAICall` guards the OpenAI path.
- Do NOT add `temperature` to any new `gpt-5` call — it will be silently dropped by the client interceptor anyway, but keeping the source clean avoids confusion.
- Claude models (sonnet, opus, haiku) DO support custom temperature — leave those alone.
