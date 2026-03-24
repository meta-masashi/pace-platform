/**
 * LLM security helpers for PACE Platform.
 *
 * Two concerns:
 *   1. INPUT  — sanitize user-supplied text before injecting into prompts
 *   2. OUTPUT — detect harmful content in Gemini responses before showing to staff
 *
 * All patterns and limits are documented in ADR-002 and ADR-009.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard token budget for any single prompt sent to Gemini (~8000 chars ≈ 2000 tokens) */
const MAX_PROMPT_CHARS = 8_000;

// ---------------------------------------------------------------------------
// Input sanitization
// ---------------------------------------------------------------------------

/**
 * Patterns that indicate an attempt to override the system prompt or
 * inject adversarial instructions into a user-supplied string.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(previous|above|all)\s+instructions/i,
  /you\s+are\s+now\s+a/i,
  /system\s*:\s*you/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
  /\[SYSTEM\]/i,
  /DAN\s+mode/i,
  /jailbreak/i,
  /forget\s+(all\s+)?previous/i,
  /disregard\s+(all\s+)?previous/i,
  /act\s+as\s+if\s+you/i,
];

/**
 * Truncate and remove prompt-injection patterns from user-supplied input.
 *
 * @param input Raw user string (free text field, athlete notes, etc.)
 * @returns Sanitized string safe to include in an LLM prompt
 */
export function sanitizePrompt(input: string): string {
  // Hard length cap
  let sanitized = input.slice(0, MAX_PROMPT_CHARS);

  // Replace injection patterns with a neutral placeholder
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[FILTERED]");
  }

  return sanitized;
}

// ---------------------------------------------------------------------------
// Output guardrails
// ---------------------------------------------------------------------------

/**
 * Patterns that indicate the LLM output contains legally/medically dangerous
 * assertions. PACE is a CDS tool — it must never make diagnostic claims.
 *
 * Matched in Japanese because the system prompts are in Japanese.
 */
const HARMFUL_OUTPUT_PATTERNS: RegExp[] = [
  // Medical diagnosis assertions
  /診断(します|できます|しました|である)/,
  // Prescription assertions
  /処方(します|できます|してください)/,
  // Surgical recommendations
  /手術(が必要|を推奨|してください)/,
  // Definitive "you have X" statements
  /あなたは.{0,30}(です|である|と思われます)$/m,
  // English equivalents (for mixed-language outputs)
  /you\s+(have|are\s+diagnosed\s+with|should\s+undergo)/i,
  /I\s+diagnose/i,
  /prescribe/i,
];

/**
 * Returns true if the LLM output contains content that violates PACE's
 * medical safety guardrails. Callers must reject or flag such responses.
 *
 * @param output Raw text from Gemini response
 */
export function containsHarmfulContent(output: string): boolean {
  return HARMFUL_OUTPUT_PATTERNS.some((p) => p.test(output));
}

// ---------------------------------------------------------------------------
// JSON extraction helper
// ---------------------------------------------------------------------------

/**
 * Strip markdown code fences and leading/trailing whitespace so that
 * Gemini responses that wrap JSON in ```json ... ``` can be parsed.
 */
export function cleanJsonText(raw: string): string {
  // Remove ```json ... ``` or ``` ... ``` wrappers
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

// ---------------------------------------------------------------------------
// PII scrubber (minimal — full implementation in 12-security sprint)
// ---------------------------------------------------------------------------

/**
 * Remove obvious PII patterns from strings that will be logged or sent
 * to external services. This is a best-effort first pass only.
 */
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Japanese phone numbers
  { pattern: /\b0\d{1,4}-\d{1,4}-\d{4}\b/g, replacement: "[TEL]" },
  // Email addresses
  { pattern: /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi, replacement: "[EMAIL]" },
  // Japanese postal codes
  { pattern: /〒?\d{3}-\d{4}/g, replacement: "[ZIP]" },
];

export function scrubPii(text: string): string {
  let result = text;
  for (const { pattern, replacement } of PII_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
