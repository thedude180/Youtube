---
name: gpt-5 max_tokens rejection
description: gpt-5 rejects max_tokens with HTTP 400 — must use max_completion_tokens instead; strip/remap at the factory client layer so all callers are fixed in one place.
---

## Rule
gpt-5 **rejects** the `max_tokens` parameter with:
```
400 Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
```

Always use `max_completion_tokens` when targeting gpt-5.

## Why
This is a breaking API difference between gpt-5 and earlier models (gpt-4o, gpt-4o-mini). The fix is applied at the factory-client layer in `server/lib/openai.ts` in both `getOpenAIClient()` and `getOpenAIClientBackground()` wrappers — the same block that already strips `temperature` for gpt-5. Any `max_tokens` in the params is remapped to `max_completion_tokens` before hitting the wire, fixing all callers in one place.

## How to apply
- New callers that use `getOpenAIClient()` or `getOpenAIClientBackground()`: can pass either `max_tokens` or `max_completion_tokens` — both will work after the remap.
- Callers that use `getRawOpenAIClientForDirectUse()` or `getRawOpenAIClient()` bypass the remap — must use `max_completion_tokens` directly if targeting gpt-5.
- The `callOpenAI()` convenience function goes through the factory client and is safe.
- This is analogous to the `temperature` stripping already in place — same pattern, same location.
