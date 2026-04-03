# PACE 6層ノード・パイプライン アーキテクチャ仕様書 v1.0

- **作成日**: 2026-03-25
- **ステータス**: ヒアリング中（Q1-Q5 回答待ち）
- **対象**: PACE Platform 次期アーキテクチャ

---

## 目次

1. [Step 1: システムアーキテクチャ — Node 0-5 パイプライン](#step-1-システムアーキテクチャ--node-0-5-パイプライン)
2. [Step 2: コアアルゴリズム（2.A-2.F）](#step-2-コアアルゴリズム2a-2f)
3. [Step 3: 推論階層（P1-P5）+ コンテキスト・オーバーライド](#step-3-推論階層p1-p5-コンテキスト・オーバーライド)
4. [Step 4: データベース拡張](#step-4-データベース拡張)
5. [Step 5: フロントエンド UI/UX](#step-5-フロントエンド-uiux)
6. [Step 6: TypeScript アーキテクチャ](#step-6-typescript-アーキテクチャ)

---

## Step 1: システムアーキテクチャ — Node 0-5 パイプライン

### 1.1 パイプライン概要

6層のノード・パイプラインにより、生データから臨床意思決定支援までを段階的に処理する。

```
Node 0 → Node 1 → Node 2 → Node 3 → Node 4 → Node 5
(Ingest)  (Clean)  (Feature)  (Infer)  (Decide)  (Present)
```

### 1.2 ノード定義

| ノード | 名称 | 役割 | 入力 | 出力 |
|--------|------|------|------|------|
| Node 0 | **Data Ingestion** | 生データ取り込み・正規化 | センサー生値、手動入力、外部API | 正規化済みデータレコード |
| Node 1 | **Data Cleaning & Validation** | 欠損値補間・外れ値検出・品質スコア付与 | 正規化済みデータ | クリーンデータ + quality_score |
| Node 2 | **Feature Engineering** | 特徴量生成・時系列集約・ドメイン固有変換 | クリーンデータ | 特徴量ベクトル |
| Node 3 | **Inference Engine** | ベイジアン推論・モデル適用・確率推定 | 特徴量ベクトル | 推論結果 + 信頼区間 |
| Node 4 | **Decision Support** | P1-P5 階層評価・介入推奨・リスク分類 | 推論結果 | 推奨アクション + 根拠 |
| Node 5 | **Presentation & Audit** | UI レンダリング・監査ログ・説明可能性 | 推奨アクション | ダッシュボード表示 + trace_log |

### 1.3 ノード間プロトコル

各ノード間のデータ受け渡しは以下の共通インターフェースに準拠する:

```typescript
interface NodeOutput<T> {
  nodeId: number;
  timestamp: string;       // ISO 8601
  data: T;
  metadata: {
    processingTimeMs: number;
    qualityScore: number;  // 0.0 - 1.0
    warnings: string[];
  };
  traceId: string;         // パイプライン全体を貫通するトレースID
}
```

### 1.4 エラーハンドリング戦略

| ノード | 障害時の挙動 | フォールバック |
|--------|-------------|---------------|
| Node 0 | リトライ 3回 → dead-letter queue | 手動入力フォーム提示 |
| Node 1 | 品質スコア低下警告 → 処理続行 | 直近有効値で補間 |
| Node 2 | 特徴量欠損フラグ付与 → 処理続行 | デフォルト特徴量で代替 |
| Node 3 | 信頼区間拡大 → 低確信度フラグ | 事前分布のみで推論 |
| Node 4 | 推奨保留 → 人間判断要求 | 保守的推奨のみ出力 |
| Node 5 | グレースフルデグラデーション | キャッシュ済み表示 |

---

## Step 2: コアアルゴリズム（2.A-2.F）

### 2.A ベイジアン・リスク推定（Bayesian Risk Estimation）

事後確率をベイズの定理により更新する:

```
P(injury | data) = P(data | injury) × P(injury) / P(data)
```

ここで:
- `P(injury)`: 傷害の事前確率（ベースレート、人口統計、履歴から算出）
- `P(data | injury)`: 尤度関数（観測データが傷害状態で生成される確率）
- `P(data)`: 周辺尤度（正規化定数）

**逐次更新**:

```
P(θ | D₁, D₂, ..., Dₙ) ∝ P(Dₙ | θ) × P(θ | D₁, ..., Dₙ₋₁)
```

新しいデータポイントが到着するたびに事後分布を更新し、累積的にリスク推定を精緻化する。

### 2.B ロジスティック回帰リスクスコア

```
logit(p) = β₀ + β₁x₁ + β₂x₂ + ... + βₖxₖ
```

```
risk_score = 1 / (1 + exp(−logit(p)))
```

| 係数 | 特徴量 | 説明 |
|------|--------|------|
| β₁ | workload_ratio | 急性:慢性負荷比（ACWR） |
| β₂ | sleep_zscore | 睡眠品質 z スコア |
| β₃ | prev_injury_flag | 過去傷害フラグ（0/1） |
| β₄ | asymmetry_index | 左右非対称性指標 |
| β₅ | fatigue_score | 主観的疲労スコア |
| β₆ | age_factor | 年齢補正係数 |

### 2.C 急性:慢性負荷比（ACWR — Acute:Chronic Workload Ratio）

**指数加重移動平均（EWMA）方式**:

```
ACWR = acute_load / chronic_load
```

```
acute_load(t) = λ × load(t) + (1 − λ) × acute_load(t−1)
chronic_load(t) = λ' × load(t) + (1 − λ') × chronic_load(t−1)
```

ここで:
- `λ = 2 / (7 + 1)` （急性期間 = 7日）
- `λ' = 2 / (28 + 1)` （慢性期間 = 28日）

**リスクゾーン分類**:

| ACWR 範囲 | リスクゾーン | 推奨 |
|-----------|-------------|------|
| < 0.80 | アンダートレーニング | 負荷漸増推奨 |
| 0.80 - 1.30 | スイートスポット | 現行維持 |
| 1.30 - 1.50 | 注意ゾーン | モニタリング強化 |
| > 1.50 | 危険ゾーン | 負荷軽減必須 |

### 2.D 回復スコアリング（Recovery Scoring）

```
recovery_score = w₁ × sleep_quality + w₂ × HRV_normalized + w₃ × subjective_wellness + w₄ × nutrition_score
```

ここで `Σwᵢ = 1.0`、デフォルト重み:

| 重み | 値 | 説明 |
|------|-----|------|
| w₁ | 0.30 | 睡眠品質（0-100） |
| w₂ | 0.25 | HRV 正規化値 |
| w₃ | 0.25 | 主観的ウェルネス |
| w₄ | 0.20 | 栄養スコア |

### 2.E コンディション・スコア統合（Conditioning Score Integration）

既存のコンディション・スコアエンジン（ADR-002 参照）からの出力を Node 3 の入力として統合する:

```
conditioning_composite = α × physical_readiness + β × training_adaptation + γ × recovery_status
```

```
α + β + γ = 1.0
```

### 2.F 信頼区間の伝播（Confidence Interval Propagation）

各ノードで推定値に信頼区間を付与し、パイプライン全体で伝播させる:

```
CI_compound = √(CI_node2² + CI_node3² + CI_node4²)
```

信頼区間が閾値を超えた場合、Node 4 で自動的に推奨を「保留」に格下げし、人間の判断を要求する:

```
if CI_compound > CONFIDENCE_THRESHOLD:
    recommendation.status = "PENDING_HUMAN_REVIEW"
```

---

## Step 3: 推論階層（P1-P5）+ コンテキスト・オーバーライド

### 3.1 P1-P5 推論優先度階層

推論結果に5段階の優先度を付与し、臨床意思決定の緊急度を制御する。

| 優先度 | 名称 | 説明 | 応答時間目標 | 自動通知 |
|--------|------|------|-------------|---------|
| **P1** | Critical | 即座の医療介入が必要 | < 1分 | 全スタッフ即時通知 |
| **P2** | High | 24時間以内の対応が必要 | < 15分 | 担当スタッフ通知 |
| **P3** | Moderate | 1週間以内の対応推奨 | < 1時間 | ダッシュボード表示 |
| **P4** | Low | モニタリング継続 | < 24時間 | 週次レポート |
| **P5** | Informational | 参考情報・トレンド | 非同期 | 月次サマリー |

### 3.2 優先度判定ルール

```typescript
function determinePriority(inference: InferenceResult): Priority {
  // P1: 即時介入
  if (inference.riskScore > 0.95 && inference.confidence > 0.80) return 'P1';
  if (inference.acuteFlags.includes('RED_FLAG')) return 'P1';

  // P2: 高優先度
  if (inference.riskScore > 0.80 && inference.confidence > 0.70) return 'P2';
  if (inference.trendDirection === 'RAPID_DECLINE') return 'P2';

  // P3: 中優先度
  if (inference.riskScore > 0.60) return 'P3';
  if (inference.acwr > 1.50) return 'P3';

  // P4: 低優先度
  if (inference.riskScore > 0.40) return 'P4';

  // P5: 情報提供
  return 'P5';
}
```

### 3.3 コンテキスト・オーバーライド

特定のコンテキスト条件下で、推論結果の優先度を動的に調整する:

| オーバーライド条件 | 効果 | 例 |
|-------------------|------|-----|
| 試合前 48h 以内 | P4 → P3 へ昇格 | 軽微な異常も試合前は注意 |
| ポストシーズン | P3 → P4 へ降格 | オフシーズンは閾値緩和 |
| 過去傷害の再発パターン | P4 → P2 へ昇格 | 再発リスクが高い部位 |
| 複数指標の同時悪化 | 1段階昇格 | 睡眠 + HRV + 主観的疲労 |
| 連続試合スケジュール | P4 → P3 へ昇格 | 週3試合以上 |

```typescript
function applyContextualOverrides(
  priority: Priority,
  context: AthleteContext
): Priority {
  let adjusted = priority;

  // 試合前オーバーライド
  if (context.hoursToNextMatch < 48 && adjusted > 'P3') {
    adjusted = upgradePriority(adjusted, 1);
  }

  // 再発パターンオーバーライド
  if (context.hasRecurrencePattern && adjusted > 'P2') {
    adjusted = upgradePriority(adjusted, 2);
  }

  // 複数指標同時悪化
  if (context.concurrentDeteriorationCount >= 3) {
    adjusted = upgradePriority(adjusted, 1);
  }

  return adjusted;
}
```

---

## Step 4: データベース拡張

### 4.1 assessments テーブル拡張

既存の `assessments` テーブルに推論パイプライン対応カラムを追加する。

```sql
-- assessments テーブル拡張
ALTER TABLE assessments ADD COLUMN pipeline_version TEXT DEFAULT 'v1.0';
ALTER TABLE assessments ADD COLUMN node_outputs JSONB DEFAULT '{}';
ALTER TABLE assessments ADD COLUMN inference_priority TEXT CHECK (inference_priority IN ('P1','P2','P3','P4','P5'));
ALTER TABLE assessments ADD COLUMN confidence_interval NUMERIC(5,4);
ALTER TABLE assessments ADD COLUMN contextual_overrides JSONB DEFAULT '[]';
ALTER TABLE assessments ADD COLUMN trace_id UUID DEFAULT gen_random_uuid();
```

### 4.2 inference_trace_logs テーブル（新規）

パイプライン全体の推論トレースを記録し、説明可能性と監査を担保する。

```sql
CREATE TABLE inference_trace_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id UUID NOT NULL,
  assessment_id UUID REFERENCES assessments(id),
  athlete_id UUID REFERENCES athletes(id) NOT NULL,

  -- パイプライン実行情報
  pipeline_version TEXT NOT NULL DEFAULT 'v1.0',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_processing_ms INTEGER,

  -- ノード別出力
  node_0_output JSONB,  -- 取り込みデータ
  node_1_output JSONB,  -- クリーニング結果 + quality_score
  node_2_output JSONB,  -- 特徴量ベクトル
  node_3_output JSONB,  -- 推論結果 + 信頼区間
  node_4_output JSONB,  -- 推奨アクション
  node_5_output JSONB,  -- 表示用データ

  -- 推論結果サマリー
  final_priority TEXT CHECK (final_priority IN ('P1','P2','P3','P4','P5')),
  original_priority TEXT CHECK (original_priority IN ('P1','P2','P3','P4','P5')),
  overrides_applied JSONB DEFAULT '[]',
  risk_score NUMERIC(5,4),
  confidence_score NUMERIC(5,4),

  -- 監査情報
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_decision TEXT CHECK (review_decision IN ('ACCEPTED','MODIFIED','REJECTED')),
  review_notes TEXT,

  -- RLS
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_trace_logs_trace_id ON inference_trace_logs(trace_id);
CREATE INDEX idx_trace_logs_athlete_id ON inference_trace_logs(athlete_id);
CREATE INDEX idx_trace_logs_priority ON inference_trace_logs(final_priority);
CREATE INDEX idx_trace_logs_executed_at ON inference_trace_logs(executed_at DESC);

-- RLS ポリシー
ALTER TABLE inference_trace_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view trace logs"
  ON inference_trace_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM staff_profiles
      WHERE staff_profiles.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert trace logs"
  ON inference_trace_logs FOR INSERT
  WITH CHECK (true);
```

### 4.3 ER 図（パイプライン関連）

```
athletes ─────┐
              │
assessments ──┤── inference_trace_logs
              │         │
staff_profiles ─────────┘ (reviewed_by)
```

---

## Step 5: フロントエンド UI/UX

### 5.1 アスリート・プライバシー

| 要件 | 実装方針 |
|------|---------|
| データ最小化原則 | アスリートには P1-P3 の推奨アクションのみ表示。生の推論スコアは非表示 |
| 同意管理 | データ利用同意の取得・撤回フロー実装 |
| アクセスログ | 誰がいつどのデータを閲覧したか記録 |
| データ・ポータビリティ | アスリート自身のデータをエクスポート可能にする |
| 匿名化オプション | チーム全体分析時は個人を特定できない形で集計 |

### 5.2 MDT コパイロット（多職種チーム支援）

MDT（Multi-Disciplinary Team）向けの推論コパイロットインターフェース:

```
┌─────────────────────────────────────────────────┐
│  MDT コパイロット — [アスリート名]                 │
├─────────────────────────────────────────────────┤
│                                                  │
│  ■ リスクサマリー                                 │
│  ┌──────────────────────────────────────────┐    │
│  │ 優先度: P2 (High)                        │    │
│  │ リスクスコア: 0.82 [CI: 0.74-0.90]       │    │
│  │ ACWR: 1.45 (注意ゾーン)                   │    │
│  │ 主要因: 負荷急増 + 睡眠品質低下            │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ■ 推論トレース                                   │
│  Node 0 ✓ → Node 1 ✓ → Node 2 ✓ →              │
│  Node 3 ✓ → Node 4 ⚠ → Node 5 ✓                │
│                                                  │
│  ■ 推奨アクション                                 │
│  1. トレーニング負荷 20% 軽減（2日間）             │
│  2. 睡眠衛生評価実施                              │
│  3. 48h 後に再評価                                │
│                                                  │
│  ■ コンテキスト情報                               │
│  [!] 試合まで 36h — P3→P2 へ自動昇格済み          │
│  [i] 左ハムストリング傷害歴あり（2025-11）        │
│                                                  │
│  [承認] [修正] [却下] [詳細トレース表示]           │
└─────────────────────────────────────────────────┘
```

### 5.3 法的セーフガード

| セーフガード | 実装 |
|-------------|------|
| 免責事項表示 | 全推奨アクションに「本システムの出力は臨床判断の補助であり、医学的診断ではありません」の注記 |
| 人間承認フロー | P1-P2 の推奨は有資格スタッフの承認なしに実行不可 |
| 監査証跡 | 全ての推論・判断・承認をimmutableログに記録 |
| データ保持ポリシー | トレースログの保持期間設定（デフォルト: 7年） |
| 有資格者ゲート | P1 通知の送信先を医療資格保持者に限定 |

---

## Step 6: TypeScript アーキテクチャ

### 6.1 パイプラインパターン

```typescript
// lib/pipeline/types.ts
export interface PipelineContext {
  traceId: string;
  athleteId: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface NodeResult<T> {
  nodeId: number;
  nodeName: string;
  data: T;
  processingTimeMs: number;
  qualityScore: number;
  warnings: string[];
}

export type NodeExecutor<TInput, TOutput> = (
  input: TInput,
  context: PipelineContext
) => Promise<NodeResult<TOutput>>;
```

### 6.2 パイプライン実行エンジン

```typescript
// lib/pipeline/engine.ts
export class InferencePipeline {
  private nodes: Map<number, NodeExecutor<any, any>> = new Map();

  register<TIn, TOut>(nodeId: number, executor: NodeExecutor<TIn, TOut>): void {
    this.nodes.set(nodeId, executor);
  }

  async execute(rawInput: unknown, context: PipelineContext): Promise<PipelineResult> {
    const traceLog: NodeResult<unknown>[] = [];
    let currentInput = rawInput;

    for (let nodeId = 0; nodeId <= 5; nodeId++) {
      const executor = this.nodes.get(nodeId);
      if (!executor) throw new Error(`Node ${nodeId} not registered`);

      const startTime = performance.now();
      try {
        const result = await executor(currentInput, context);
        result.processingTimeMs = performance.now() - startTime;
        traceLog.push(result);
        currentInput = result.data;
      } catch (error) {
        return this.handleNodeFailure(nodeId, error, traceLog, context);
      }
    }

    return {
      traceId: context.traceId,
      success: true,
      nodeResults: traceLog,
      totalProcessingMs: traceLog.reduce((sum, n) => sum + n.processingTimeMs, 0),
    };
  }

  private handleNodeFailure(
    nodeId: number,
    error: unknown,
    traceLog: NodeResult<unknown>[],
    context: PipelineContext
  ): PipelineResult {
    // フォールバック戦略はノードごとに定義
    return {
      traceId: context.traceId,
      success: false,
      failedAtNode: nodeId,
      error: error instanceof Error ? error.message : String(error),
      nodeResults: traceLog,
      totalProcessingMs: traceLog.reduce((sum, n) => sum + n.processingTimeMs, 0),
    };
  }
}
```

### 6.3 ノード実装例

```typescript
// lib/pipeline/nodes/node3-inference.ts
import type { NodeExecutor, PipelineContext, NodeResult } from '../types';

interface FeatureVector {
  acwr: number;
  sleepZscore: number;
  previousInjuryFlag: boolean;
  asymmetryIndex: number;
  fatigueScore: number;
  ageFactor: number;
  conditioningScore: number;
}

interface InferenceOutput {
  riskScore: number;
  confidenceInterval: [number, number];
  posteriorProbabilities: Record<string, number>;
  contributingFactors: Array<{ factor: string; weight: number }>;
}

export const node3Inference: NodeExecutor<FeatureVector, InferenceOutput> = async (
  features: FeatureVector,
  context: PipelineContext
): Promise<NodeResult<InferenceOutput>> => {
  // ロジスティック回帰リスクスコア
  const logit =
    -2.5 +
    1.8 * features.acwr +
    -0.6 * features.sleepZscore +
    1.2 * (features.previousInjuryFlag ? 1 : 0) +
    0.9 * features.asymmetryIndex +
    0.7 * features.fatigueScore +
    0.3 * features.ageFactor;

  const riskScore = 1 / (1 + Math.exp(-logit));

  // 信頼区間推定（ブートストラップ近似）
  const se = Math.sqrt(riskScore * (1 - riskScore) / 100); // 簡易近似
  const ci: [number, number] = [
    Math.max(0, riskScore - 1.96 * se),
    Math.min(1, riskScore + 1.96 * se),
  ];

  return {
    nodeId: 3,
    nodeName: 'Inference Engine',
    data: {
      riskScore,
      confidenceInterval: ci,
      posteriorProbabilities: {
        hamstringStrain: riskScore * 0.35,
        ankleSprain: riskScore * 0.25,
        overuseInjury: riskScore * 0.40,
      },
      contributingFactors: [
        { factor: 'ACWR', weight: features.acwr > 1.3 ? 0.35 : 0.15 },
        { factor: 'Sleep', weight: features.sleepZscore < -1 ? 0.25 : 0.10 },
        { factor: 'PreviousInjury', weight: features.previousInjuryFlag ? 0.20 : 0.05 },
        { factor: 'Asymmetry', weight: features.asymmetryIndex > 0.15 ? 0.15 : 0.05 },
      ],
    },
    processingTimeMs: 0, // パイプラインエンジンが設定
    qualityScore: ci[1] - ci[0] < 0.20 ? 0.9 : 0.7,
    warnings: features.acwr > 1.5 ? ['ACWR in danger zone'] : [],
  };
};
```

### 6.4 ディレクトリ構造

```
pace-platform/
├── lib/
│   └── pipeline/
│       ├── types.ts              # 共通型定義
│       ├── engine.ts             # パイプライン実行エンジン
│       ├── priority.ts           # P1-P5 優先度判定
│       ├── overrides.ts          # コンテキスト・オーバーライド
│       └── nodes/
│           ├── node0-ingestion.ts
│           ├── node1-cleaning.ts
│           ├── node2-features.ts
│           ├── node3-inference.ts
│           ├── node4-decision.ts
│           └── node5-presentation.ts
├── app/
│   └── api/
│       └── pipeline/
│           ├── route.ts          # パイプライン実行 API
│           └── trace/
│               └── [traceId]/
│                   └── route.ts  # トレースログ取得 API
└── supabase/
    └── migrations/
        └── 0XX_inference_trace_logs.sql
```

---

## 付録: ヒアリング事項（Q1-Q5）

本仕様書の確定にあたり、以下のヒアリング事項の回答を待っている:

| ID | 質問 | 影響範囲 |
|----|------|---------|
| Q1 | Node 3 で使用するベイジアンモデルの具体的な事前分布の選択方針は? | Step 2.A |
| Q2 | P1 通知の送信先となる有資格スタッフのロール定義は? | Step 3, Step 5 |
| Q3 | inference_trace_logs のデータ保持期間の法的要件は? | Step 4 |
| Q4 | アスリート向け UI で表示する推論結果の粒度はどこまでか? | Step 5.1 |
| Q5 | 既存のコンディション・スコアエンジンとの統合優先度は? | Step 2.E |
