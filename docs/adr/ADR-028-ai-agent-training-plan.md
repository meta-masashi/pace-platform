# ADR-028: AIエージェント自律トレーニング計画生成アーキテクチャ

**ステータス:** 承認済み
**作成日:** 2026-03-24
**決定者:** @05-architect, @07-ml-engineer, @04-backend
**関連ADR:** ADR-001（システム全体）, ADR-009（LLMコンテキスト注入）, ADR-020（EWMA疲労スコア）, ADR-021（ACWR Zone）, ADR-023（AIデイリーコーチ）, ADR-025（Readiness正規化）

---

## コンテキスト

PACE Platform Phase 6 にて、AIエージェントが選手の生体データ・過去のトレーニング履歴・ACWR・疲労スコアを総合的に解析し、週次トレーニング計画（Weekly Training Plan）を自律的に生成する機能を導入する。

主要な設計課題：

1. **安全性**: AIが自律生成した計画を誰の確認もなく選手に配信することは禁止。スタッフによる承認フローが必須
2. **LLMフレームワーク選択**: ADR-023の Gemini 2.0 Flash 直接呼び出しか、LangChain エージェントか
3. **自律エージェント設計**: 複数ステップの推論（データ収集 → 分析 → 計画生成 → 自己評価）を LangChain ReAct でどう実装するか
4. **Human-in-the-loop**: 承認ループの UX と DB 状態管理
5. **コスト管理**: エージェントの多段階 LLM 呼び出しによるコスト増大の抑制（防壁3）

---

## 決定事項

### 1. アーキテクチャ選択: LangChain ReAct Agent + Gemini 2.0 Flash

**比較検討:**

| アプローチ | 柔軟性 | コスト | 実装工数 | 承認ループ対応 |
|-----------|--------|--------|---------|--------------|
| Gemini 単一呼び出し | 低 | 最小 | 小 | 手動実装が必要 |
| **LangChain ReAct Agent** | **高** | **中** | **中** | **Built-in で対応可** |
| LangGraph（ステートマシン） | 最高 | 高 | 大 | 最適だが Over-engineering |
| Dify API（ノーコード） | 低 | 中 | 小 | Dify ワークフローで対応可 |

**LangChain ReAct Agent を採用する理由:**
- `HumanApprovalCallbackHandler` による Human-in-the-loop が組み込みで提供される
- ツール呼び出し（Supabase クエリ・ACWR 計算・疲労スコア取得）を宣言的に定義できる
- ADR-023 の Gemini 2.0 Flash を LLM バックエンドとして再利用（新規コスト・新規依存関係なし）
- LangGraph は表現力が高いが現フェーズのスコープを超過する。将来的な移行パスとして保持

**Dify API を採用しない理由:**
- ツール定義のカスタマイズ性が低く、Supabase RLS 経由のデータ取得を安全に実装しにくい
- 承認ループのステート管理が Dify ワークフロー内に閉じてしまい、Supabase の `weekly_training_plans` テーブルとの整合管理が困難

### 2. エージェントアーキテクチャ設計

```
Trigger: 週次バッチ（毎週月曜 06:00 JST）or スタッフ手動起動
    |
    v
Supabase Edge Function: generate-training-plan
    |
    | LangChain ReAct Agent
    v
+------------------------------------------+
|  TrainingPlanAgent                        |
|                                          |
|  Tools:                                  |
|  1. get_athlete_profile(athlete_id)      |
|  2. get_recent_acwr(athlete_id, days=28) |
|  3. get_fatigue_score(athlete_id)        |
|  4. get_injury_flags(athlete_id)         |
|  5. get_previous_plans(athlete_id, n=4)  |
|  6. calculate_load_progression(...)      |
|                                          |
|  LLM: Gemini 2.0 Flash                   |
|  Max iterations: 6（コスト上限）          |
|  Temperature: 0.3（再現性重視）          |
+------------------------------------------+
    |
    | 生成完了
    v
weekly_training_plans テーブル
  status = 'pending_approval'
    |
    | Supabase Realtime 通知
    v
Staff Web App: 承認待ちバッジ表示
    |
    | スタッフ操作
    v
+------------------------+
|  承認ループ（必須）      |
|                        |
|  [承認]                |
|    → status = 'approved'|
|    → アスリートに配信   |
|                        |
|  [修正して承認]         |
|    → スタッフがテキスト |
|      修正              |
|    → status = 'approved'|
|    → アスリートに配信   |
|                        |
|  [却下]                |
|    → status = 'rejected'|
|    → 再生成オプション   |
+------------------------+
    |
    v
Athlete Mobile App: 今週のプラン表示
```

### 3. LangChain エージェント実装設計

```typescript
// supabase/functions/generate-training-plan/index.ts

import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { AgentExecutor, createReactAgent } from 'langchain/agents';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

// ツール定義
const getAthleteProfileTool = new DynamicStructuredTool({
  name: 'get_athlete_profile',
  description: '選手の基本プロファイル（年齢・ポジション・過去の怪我歴）を取得する',
  schema: z.object({ athlete_id: z.string().uuid() }),
  func: async ({ athlete_id }) => {
    const { data } = await supabaseAdmin
      .from('athletes')
      .select('id, name, date_of_birth, position, injury_history')
      .eq('id', athlete_id)
      .single();
    // PHI（名前）は除外してLLMに渡す
    return JSON.stringify({
      id: data.id,
      age: calculateAge(data.date_of_birth),
      position: data.position,
      injury_history: data.injury_history,
    });
  },
});

const getRecentAcwrTool = new DynamicStructuredTool({
  name: 'get_recent_acwr',
  description: '直近N日間のACWR（急性/慢性ワークロード比）を取得する。1.0-1.3が理想ゾーン',
  schema: z.object({
    athlete_id: z.string().uuid(),
    days: z.number().min(14).max(42).default(28),
  }),
  func: async ({ athlete_id, days }) => {
    // ADR-021の ACWR Zone 計算ロジックを呼び出す
    const acwrData = await computeAcwr(supabaseAdmin, athlete_id, days);
    return JSON.stringify(acwrData);
  },
});

// エージェント設定
const llm = new ChatGoogleGenerativeAI({
  model: 'gemini-2.0-flash',
  temperature: 0.3,
  apiKey: Deno.env.get('GEMINI_API_KEY'),
});

const SYSTEM_PROMPT = `
あなたはスポーツサイエンスの専門家AIです。
提供されたツールを使用して選手のデータを収集し、安全で効果的な週次トレーニング計画を生成します。

【絶対遵守ルール】
- 医療診断・処方は行わない
- NRS >= 7 またはACWR > 1.5 の場合は「高強度トレーニング禁止」として計画する
- injury_flags に活動中の傷病がある場合はリハビリ中心の計画にする
- 計画は必ずスタッフの承認を経て選手に届くことを前提に生成する（最終決定権はスタッフにある）
- 出力は必ず指定のJSON形式のみ

【出力形式】
{
  "summary": "今週の方針（100文字以内）",
  "weekly_load_target": { "monday": {...}, "tuesday": {...}, ... },
  "reasoning": "計画の根拠（ACWRとデータに基づく説明）",
  "risk_flags": ["存在する場合のリスク警告"],
  "staff_notes": "スタッフへの申し送り事項"
}
`;

const agent = await createReactAgent({ llm, tools, prompt: SYSTEM_PROMPT });
const agentExecutor = new AgentExecutor({
  agent,
  tools,
  maxIterations: 6,      // コスト上限（防壁3）
  handleParsingErrors: true,
  returnIntermediateSteps: true, // 推論ステップをDBに保存
});
```

### 4. Human-in-the-loop 承認ループ設計

**承認なしで選手に計画が配信される経路を完全に排除する。**

```
状態遷移図:

  [generating]
      |
      | エージェント完了
      v
  [pending_approval]  ←--- スタッフへの Realtime 通知
      |
      +---[スタッフ: 承認]-------→ [approved] → アスリートに Realtime 配信
      |
      +---[スタッフ: 修正+承認]--→ [approved] → アスリートに Realtime 配信
      |                               ↑
      |                         修正内容を staff_edits カラムに記録
      +---[スタッフ: 却下]------→ [rejected]
      |
      +---[7日経過・未対応]----→ [expired]  ← cron job で自動遷移
```

**承認 API エンドポイント:**

```typescript
// PATCH /api/training-plans/:id/approve
// 認証: staff JWT のみ（アスリートは操作不可）
interface ApprovePlanRequest {
  action: 'approve' | 'reject';
  staff_edits?: string;       // 修正内容（approve 時のみ有効）
  rejection_reason?: string;  // 却下理由（reject 時のみ有効）
}
```

### 5. PHI 保護設計（LLM へのデータ注入制限）

ADR-009 の LLM コンテキスト注入設計を継承し、以下のルールを適用する。

```typescript
// LLM に渡すデータの除外ルール
const EXCLUDED_FROM_LLM = [
  'athletes.name',        // 氏名
  'athletes.date_of_birth', // 生年月日（年齢は渡してよい）
  'athletes.contact_info',  // 連絡先
  'soap_notes.*',           // 診療記録（全フィールド）
];

// LLM に渡してよいデータ
const ALLOWED_FOR_LLM = [
  'athletes.age',          // 年齢（計算値）
  'athletes.position',     // ポジション
  'athletes.injury_history', // 怪我歴（種類のみ）
  'daily_metrics.acwr',    // ACWR スコア
  'daily_metrics.readiness_score', // レディネス
  'daily_metrics.fatigue_score',   // 疲労スコア
  'daily_metrics.nrs_pain',        // NRS 疼痛スコア
];
```

### 6. コスト管理設計（防壁3）

| 制限項目 | 値 | 根拠 |
|---------|-----|------|
| エージェント最大反復数 | 6回 | 1計画あたりの最大 LLM 呼び出しを6回に限定 |
| 入力トークン上限 | 8,000 tokens | 超過時はデータを要約して注入 |
| 出力トークン上限 | 2,000 tokens | 週次計画の出力として十分な量 |
| 1日あたり最大自動生成数 | 選手数 × 1 | 重複生成防止 |
| 手動再生成の待機時間 | 1時間 | スタッフによる連続再生成のコスト爆発防止 |

**推定コスト（100名規模チーム）:**

```
1計画あたり:
- 入力: ~6,000 tokens × 6反復 = 36,000 tokens
- 出力: ~500 tokens × 6反復 = 3,000 tokens
- Gemini 2.0 Flash: $0.075/1M input + $0.30/1M output
- 1計画コスト: ~$0.003

100名 × 週次 = 400名・月:
月次コスト: ~$1.2
```

週次計画生成はデイリーコーチ（ADR-023: ~$3〜5/月）より安価。

### 7. エラーハンドリング・フォールバック

```typescript
// エージェント実行のフォールバック設計
try {
  const result = await agentExecutor.invoke({ input: buildPrompt(athleteContext) });
  await savePlan(result, 'pending_approval');
} catch (error) {
  if (error instanceof OutputParserException) {
    // JSON パース失敗 → 生のテキストをスタッフへ通知
    await savePlanError(athleteId, 'parse_error', error.message);
  } else if (error instanceof LLMApiError) {
    // Gemini API エラー → ジョブをキューに戻し、次回バッチで再試行
    await requeueJob(athleteId, retryAfterMs: 3600000); // 1時間後
  } else if (error.message.includes('max_iterations')) {
    // 反復超過 → 中間結果を保存してスタッフに手動確認依頼
    await savePlanPartial(result.intermediateSteps);
  }
}
```

### 8. 将来的な拡張パス

現フェーズでは LangChain ReAct を採用するが、以下の条件が満たされた時点で LangGraph への移行を検討する：

- チーム全体（複数選手）の計画を相互調整する必要が生じた場合（グラフ構造が必要）
- 計画生成 → 実績モニタリング → 適応修正のサイクル管理が必要になった場合
- エージェントの並列実行（選手間の依存関係がない計算の最適化）が必要になった場合

---

## 却下した選択肢

### A. Gemini 単一呼び出し（ADR-023 と同パターン）

**却下理由:**
- 週次計画生成には「データ収集 → 解析 → 計画 → 自己評価」の複数ステップが必要
- 全データを1プロンプトに詰め込むと入力トークンが肥大化し、Gemini のコンテキストウィンドウと品質のトレードオフが生じる
- ツール呼び出しによる動的データ取得の方が出力品質が高い（ReAct パターンの利点）

### B. Dify API によるノーコードエージェント

**却下理由:**
- Supabase RLS パターン（`staff.id = auth.uid()`）に準拠したデータ取得を Dify のHTTPリクエストノードで安全に実装することが困難
- 承認ループの状態を Dify ワークフロー内と Supabase の `weekly_training_plans` テーブルで二重管理する必要が生じ、整合性管理が煩雑
- PHI の LLM への注入制限（ADR-009）をコード外で保証できない

### C. LangGraph ステートマシン

**却下理由:**
- Phase 6 Sprint 1 スコープとして Over-engineering。LangChain ReAct で要件を充足できる
- 追加の学習コスト・実装工数（推定2倍）に対してメリットが現時点では限定的
- 将来の拡張パスとして保持（本 ADR セクション8参照）

---

## 影響範囲

- `supabase/migrations/20260324_phase6_training_plan.sql`: weekly_training_plans テーブル追加
- `supabase/functions/generate-training-plan/`: LangChain ReAct エージェント Edge Function
- `src/app/api/training-plans/`: 承認ループ API Routes
- `src/app/(staff)/training-plans/`: スタッフ向け承認 UI
- `apps/mobile/src/screens/TrainingPlan/`: アスリート向けプラン表示画面
- `package.json`: `@langchain/google-genai`, `langchain`, `zod` 追加
- `.env.example`: 既存 `GEMINI_API_KEY` を再利用（新規変数なし）

---

## 参照

- [LangChain ReAct Agent](https://js.langchain.com/docs/modules/agents/agent_types/react)
- [LangChain Google Generative AI](https://js.langchain.com/docs/integrations/llms/google_ai)
- [ADR-009: LLMコンテキスト注入設計](./ADR-009-llm-context-injection.md)
- [ADR-020: 疲労スコアEWMA設計](./ADR-020-fitness-fatigue-ewma.md)
- [ADR-021: ACWRゾーン定義](./ADR-021-acwr-zones.md)
- [ADR-023: AIデイリーコーチ](./ADR-023-ai-daily-coach.md)
- [ADR-025: Readiness正規化](./ADR-025-readiness-normalization.md)
