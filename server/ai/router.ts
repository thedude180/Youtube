/**
 * AI model router — picks the right model + provider per task type.
 *
 * Rule: cheap model for high-volume / low-stakes tasks; strong model for
 * strategy / complex reasoning. Never pay Opus prices for a tag suggestion.
 */
import { getOpenAI, getOpenAIBackground } from "./openai.js";
import { callClaude, MODELS } from "./claude.js";

export type TaskType =
  | "tag-suggest"          // cheap: short, formulaic
  | "title-suggest"        // cheap: short, formulaic
  | "description-draft"    // medium: structured but lengthy
  | "thumbnail-concept"    // cheap: short creative prompt
  | "content-strategy"     // strong: multi-step reasoning
  | "competitive-analysis" // strong: long-context analysis
  | "business-insight"     // strong: strategic reasoning
  | "chat-reply"           // medium: conversational
  | "summarize"            // cheap: extractive
  | "seo-optimize"         // cheap: keyword matching
  | "script-draft";        // medium: creative long-form

type Provider = "openai-mini" | "openai-4o" | "claude-haiku" | "claude-sonnet" | "claude-opus";

const TASK_MODEL: Record<TaskType, Provider> = {
  "tag-suggest":          "openai-mini",
  "title-suggest":        "openai-mini",
  "description-draft":    "openai-mini",
  "thumbnail-concept":    "openai-mini",
  "content-strategy":     "claude-sonnet",
  "competitive-analysis": "claude-sonnet",
  "business-insight":     "claude-opus",
  "chat-reply":           "openai-mini",
  "summarize":            "openai-mini",
  "seo-optimize":         "openai-mini",
  "script-draft":         "openai-mini",
};

export interface RouteParams {
  task: TaskType;
  system?: string;
  prompt: string;
  maxTokens?: number;
  background?: boolean;
}

export async function aiRoute(params: RouteParams): Promise<string> {
  const provider = TASK_MODEL[params.task];
  const bg = params.background ?? false;

  if (provider.startsWith("claude-")) {
    const modelMap: Record<string, string> = {
      "claude-haiku":  MODELS.haiku,
      "claude-sonnet": MODELS.sonnet,
      "claude-opus":   MODELS.opus,
    };
    const result = await callClaude({
      system: params.system,
      prompt: params.prompt,
      model: modelMap[provider] as any,
      maxTokens: params.maxTokens,
      background: bg,
    });
    return result.content;
  }

  // OpenAI path
  const client = bg ? getOpenAIBackground() : getOpenAI();
  const model = provider === "openai-4o" ? "gpt-4o" : "gpt-4o-mini";

  const messages: any[] = [];
  if (params.system) messages.push({ role: "system", content: params.system });
  messages.push({ role: "user", content: params.prompt });

  const resp = await client.chat.completions.create({
    model,
    messages,
    max_tokens: params.maxTokens ?? 1_000,
  });

  return resp.choices[0]?.message?.content ?? "";
}

/** Structured JSON output — parses and validates shape before returning. */
export async function aiRouteJSON<T>(
  params: RouteParams,
  validate: (raw: unknown) => T,
): Promise<T> {
  const text = await aiRoute({ ...params, prompt: `${params.prompt}\n\nRespond with valid JSON only.` });
  const trimmed = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  try {
    return validate(JSON.parse(trimmed));
  } catch (err) {
    throw new Error(`AI returned invalid JSON for task "${params.task}": ${(err as Error).message}`);
  }
}
