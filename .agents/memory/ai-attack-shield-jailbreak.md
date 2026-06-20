---
name: AI attack shield broad-pattern false positive
description: sanitizeForPrompt /jailbreak/i fires on legitimate AI-topic video titles, corrupting prompts and creating false security events
---

## Rule
Never add bare single-word patterns like `/jailbreak/i` to `PROMPT_INJECTION_PATTERNS` in `server/lib/ai-attack-shield.ts`. They match legitimate discussion of AI/security topics in video metadata.

**Why:** `sanitizeForPrompt()` is called on stored video titles and descriptions before injecting them into AI prompts. A channel covering AI content will have titles like "jailbreaks and guardrail bypasses" or "prompt injection/jailbreak evolution" — bare `/jailbreak/i` silently replaces these with `[FILTERED]`, corrupting AI-generated metadata and logging mass false security events.

**How to apply:** Always require imperative context around topic words. The fixed pattern:
```js
/\bjailbreak\s+(?:this|me|you|the\s+(?:ai|model|bot|llm|chatbot|system|assistant|safety\s+filter|guardrail)|mode\b)/i
```
This matches "jailbreak the AI / model / system" but not "jailbreaks discussed in a video title".

Same caution applies to other topic words: `/hypothetically\s+(speaking|if)/i` could fire on gaming scripts; `/for\s+educational\s+purposes\s+only/i` could fire on disclaimer language. Prefer multi-word patterns with imperative framing over single-word or short-phrase patterns.
