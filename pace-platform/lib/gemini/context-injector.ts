/**
 * PACE Platform — LLM Context Injector
 *
 * ベイズ推論結果 + CV キネマティクスデータを
 * Gemini のシステムプロンプトに自動注入するモジュール。
 *
 * 注入フロー:
 *   1. ベイズエンジンの DiagnosisResult を構造化コンテキストに変換
 *   2. CV キネマティクス測定値を補足情報として追加
 *   3. アスリートの基本プロファイルを添付
 *   4. システムプロンプトプレフィックスと結合して完全プロンプトを生成
 */

import { buildCdsSystemPrefix, MEDICAL_DISCLAIMER } from "./client";

// ---------------------------------------------------------------------------
// 型定義（ベイズ推論 / CV キネマティクス）
// ---------------------------------------------------------------------------

export interface BayesianDiagnosisResult {
  sessionId: string;
  athleteId: string;
  assessmentType: "acute" | "chronic" | "performance";
  /** 上位 3 件の傷害候補とポステリア確率 */
  topDiagnoses: Array<{
    label: string;
    posterior: number;
    riskLevel: "critical" | "high" | "medium" | "low";
    soapTemplates?: string[];
  }>;
  /** 推論に使用された主要なエビデンスノード */
  keyEvidenceNodes: Array<{
    nodeId: string;
    description: string;
    answer: "yes" | "no" | "unknown";
    likelihoodRatio: number;
  }>;
  /** 禁忌タグ（メニュー生成時に排除すべき運動）*/
  contraindicationTags: string[];
  /** 処方タグ（推奨される運動の種類）*/
  prescriptionTags: string[];
  overallRiskLevel: "critical" | "high" | "medium" | "low";
  hardLockActive: boolean;
  completedAt: string;
}

export interface CvKinematicsData {
  athleteId: string;
  measuredAt: string;
  /** CMJ（カウンタームーブメントジャンプ）左右比 0-1 */
  cmjAsymmetryRatio?: number;
  /** RSI（反応強度指数）*/
  rsiNorm?: number;
  /** ランディング時の膝外反角度（度）*/
  kneeValgusAngle?: { left: number; right: number };
  /** ヒップ屈曲可動域（度）*/
  hipFlexionRom?: { left: number; right: number };
  /** sRPE（主観的運動強度）*/
  sRpe?: number;
  /** ACWR（急性：慢性トレーニング負荷比）*/
  acwr?: number;
  /** HRV（心拍変動 / ベースライン比）*/
  hrvBaselineRatio?: number;
  confidenceScore?: number;
}

export interface AthleteProfile {
  id: string;
  name: string;
  age: number;
  sex: "male" | "female";
  position?: string;
  sport?: string;
  injuryHistory?: string[];
}

export interface InjectedContext {
  /** Gemini に渡す完全なシステムプロンプト文字列 */
  systemPrompt: string;
  /** コンテキストのサマリー（ログ・監査用）*/
  contextSummary: {
    hasBayesianData: boolean;
    hasCvData: boolean;
    topDiagnosis: string | null;
    riskLevel: string | null;
    contraindicationCount: number;
  };
}

// ---------------------------------------------------------------------------
// コンテキスト注入メイン関数
// ---------------------------------------------------------------------------

/**
 * ベイズ推論結果と CV データを統合し、Gemini 用コンテキストを生成する。
 *
 * @param profile  アスリートプロファイル
 * @param bayes    ベイズ推論結果（null の場合は省略）
 * @param cv       CV キネマティクスデータ（null の場合は省略）
 * @param taskType 対象タスク（"rehab" | "soap" | "team-menu"）
 */
export function buildInjectedContext(
  profile: AthleteProfile,
  bayes: BayesianDiagnosisResult | null,
  cv: CvKinematicsData | null,
  taskType: "rehab" | "soap" | "team-menu"
): InjectedContext {
  const sections: string[] = [];

  // 1. CDS システムプレフィックス（ガードレール）
  sections.push(buildCdsSystemPrefix());

  // 2. タスク固有の指示
  sections.push(buildTaskInstruction(taskType));

  // 3. アスリートプロファイル
  sections.push(buildProfileSection(profile));

  // 4. ベイズ推論コンテキスト（利用可能な場合）
  if (bayes) {
    sections.push(buildBayesianSection(bayes));
  }

  // 5. CV キネマティクスコンテキスト（利用可能な場合）
  if (cv) {
    sections.push(buildCvSection(cv));
  }

  // 6. 医療免責事項
  sections.push(`\n=== 免責事項 ===\n${MEDICAL_DISCLAIMER}`);

  const systemPrompt = sections.join("\n");

  return {
    systemPrompt,
    contextSummary: {
      hasBayesianData: bayes !== null,
      hasCvData: cv !== null,
      topDiagnosis: bayes?.topDiagnoses[0]?.label ?? null,
      riskLevel: bayes?.overallRiskLevel ?? null,
      contraindicationCount: bayes?.contraindicationTags.length ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// セクションビルダー（プライベート）
// ---------------------------------------------------------------------------

function buildTaskInstruction(taskType: "rehab" | "soap" | "team-menu"): string {
  const instructions: Record<string, string> = {
    rehab: `=== タスク: リハビリメニュー生成 ===
以下の選手データに基づき、段階的なリハビリメニューをJSON形式で生成してください。
- 禁忌タグ（contraindication_tags）に含まれる運動は絶対に含めないこと
- 処方タグ（prescription_tags）を優先的に使用すること
- フェーズ別（急性期 / 回復期 / 機能回復期）で段階的に設計すること
- 各エクサ サイズにセット数・レップ数・注意事項を含めること`,

    soap: `=== タスク: SOAPノート下書き生成 ===
以下のアセスメントデータに基づき、SOAPノートの下書きをJSON形式で生成してください。
- S（主観的情報）: 選手の訴えと主観評価
- O（客観的情報）: 測定値・検査所見
- A（評価）: ベイズ推論結果を踏まえた評価（断言禁止）
- P（計画）: 推奨される次のステップ（最終判断はスタッフが行う旨を明記）`,

    "team-menu": `=== タスク: チームトレーニングメニュー生成（S&C向け）===
以下のチームデータに基づき、週間トレーニングメニューをJSON形式で生成してください。
- 傷害リスクが "critical" または "high" の選手は個別対応フラグを付与すること
- ACWR が 1.5 を超える選手には負荷軽減の推奨を含めること
- 全員に適用するチームメニューと、個別調整が必要な選手リストを分けて出力すること`,
  };

  return instructions[taskType] ?? "";
}

function buildProfileSection(profile: AthleteProfile): string {
  const lines = [
    "=== アスリートプロファイル ===",
    `- ID: ${profile.id}`,
    `- 年齢: ${profile.age}歳`,
    `- 性別: ${profile.sex === "male" ? "男性" : "女性"}`,
  ];

  if (profile.position) lines.push(`- ポジション: ${profile.position}`);
  if (profile.sport) lines.push(`- スポーツ: ${profile.sport}`);
  if (profile.injuryHistory && profile.injuryHistory.length > 0) {
    lines.push(`- 既往歴: ${profile.injuryHistory.join(", ")}`);
  }

  return lines.join("\n");
}

function buildBayesianSection(bayes: BayesianDiagnosisResult): string {
  const lines = [
    "=== ベイズ推論結果 ===",
    `- 評価タイプ: ${bayes.assessmentType}`,
    `- 総合リスクレベル: ${bayes.overallRiskLevel.toUpperCase()}`,
    `- Hard Lock: ${bayes.hardLockActive ? "有効（完全免荷）" : "なし"}`,
    "",
    "【上位傷害候補】",
  ];

  for (const dx of bayes.topDiagnoses) {
    lines.push(
      `  - ${dx.label}: 確率 ${(dx.posterior * 100).toFixed(1)}% [${dx.riskLevel}]`
    );
  }

  lines.push("", "【主要エビデンスノード】");
  for (const node of bayes.keyEvidenceNodes.slice(0, 5)) {
    lines.push(
      `  - ${node.description}: ${node.answer} (LR=${node.likelihoodRatio.toFixed(2)})`
    );
  }

  if (bayes.contraindicationTags.length > 0) {
    lines.push("", "【禁忌タグ（絶対に含めないこと）】");
    lines.push(`  ${bayes.contraindicationTags.join(", ")}`);
  }

  if (bayes.prescriptionTags.length > 0) {
    lines.push("", "【処方タグ（優先使用）】");
    lines.push(`  ${bayes.prescriptionTags.join(", ")}`);
  }

  return lines.join("\n");
}

function buildCvSection(cv: CvKinematicsData): string {
  const lines = [
    "=== CV キネマティクス測定値 ===",
    `- 測定日時: ${cv.measuredAt}`,
  ];

  if (cv.cmjAsymmetryRatio !== undefined) {
    const pct = (cv.cmjAsymmetryRatio * 100).toFixed(1);
    const flag = cv.cmjAsymmetryRatio < 0.85 ? " ⚠️ 左右差大" : "";
    lines.push(`- CMJ 左右比: ${pct}%${flag}`);
  }

  if (cv.rsiNorm !== undefined) {
    lines.push(`- RSI（正規化）: ${cv.rsiNorm.toFixed(2)}`);
  }

  if (cv.kneeValgusAngle) {
    lines.push(
      `- 膝外反角度: 左 ${cv.kneeValgusAngle.left}° / 右 ${cv.kneeValgusAngle.right}°`
    );
  }

  if (cv.hipFlexionRom) {
    lines.push(
      `- 股関節屈曲 ROM: 左 ${cv.hipFlexionRom.left}° / 右 ${cv.hipFlexionRom.right}°`
    );
  }

  if (cv.sRpe !== undefined) {
    lines.push(`- sRPE: ${cv.sRpe}/10`);
  }

  if (cv.acwr !== undefined) {
    const flag = cv.acwr > 1.5 ? " ⚠️ 過負荷ゾーン" : cv.acwr < 0.8 ? " ⚠️ 低負荷" : "";
    lines.push(`- ACWR: ${cv.acwr.toFixed(2)}${flag}`);
  }

  if (cv.hrvBaselineRatio !== undefined) {
    const flag = cv.hrvBaselineRatio < 0.85 ? " ⚠️ 回復不足" : "";
    lines.push(`- HRV ベースライン比: ${(cv.hrvBaselineRatio * 100).toFixed(0)}%${flag}`);
  }

  if (cv.confidenceScore !== undefined) {
    lines.push(`- CV 信頼スコア: ${(cv.confidenceScore * 100).toFixed(0)}%`);
  }

  return lines.join("\n");
}
