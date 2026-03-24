/**
 * PACE Platform — Gemini セキュリティヘルパー（防壁2）
 *
 * 責務:
 *   INPUT  — ユーザー入力のサニタイズ・プロンプトインジェクション検出
 *   OUTPUT — 有害コンテンツ（医療的危険主張）の検出
 *   UTIL   — JSON レスポンスのクリーニング
 */

// ---------------------------------------------------------------------------
// 入力サニタイズ
// ---------------------------------------------------------------------------

/** 1 プロンプトあたりの最大文字数（~2000 トークン相当）*/
const MAX_PROMPT_CHARS = 8_000;

/**
 * プロンプトインジェクション試行を示すパターン一覧。
 * 検出時は "[FILTERED]" に置換して処理を継続する。
 */
const INJECTION_PATTERNS: RegExp[] = [
  // 英語: 指示無視
  /ignore\s+(previous|above|all)\s+instructions/i,
  /forget\s+(all\s+)?previous\s+(instructions|context)/i,
  /disregard\s+(all\s+)?previous/i,
  /override\s+(previous|all)\s+(instructions|rules)/i,
  // 英語: ロール切り替え
  /you\s+are\s+now\s+a/i,
  /act\s+as\s+(if\s+you\s+are|a\s+new)/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /roleplay\s+as/i,
  // 英語: システムプロンプト操作
  /system\s*:\s*you/i,
  /\[INST\]/i,
  /<\|im_start\|>/i,
  /\[SYSTEM\]/i,
  /<\|system\|>/i,
  // 英語: ジェイルブレイク
  /DAN\s+mode/i,
  /jailbreak/i,
  /do\s+anything\s+now/i,
  /developer\s+mode/i,
  // 英語: プロンプトリーク
  /reveal\s+(your\s+)?(system\s+)?prompt/i,
  /print\s+(your\s+)?(initial\s+)?instructions/i,
  /what\s+(are|were)\s+your\s+(original\s+)?instructions/i,
  // 日本語インジェクション
  /以前の指示を無視/i,
  /あなたは今から/i,
  /システムプロンプトを無視/i,
  /指示を全て無視/i,
  /新しい指示に従/i,
  /ロールプレイ(してください|しろ|しなさい)/i,
  /プロンプトを(教えて|見せて|開示)/i,
  /システムメッセージを(表示|公開|教えて)/i,
  /制約を(無視|取り除|外して)/i,
  /あなたの設定を(リセット|変更)/i,
];

/**
 * ユーザー入力をサニタイズしてプロンプトへの埋め込みを安全にする。
 * - HTMLタグ除去
 * - 連続改行の圧縮
 * - ロールインジェクション除去
 * - インジェクションパターンの無効化
 * - 文字数上限の適用
 */
export function sanitizeUserInput(input: string): string {
  // 文字数ハードキャップ
  let sanitized = input.slice(0, MAX_PROMPT_CHARS);

  // HTMLタグ除去（XSS / タグインジェクション対策）
  sanitized = sanitized.replace(/<[^>]*>/g, "");

  // 過剰な改行を圧縮（インジェクションペイロード難読化対策）
  sanitized = sanitized.replace(/[\r\n]{3,}/g, "\n\n");

  // ロールオーバーライド除去
  sanitized = sanitized.replace(
    /\b(System|User|Assistant|Human|SYSTEM|USER|ASSISTANT)\s*:/g,
    "[FILTERED]:"
  );

  // インジェクションパターンを無効化
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[FILTERED]");
  }

  return sanitized.trim();
}

/**
 * プロンプトインジェクションを検出した場合は true を返す。
 * ログ記録・早期リターンに使用する。
 */
export function detectInjectionAttempt(input: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(input));
}

// ---------------------------------------------------------------------------
// 出力ガードレール（防壁2）
// ---------------------------------------------------------------------------

/**
 * LLM 出力に医療的危険主張が含まれているかを検出するパターン。
 * PACE は CDS ツールであり、診断・処方・外科的推奨は禁止。
 */
const HARMFUL_OUTPUT_PATTERNS: RegExp[] = [
  // 医療診断の断言（日本語）
  /診断(します|できます|しました|である|です)/,
  /確定診断/,
  /病名は.{0,20}(です|になります)/,
  // 処方・投薬指示（日本語）
  /(薬|投薬|服用|服薬|処方)(してください|します|しなさい|が必要です)/,
  /\d+(mg|ml|錠|包|本)(を|の)(服用|投与|飲ん)/,
  // 手術・外科的処置（日本語）
  /(手術|外科|切開|縫合|切除)(が必要|を推奨|してください|を行う)/,
  // 骨折・重篤な傷害の断言（日本語）
  /骨折(しています|です|を確認|している|が判明)/,
  /靭帯(断裂|損傷)(しています|です|が確認)/,
  // 即時医療受診を強制する断言（日本語）
  /直ちに(救急|病院|医師)(に|へ)(行|かかり|連絡)(なさい|ください|なければなりません)/,
  // 英語: 診断断言
  /you\s+(have|are\s+diagnosed\s+with|suffer\s+from)\s+\w/i,
  /the\s+(diagnosis|condition)\s+is\s+\w/i,
  /I\s+(diagnose|can\s+confirm)\s+you/i,
  // 英語: 処方・投薬指示
  /prescribe[sd]?\s+\w/i,
  /take\s+\d+\s*(mg|ml|tablet|pill)/i,
  /administer\s+\d+/i,
  /dosage\s+(is|should\s+be)\s+\d+/i,
  // 英語: 外科的処置
  /requires?\s+surgery/i,
  /needs?\s+(an?\s+)?(operation|surgical)/i,
  /should\s+(undergo|have)\s+(surgery|an?\s+operation)/i,
  // 英語: 骨折・重篤な傷害
  /you\s+(have|sustained)\s+a\s+(fracture|torn|ruptured)/i,
];

/**
 * LLM の出力テキストに有害コンテンツが含まれているかを判定する。
 * @returns 有害コンテンツを検出した場合 true
 */
export function detectHarmfulOutput(text: string): boolean {
  return HARMFUL_OUTPUT_PATTERNS.some((p) => p.test(text));
}

// ---------------------------------------------------------------------------
// JSON レスポンスクリーニング（防壁4）
// ---------------------------------------------------------------------------

/**
 * Gemini が返す JSON 文字列からコードフェンスや余分なテキストを除去する。
 *
 * 入力例:
 *   ```json
 *   { "key": "value" }
 *   ```
 *
 * 出力: { "key": "value" }
 */
export function cleanJsonResponse(raw: string): string {
  // コードフェンス（```json ... ``` / ``` ... ```）を除去
  let cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");

  // 先頭・末尾の余分な空白を除去
  cleaned = cleaned.trim();

  // JSON オブジェクト / 配列の境界を特定して抽出
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");

  if (firstBrace === -1 && firstBracket === -1) {
    return cleaned; // JSON が見つからない場合はそのまま返す
  }

  const start =
    firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)
      ? firstBrace
      : firstBracket;

  const isObject = cleaned[start] === "{";
  const endChar = isObject ? "}" : "]";
  const end = cleaned.lastIndexOf(endChar);

  if (end === -1) return cleaned;
  return cleaned.slice(start, end + 1);
}

// ---------------------------------------------------------------------------
// PII マスキング（防壁2 補助）
// ---------------------------------------------------------------------------

/**
 * ログや監査用に文字列から PII（個人識別情報）をマスクする。
 * - 電話番号（ハイフンあり・なし両対応）
 * - メールアドレス
 * - クレジットカード番号（16桁、ハイフン区切り）
 * - マイナンバー（12桁）
 * - 日本語氏名パターン（簡易）
 *
 * 【セキュリティ注意】本関数はログ・監査出力の PII 削除用であり、
 * 表示用フォーマットとしては使用しないこと。
 */
export function maskPii(text: string): string {
  return text
    // クレジットカード番号（ハイフン区切り 4-4-4-4）
    .replace(/\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b/g, "[CARD-MASKED]")
    // マイナンバー（12桁の連続数字 — クレジットカードより先にチェック）
    .replace(/\b\d{12}\b/g, "[MYNUMBER-MASKED]")
    // 電話番号（ハイフンあり: 2〜4桁-4桁-4桁）
    .replace(/\b\d{2,4}-\d{4}-\d{4}\b/g, "[TEL-MASKED]")
    // 電話番号（ハイフンなし: 10〜11桁の連続数字）
    .replace(/\b0\d{9,10}\b/g, "[TEL-MASKED]")
    // メールアドレス
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL-MASKED]")
    // 日本語氏名パターン（漢字姓名、スペース区切り）
    .replace(/[一-龯]{1,4}[\s　][一-龯]{1,5}/g, "[NAME-MASKED]");
}
