# P6-003: AI エージェント DB 設計仕様書

**バージョン:** 1.0
**作成日:** 2026-04-02
**ステータス:** ドラフト（レビュー待ち）
**準拠:** PACE v6.1 マスタープラン Phase 2（SaaS アップセル源泉）
**関連ADR:** ADR-028（AI Agent Training Plan）, ADR-029（LLM 責務分離）

---

## 1. 概要

AI エージェント（Gemini 2.0 Flash + LangChain ReAct）がトレーニング計画を自動生成する機能の DB 設計。

**A2 原則遵守:** LLM 出力は計画生成のみ。コンディション判定には一切不使用。
**Human-in-the-loop:** 全ての AI 生成計画はスタッフ承認が必須。

---

## 2. P6-003-1: ai_plan_jobs テーブル

### スキーマ

```sql
-- AI 計画生成ジョブ管理テーブル
-- A2原則: LLM出力は計画生成のみ。判定ロジックには不使用。
CREATE TABLE public.ai_plan_jobs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          UUID NOT NULL REFERENCES public.organizations(id),
  team_id         UUID NOT NULL REFERENCES public.teams(id),
  requested_by    UUID NOT NULL REFERENCES public.staff(id),

  -- ジョブ設定
  job_type        TEXT NOT NULL CHECK (job_type IN ('weekly_plan', 'rehab_roadmap', 'peaking_plan')),
  target_week     DATE NOT NULL,                    -- 対象週の月曜日
  parameters      JSONB NOT NULL DEFAULT '{}',      -- 追加パラメータ（テンプレート選択等）

  -- トークン管理（プラン別制御）
  token_budget    INTEGER NOT NULL DEFAULT 30000,   -- Pro: 30K, Enterprise: 100K
  tokens_used     INTEGER DEFAULT 0,
  model_id        TEXT NOT NULL DEFAULT 'gemini-2.0-flash',

  -- ステータス管理
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  error_message   TEXT,

  -- メタデータ
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX idx_ai_plan_jobs_org_status ON public.ai_plan_jobs (org_id, status);
CREATE INDEX idx_ai_plan_jobs_team_week ON public.ai_plan_jobs (team_id, target_week);

-- RLS
ALTER TABLE public.ai_plan_jobs ENABLE ROW LEVEL SECURITY;

-- スタッフは自組織のジョブのみ参照・作成可能
CREATE POLICY "ai_plan_jobs_org_read" ON public.ai_plan_jobs
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.staff WHERE user_id = auth.uid())
  );

CREATE POLICY "ai_plan_jobs_org_insert" ON public.ai_plan_jobs
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM public.staff WHERE user_id = auth.uid())
  );
```

### トークンバジェット（プラン別）

| プラン | 月次トークン上限 | 1ジョブ上限 | 根拠 |
|--------|---------------|-----------|------|
| Standard | — (機能なし) | — | AI 計画は Pro 以上 |
| Pro | 30,000 tokens/月 | 10,000 | Gemini Flash コスト考慮 |
| Pro+CV | 30,000 tokens/月 | 10,000 | 同上 |
| Enterprise | 100,000 tokens/月 | 30,000 | ヘビーユース対応 |

---

## 3. P6-003-2: weekly_plans テーブル

### スキーマ

```sql
-- 週次トレーニング計画テーブル
-- Human-in-the-loop: スタッフ承認必須。approved でなければ選手に表示しない。
CREATE TABLE public.weekly_plans (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id          UUID NOT NULL REFERENCES public.organizations(id),
  team_id         UUID NOT NULL REFERENCES public.teams(id),
  job_id          UUID REFERENCES public.ai_plan_jobs(id),  -- AI生成の場合のみ

  -- 計画内容
  target_week     DATE NOT NULL,                    -- 対象週の月曜日
  plan_type       TEXT NOT NULL CHECK (plan_type IN ('team', 'individual')),
  athlete_id      UUID REFERENCES public.athletes(id),  -- individual の場合のみ
  content         JSONB NOT NULL,                   -- 計画の構造化データ
  notes           TEXT,                             -- スタッフの補足メモ

  -- 承認フロー（human-in-the-loop）
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'archived')),
  created_by      UUID NOT NULL REFERENCES public.staff(id),
  approved_by     UUID REFERENCES public.staff(id),
  approved_at     TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Hard Lock 制約: ACWR > 1.5 の選手は low_intensity 強制
  hard_lock_applied BOOLEAN DEFAULT false,

  -- メタデータ
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 制約
  CONSTRAINT weekly_plans_individual_requires_athlete
    CHECK (plan_type = 'team' OR athlete_id IS NOT NULL)
);

-- インデックス
CREATE INDEX idx_weekly_plans_team_week ON public.weekly_plans (team_id, target_week);
CREATE INDEX idx_weekly_plans_athlete_week ON public.weekly_plans (athlete_id, target_week)
  WHERE athlete_id IS NOT NULL;
CREATE INDEX idx_weekly_plans_status ON public.weekly_plans (org_id, status)
  WHERE status IN ('pending_approval', 'approved');

-- RLS
ALTER TABLE public.weekly_plans ENABLE ROW LEVEL SECURITY;

-- スタッフは自組織の計画を参照・作成・更新可能
CREATE POLICY "weekly_plans_staff_read" ON public.weekly_plans
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.staff WHERE user_id = auth.uid())
  );

CREATE POLICY "weekly_plans_staff_write" ON public.weekly_plans
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM public.staff WHERE user_id = auth.uid())
  );

CREATE POLICY "weekly_plans_staff_update" ON public.weekly_plans
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM public.staff WHERE user_id = auth.uid())
  );

-- 選手は approved の自分の計画のみ参照可能
CREATE POLICY "weekly_plans_athlete_read" ON public.weekly_plans
  FOR SELECT USING (
    status = 'approved'
    AND (
      plan_type = 'team'
      OR athlete_id IN (SELECT id FROM public.athletes WHERE user_id = auth.uid())
    )
    AND org_id IN (SELECT org_id FROM public.athletes WHERE user_id = auth.uid())
  );
```

### content JSONB 構造

```json
{
  "monday": {
    "session_type": "high_intensity",
    "focus": "sprint_intervals",
    "duration_min": 90,
    "target_srpe": 70,
    "notes": "ウォームアップ重視"
  },
  "tuesday": {
    "session_type": "recovery",
    "focus": "mobility_stretching",
    "duration_min": 45,
    "target_srpe": 20,
    "notes": null
  },
  ...
  "constraints_applied": [
    { "athlete_id": "...", "constraint": "hard_lock_acwr", "forced_intensity": "low" }
  ]
}
```

---

## 4. P6-003-3: マイグレーションファイル

**→ `supabase/migrations/20260402000002_ai_agent_tables.sql`**

上記 2 テーブルの DDL + RLS + インデックスを 1 ファイルにまとめる。

---

## 5. ステータス遷移図

### ai_plan_jobs

```
queued → running → completed
                 → failed
       → cancelled
```

### weekly_plans

```
draft → pending_approval → approved → archived
                         → rejected → draft（修正後再提出）
```

**選手への表示:** `approved` のみ。他のステータスはスタッフのみ閲覧可能。

---

## 完了基準チェックリスト

- [x] ai_plan_jobs テーブル DDL + RLS + インデックス定義
- [x] weekly_plans テーブル DDL + RLS + インデックス定義
- [x] トークンバジェットのプラン別上限定義
- [x] ステータス遷移図（ジョブ + 計画）
- [x] Human-in-the-loop（スタッフ承認必須）の制約明記
- [x] Hard Lock 制約（ACWR > 1.5 → low_intensity 強制）
- [x] A2 原則遵守のスキーマコメント明記
- [x] content JSONB の構造定義
