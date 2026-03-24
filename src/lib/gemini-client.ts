/**
 * Gemini API client for PACE Platform.
 *
 * Implements the standard call pattern from ADR-002:
 *   - 3 attempts with exponential back-off (0 / 1000 / 2000 ms)
 *   - Token usage tracking
 *   - Prompt injection sanitization
 *   - Output guardrail check
 *   - JSON response cleaning
 *
 * Usage:
 *   import { callGeminiWithRetry } from "@/lib/gemini-client";
 *
 *   const { result } = await callGeminiWithRetry(
 *     buildMyPrompt(data),
 *     (text) => JSON.parse(cleanJsonText(text)) as MyType,
 *     { userId: staff.id, endpoint: "soap-assist" }
 *   );
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { sanitizePrompt, containsHarmfulContent, cleanJsonText } from "@/lib/security";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export { cleanJsonText };

// ---------------------------------------------------------------------------
// Model configuration
// ---------------------------------------------------------------------------

const MODEL_ID = "gemini-2.0-flash";
const MAX_RETRIES = 3;

let _genAI: GoogleGenerativeAI | null = null;

function getModel() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _genAI.getGenerativeModel({ model: MODEL_ID });
}

// ---------------------------------------------------------------------------
// Token usage tracking
// ---------------------------------------------------------------------------

async function trackTokenUsage(userId: string, endpoint: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  try {
    const supabase = createServiceClient(url, key);
    await supabase.from("gemini_token_log").insert({
      staff_id: userId,
      endpoint,
      called_at: new Date().toISOString(),
    });
  } catch {
    // Non-critical — token log failure must not block the request
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GeminiCallContext {
  userId: string;
  endpoint: string;
}

export interface GeminiResult<T> {
  result: T;
  /** true when all retries failed and a caller-supplied fallback was used */
  fallback: false;
}

/**
 * Call Gemini with automatic retry, sanitization, and guardrail checks.
 *
 * @param prompt   The full prompt string (will be sanitized internally)
 * @param parser   Function to parse the raw text response into T
 * @param context  Optional user + endpoint info for rate-limit and token tracking
 *
 * @throws Error("GEMINI_EXHAUSTED") when all retries are exhausted
 * @throws Error("RATE_LIMIT_EXCEEDED") when the user has hit the rate limit
 */
export async function callGeminiWithRetry<T>(
  prompt: string,
  parser: (text: string) => T,
  context?: GeminiCallContext
): Promise<GeminiResult<T>> {
  // Rate-limit check (before any Gemini call)
  if (context) {
    const rl = await checkRateLimit(context.userId, context.endpoint);
    if (!rl.allowed) {
      throw new Error("RATE_LIMIT_EXCEEDED");
    }
  }

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Exponential back-off: 0ms → 1000ms → 2000ms
    const delay = attempt > 0 ? Math.pow(2, attempt) * 500 : 0;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));

    try {
      // Track token usage (best-effort, non-blocking)
      if (context) {
        await trackTokenUsage(context.userId, context.endpoint);
      }

      // Sanitize user-supplied content embedded in the prompt
      const sanitizedPrompt = sanitizePrompt(prompt);

      const model = getModel();
      const response = await model.generateContent(sanitizedPrompt);
      const text = response.response.text();

      // Output guardrail — reject medically dangerous claims
      if (containsHarmfulContent(text)) {
        throw new Error("GUARDRAIL_VIOLATION");
      }

      return { result: parser(text), fallback: false };
    } catch (err) {
      lastError = err;

      // Don't retry guardrail violations — they indicate a prompt issue
      if (err instanceof Error && err.message === "GUARDRAIL_VIOLATION") {
        console.error("[gemini] guardrail violation on attempt", attempt + 1);
        break;
      }

      console.warn(`[gemini] attempt ${attempt + 1}/${MAX_RETRIES} failed:`, err);
    }
  }

  console.error("[gemini] all retries exhausted:", lastError);
  throw new Error("GEMINI_EXHAUSTED");
}

/**
 * Builds a safe system-context prefix that reminds Gemini of its CDS role.
 * Prepend this to every prompt to reinforce guardrails.
 */
export function buildCdsSystemPrefix(): string {
  return `あなたはスポーツ医学クリニカル・ディシジョン・サポート（CDS）AIアシスタントです。
以下のルールを厳守してください：
1. 医療診断を断言しないこと（「〇〇です」「〇〇と診断します」は禁止）
2. 処方・投薬指示を出さないこと
3. 外科的処置を推奨しないこと
4. 最終判断は必ず有資格スタッフが行う旨を意識した記述にすること
5. 出力は必ず指定されたJSON形式のみとすること（説明文・マークダウン不要）

`;
}
