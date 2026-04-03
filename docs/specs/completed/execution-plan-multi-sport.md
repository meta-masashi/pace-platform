# PACE v6.2 マルチスポーツ拡張 — 実行計画書

- **作成日**: 2026-04-03
- **ステータス**: 初版
- **前提文書**: pm-plan-v6.md (v6.2), MASTER-SPEC-CURRENT.md (v6.1)
- **対象**: 5競技(soccer/baseball/basketball/rugby/other)のSportProfile導入

---

## 0. 現状分析サマリー

### 0.1 既存コードの状態

| 項目 | 状態 | 備考 |
|------|------|------|
| `sport_profiles.go` | **未作成** | `config/` に `config.go` のみ |
| `sport-profiles.ts` | **未作成** | `config.ts` にフラット構造 |
| `basketball/constants.ts` | **未作成** | `src/lib/` にサッカーのみ |
| `baseball/constants.ts` | **未作成** | 同上 |
| `organizations.sport` カラム | **存在しない** | athletes.sport のみ |
| onboarding API の sport 保存 | **BUG**: org に未保存 | athletes にのみ保存 |
| Go Node 0-5 の sport 分岐 | **なし** | 全ノード競技非依存 |
| TS Node 0-5 の sport 分岐 | **なし** | 同上 |
| `AthleteContext.sport` | **string型** | 型制限なし |

### 0.2 変更が必要なファイル一覧

```
【新規作成】(8ファイル)
├── pace-inference/internal/config/sport_profiles.go
├── pace-inference/internal/domain/sport.go
├── pace-platform/lib/engine/v6/config/sport-profiles.ts
├── src/lib/basketball/constants.ts
├── src/lib/baseball/constants.ts
├── src/lib/rugby/constants.ts
├── supabase/migrations/XXX_add_sport_to_organizations.sql
└── pace-platform/tests/unit/sport-profiles.test.ts

【変更】(16ファイル)
├── Go Engine (7ファイル)
│   ├── pace-inference/internal/config/config.go
│   ├── pace-inference/internal/domain/context.go
│   ├── pace-inference/internal/pipeline/node0_ingestion.go
│   ├── pace-inference/internal/pipeline/node2_feature.go
│   ├── pace-inference/internal/pipeline/node3_inference.go
│   ├── pace-inference/internal/pipeline/node4_decision.go
│   └── pace-inference/internal/pipeline/node5_presentation.go
├── TS Engine (6ファイル)
│   ├── pace-platform/lib/engine/v6/types.ts
│   ├── pace-platform/lib/engine/v6/config.ts
│   ├── pace-platform/lib/engine/v6/pipeline.ts
│   ├── pace-platform/lib/engine/v6/nodes/node0-ingestion.ts
│   ├── pace-platform/lib/engine/v6/nodes/node4-decision.ts
│   └── pace-platform/lib/engine/v6/nodes/node5-presentation.ts
├── API (2ファイル)
│   ├── pace-platform/app/api/onboarding/setup/route.ts
│   └── pace-platform/app/api/pipeline/route.ts
└── Frontend (1ファイル)
    └── src/lib/football/constants.ts (SportProfile参照に変更)
```

---

## 1. Sprint 1: 競技別基盤 + DB修正

**目標**: SportProfile データ層を Go/TS 両方に作成し、DB・APIのバグを修正する

### Task 1-1: Go `sport_profiles.go` 作成
- **ファイル**: `pace-inference/internal/config/sport_profiles.go`
- **内容**: 5競技の `SportProfile` 構造体定義 + パラメータ値
- **SP**: 5
- **詳細設計**:

```go
// pace-inference/internal/config/sport_profiles.go
package config

// SportProfile は競技固有の推論パラメータプロファイル
type SportProfile struct {
    SportID              string
    IsContactSport       bool
    ACWRRedLine          float64
    ACWRYouthFactor      float64
    MonotonyRedLine      float64
    PainThresholdAdjust  float64
    EWMA                 EWMAConfig
    Weights              FeatureWeights
    Tissue               map[string]TissueParams
    RecommendedActions   map[string][]string // priority → actions
}

// 5競技プロファイル
var SportProfiles = map[string]SportProfile{
    "soccer":     soccerProfile(),
    "baseball":   baseballProfile(),
    "basketball": basketballProfile(),
    "rugby":      rugbyProfile(),
    "other":      otherProfile(),
}

func soccerProfile() SportProfile {
    return SportProfile{
        SportID:             "soccer",
        IsContactSport:      true,
        ACWRRedLine:         1.5,
        ACWRYouthFactor:     0.867,
        MonotonyRedLine:     2.0,
        PainThresholdAdjust: 1.2,
        EWMA: EWMAConfig{
            AcuteLambda:  2.0 / (7.0 + 1.0),   // 0.25
            ChronicLambda: 2.0 / (28.0 + 1.0),  // 0.069
        },
        Weights: FeatureWeights{
            ACWRExcess:      2.5,
            WellnessDecline: 2.0,
            InjuryHistory:   1.5,
            MonotonyInfo:    0.3,
        },
        Tissue: map[string]TissueParams{
            "metabolic":       {HalfLifeDays: 2, Alpha: 0.5, Beta: 0.3, Tau: 0.5, M: 1.5},
            "structural_soft": {HalfLifeDays: 7, Alpha: 0.3, Beta: 0.1, Tau: 0.8, M: 2.0},
            "structural_hard": {HalfLifeDays: 21, Alpha: 0.1, Beta: 0.05, Tau: 1.2, M: 2.5},
            "neuromotor":      {HalfLifeDays: 3, Alpha: 0.4, Beta: 0.2, Tau: 0.6, M: 1.8},
        },
        RecommendedActions: map[string][]string{
            "RED":    {"トレーニング中止、医療スタッフによる評価を実施してください", "FIFA 11+ 傷害予防プログラムの段階的再開を検討"},
            "ORANGE": {"高強度トレーニングを30-50%削減してください", "接触練習からの一時的除外を検討"},
            "YELLOW": {"リカバリーセッションを推奨します", "FIFA 11+ ウォームアッププロトコルを実施"},
            "GREEN":  {"通常通りトレーニング継続可能です", "FIFA 11+ 傷害予防プログラムを日常的に実施"},
        },
    }
}

func baseballProfile() SportProfile {
    return SportProfile{
        SportID:             "baseball",
        IsContactSport:      false,
        ACWRRedLine:         1.3,    // 投球負荷は保守的閾値 (Fleisig 2022)
        ACWRYouthFactor:     0.867,
        MonotonyRedLine:     2.0,    // 投手は登板間隔で管理、野手は別途
        PainThresholdAdjust: 1.0,    // ノンコンタクト
        EWMA: EWMAConfig{
            AcuteLambda:  2.0 / (7.0 + 1.0),    // 0.25
            ChronicLambda: 2.0 / (21.0 + 1.0),  // 0.091 (21日: 投球回復サイクル考慮)
        },
        Weights: FeatureWeights{
            ACWRExcess:      2.0,  // ACWR閾値自体が低いため重みを下げる
            WellnessDecline: 2.5,  // 肩肘の主観悪化が直結 (Wilk 2009)
            InjuryHistory:   2.0,  // 再発率が高い (Fleisig 2011)
            MonotonyInfo:    0.5,  // 連日試合の構造的高Monotonyを考慮
        },
        Tissue: map[string]TissueParams{
            "metabolic":       {HalfLifeDays: 2, Alpha: 0.5, Beta: 0.3, Tau: 0.5, M: 1.5},
            "structural_soft": {HalfLifeDays: 10, Alpha: 0.3, Beta: 0.1, Tau: 0.8, M: 2.0}, // 腱回復が遅い
            "structural_hard": {HalfLifeDays: 28, Alpha: 0.1, Beta: 0.05, Tau: 1.2, M: 2.5}, // 骨ストレス長期
            "neuromotor":      {HalfLifeDays: 3, Alpha: 0.4, Beta: 0.2, Tau: 0.6, M: 1.8},
        },
        RecommendedActions: map[string][]string{
            "RED":    {"投球禁止、医療スタッフによる肩・肘の評価を実施してください", "Pitch Smart ガイドラインに基づく段階的復帰プロトコルを検討"},
            "ORANGE": {"投球数を50%削減、またはブルペン投球のみに制限してください", "Thrower's Ten プログラム（レベル1: 軽負荷）を実施"},
            "YELLOW": {"投球数をモニタリングしながら練習継続可能です", "Thrower's Ten プログラム + 肩甲骨安定化エクササイズを推奨"},
            "GREEN":  {"通常通り練習・試合参加可能です", "投球前のダイナミックウォームアップ + Thrower's Ten を推奨"},
        },
    }
}

func basketballProfile() SportProfile {
    return SportProfile{
        SportID:             "basketball",
        IsContactSport:      true,
        ACWRRedLine:         1.4,    // Svilar 2018: ジャンプ負荷で保守的
        ACWRYouthFactor:     0.867,
        MonotonyRedLine:     2.5,    // 週3-4試合で構造的高Monotony
        PainThresholdAdjust: 1.1,    // セミコンタクト
        EWMA: EWMAConfig{
            AcuteLambda:  2.0 / (7.0 + 1.0),   // 0.25
            ChronicLambda: 2.0 / (28.0 + 1.0),  // 0.069
        },
        Weights: FeatureWeights{
            ACWRExcess:      2.3,  // ジャンプ・着地負荷 (Svilar 2018)
            WellnessDecline: 2.0,
            InjuryHistory:   1.5,
            MonotonyInfo:    0.3,
        },
        Tissue: map[string]TissueParams{
            "metabolic":       {HalfLifeDays: 2, Alpha: 0.5, Beta: 0.3, Tau: 0.5, M: 1.5},
            "structural_soft": {HalfLifeDays: 7, Alpha: 0.3, Beta: 0.1, Tau: 0.8, M: 2.0},
            "structural_hard": {HalfLifeDays: 21, Alpha: 0.1, Beta: 0.05, Tau: 1.2, M: 2.5},
            "neuromotor":      {HalfLifeDays: 3, Alpha: 0.4, Beta: 0.2, Tau: 0.6, M: 1.8},
        },
        RecommendedActions: map[string][]string{
            "RED":    {"トレーニング中止、医療スタッフによる評価を実施してください", "足関節・膝の状態を確認し、段階的復帰プロトコルを検討"},
            "ORANGE": {"ジャンプ系ドリル・カッティング動作を制限してください", "足関節安定性エクササイズ + バランスボードトレーニングを重点実施"},
            "YELLOW": {"リカバリーセッションを推奨します", "ACL予防プログラム（Nordic Hamstring + Single-leg Balance）を実施"},
            "GREEN":  {"通常通りトレーニング継続可能です", "足関節安定性プログラム + ACL予防エクササイズを日常的に実施"},
        },
    }
}

func rugbyProfile() SportProfile {
    return SportProfile{
        SportID:             "rugby",
        IsContactSport:      true,
        ACWRRedLine:         1.5,    // Gabbett 2016 原著
        ACWRYouthFactor:     0.867,
        MonotonyRedLine:     2.0,
        PainThresholdAdjust: 1.4,    // 高衝撃コンタクト
        EWMA: EWMAConfig{
            AcuteLambda:  2.0 / (7.0 + 1.0),
            ChronicLambda: 2.0 / (28.0 + 1.0),
        },
        Weights: FeatureWeights{
            ACWRExcess:      2.5,
            WellnessDecline: 2.0,
            InjuryHistory:   1.5,
            MonotonyInfo:    0.3,
        },
        Tissue: map[string]TissueParams{
            "metabolic":       {HalfLifeDays: 2, Alpha: 0.5, Beta: 0.3, Tau: 0.5, M: 1.5},
            "structural_soft": {HalfLifeDays: 5, Alpha: 0.3, Beta: 0.1, Tau: 0.8, M: 2.0},  // 高衝撃で半減期短縮
            "structural_hard": {HalfLifeDays: 14, Alpha: 0.1, Beta: 0.05, Tau: 1.2, M: 2.5}, // 同上
            "neuromotor":      {HalfLifeDays: 3, Alpha: 0.4, Beta: 0.2, Tau: 0.6, M: 1.8},
        },
        RecommendedActions: map[string][]string{
            "RED":    {"トレーニング中止、医療スタッフによる評価を実施してください", "コンタクト練習からの即時除外、HIA（頭部傷害評価）を検討"},
            "ORANGE": {"コンタクト練習からの一時的除外を検討してください", "高強度トレーニングを30-50%削減"},
            "YELLOW": {"リカバリーセッションを推奨します", "非コンタクトの有酸素トレーニングに限定"},
            "GREEN":  {"通常通りトレーニング継続可能です", "傷害予防プログラム（肩・頸部の安定化）を日常的に実施"},
        },
    }
}

func otherProfile() SportProfile {
    // サッカーと同一のデフォルト値（保守的）
    return soccerProfile() // SportID を "other" に上書き
}
```

### Task 1-2: Go `config.go` に SportProfile 統合
- **ファイル**: `pace-inference/internal/config/config.go`
- **変更**: `DefaultConfig()` → `ConfigForSport(sport string) PipelineConfig` に変更
- **SP**: 3
- **詳細設計**:

```go
// ConfigForSport は競技に応じた PipelineConfig を返す
// 未知の sport は "other" プロファイルにフォールバック
func ConfigForSport(sport string) PipelineConfig {
    profile, ok := SportProfiles[sport]
    if !ok {
        profile = SportProfiles["other"]
    }

    cfg := DefaultConfig()
    cfg.Thresholds.ACWRRedLine = profile.ACWRRedLine
    cfg.Thresholds.MonotonyRedLine = profile.MonotonyRedLine
    cfg.EWMA = profile.EWMA
    cfg.Weights = profile.Weights
    cfg.TissueDefaults = profile.Tissue
    return cfg
}
```

### Task 1-3: Go `sport.go` 列挙型作成
- **ファイル**: `pace-inference/internal/domain/sport.go`
- **内容**: `SportID` 型 + バリデーション関数
- **SP**: 2

```go
package domain

type SportID string

const (
    SportSoccer     SportID = "soccer"
    SportBaseball   SportID = "baseball"
    SportBasketball SportID = "basketball"
    SportRugby      SportID = "rugby"
    SportOther      SportID = "other"
)

var ValidSports = []SportID{SportSoccer, SportBaseball, SportBasketball, SportRugby, SportOther}

func IsValidSport(s string) bool {
    for _, v := range ValidSports {
        if string(v) == s {
            return true
        }
    }
    return false
}

func NormalizeSport(s string) SportID {
    if IsValidSport(s) {
        return SportID(s)
    }
    return SportOther
}
```

### Task 1-4: TS `sport-profiles.ts` 作成
- **ファイル**: `pace-platform/lib/engine/v6/config/sport-profiles.ts`
- **内容**: Go版と値が完全一致する TypeScript SportProfile
- **SP**: 3
- **依存**: Task 1-1
- **詳細設計**:

```typescript
// pace-platform/lib/engine/v6/config/sport-profiles.ts
import type { PipelineConfig } from '../types';

export type SportID = 'soccer' | 'baseball' | 'basketball' | 'rugby' | 'other';

export interface SportProfile {
  sportId: SportID;
  isContactSport: boolean;
  acwrRedLine: number;
  acwrYouthFactor: number;
  monotonyRedLine: number;
  painThresholdAdjust: number;
  ewma: { acuteLambda: number; chronicLambda: number };
  featureWeights: {
    acwrExcess: number;
    wellnessDecline: number;
    injuryHistory: number;
    monotonyInfo: number;
  };
  tissueDefaults: Record<string, { halfLifeDays: number; alpha: number; beta: number; tau: number; m: number }>;
  recommendedActions: Record<string, string[]>;
}

export const SPORT_PROFILES: Record<SportID, SportProfile> = {
  soccer: { /* Go版と完全一致する値 */ },
  baseball: { /* ... */ },
  basketball: { /* ... */ },
  rugby: { /* ... */ },
  other: { /* soccer と同一 */ },
};

/** 競技に応じた PipelineConfig partial を生成 */
export function sportConfigOverrides(sport: string): Partial<PipelineConfig> {
  const profile = SPORT_PROFILES[sport as SportID] ?? SPORT_PROFILES.other;
  return {
    thresholds: {
      acwrRedLine: profile.acwrRedLine,
      monotonyRedLine: profile.monotonyRedLine,
      // ... 他の閾値
    },
    ewma: profile.ewma,
    // ... 他のオーバーライド
  };
}
```

### Task 1-5: TS `config.ts` に sport 引数追加
- **ファイル**: `pace-platform/lib/engine/v6/config.ts`
- **変更**: `configForSport(sport: string): PipelineConfig` 関数追加
- **SP**: 2
- **依存**: Task 1-4

```typescript
import { sportConfigOverrides } from './config/sport-profiles';

export function configForSport(sport: string): PipelineConfig {
  return mergePipelineConfig(DEFAULT_PIPELINE_CONFIG, sportConfigOverrides(sport));
}
```

### Task 1-6: DB マイグレーション — organizations.sport カラム追加
- **ファイル**: `supabase/migrations/XXX_add_sport_to_organizations.sql`
- **SP**: 2
- **詳細**:

```sql
-- organizations テーブルに sport カラムを追加
ALTER TABLE organizations
  ADD COLUMN sport TEXT NOT NULL DEFAULT 'other'
  CHECK (sport IN ('soccer', 'baseball', 'basketball', 'rugby', 'other'));

-- 既存行はデフォルト 'other' が適用される
-- 既にathletes.sportが設定されている場合、organizationsを更新する
UPDATE organizations o
SET sport = (
  SELECT DISTINCT a.sport
  FROM athletes a
  WHERE a.organization_id = o.id
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM athletes a
  WHERE a.organization_id = o.id
  AND a.sport IS NOT NULL
  AND a.sport != ''
);

COMMENT ON COLUMN organizations.sport IS '競技種目。チーム登録時に選択。推論パイプラインとUI/UXの両方に適用';
```

### Task 1-7: onboarding/setup API 修正（BUG-11）
- **ファイル**: `pace-platform/app/api/onboarding/setup/route.ts`
- **変更**: organizations INSERT に `sport: body.sport` を追加
- **SP**: 1
- **依存**: Task 1-6

```typescript
// 修正箇所: organizations INSERT
const { data: org } = await supabase
  .from('organizations')
  .insert({
    name: body.organizationName,
    sport: body.sport || 'other',  // ← 追加
    plan: 'standard',
  })
  .select('id')
  .single();
```

### Task 1-8: pipeline/route.ts 修正 — sport から SportProfile 適用
- **ファイル**: `pace-platform/app/api/pipeline/route.ts`
- **変更**: `organizations.sport` を取得し `configForSport()` で動的に Config を生成
- **SP**: 3
- **依存**: Task 1-5, 1-6

```typescript
// 修正箇所: パイプライン実行時
const { data: org } = await supabase
  .from('organizations')
  .select('sport')
  .eq('id', context.orgId)
  .single();

const config = configForSport(org?.sport ?? 'other');
const pipeline = new InferencePipeline(config);
```

### Sprint 1 合計: **8タスク / 21 SP**

---

## 2. Sprint 2: Go/TS ノード競技対応

**目標**: 全6ノードに SportProfile パラメータを注入し、競技別推論を実現する

### Task 2-1: Go Node 0 修正 — SportProfile ロード + Config 上書き
- **ファイル**: `pace-inference/internal/pipeline/node0_ingestion.go`
- **変更**: `AthleteContext.Sport` から `ConfigForSport()` を呼び出し、`PipelineState.Config` を上書き
- **SP**: 3
- **依存**: Sprint 1 完了

```go
func (n *Node0Ingestion) Execute(state *PipelineState) error {
    // 既存の正規化ロジック...

    // 追加: 競技別 Config を PipelineState に適用
    sport := domain.NormalizeSport(state.Context.Sport)
    state.Config = config.ConfigForSport(string(sport))
    state.Context.IsContactSport = config.SportProfiles[string(sport)].IsContactSport

    // 既存: 組織半減期の適用
    // state.Context.TissueHalfLifes は SportProfile.Tissue から自動取得

    return nil
}
```

### Task 2-2: Go Node 2 修正 — 競技別 EWMA スパン使用
- **ファイル**: `pace-inference/internal/pipeline/node2_feature.go`
- **変更**: `state.Config.EWMA` から AcuteLambda/ChronicLambda を取得（既にConfigから読んでいれば変更不要、確認のみ）
- **SP**: 2
- **依存**: Task 2-1

### Task 2-3: Go Node 3 修正 — 競技別 FeatureWeights 使用
- **ファイル**: `pace-inference/internal/pipeline/node3_inference.go`
- **変更**: `state.Config.Weights` からロジスティック回帰の重みを取得
- **SP**: 2
- **依存**: Task 2-1

### Task 2-4: Go Node 4 修正 — 競技別 ACWR閾値 + PainThreshold 調整
- **ファイル**: `pace-inference/internal/pipeline/node4_decision.go`
- **変更箇所**:
  1. `checkMechanicalRisk()`: `state.Config.Thresholds.ACWRRedLine` を使用（SportProfile由来）
  2. `checkSafety()`: `PainThresholdAdjust` で痛み閾値をコンタクトスポーツで調整
- **SP**: 3
- **依存**: Task 2-1

```go
// P1: 痛み閾値の競技別調整
func (n *Node4Decision) checkSafety(state *PipelineState) (*DecisionResult, bool) {
    painThreshold := float64(state.Config.Thresholds.PainRedFlag)
    // コンタクトスポーツの外傷性痛みは閾値を引き上げ
    if state.Context.IsContactSport && state.Input.PainType == "traumatic" {
        profile := config.SportProfiles[state.Context.Sport]
        painThreshold *= profile.PainThresholdAdjust
    }

    if state.Input.SubjectiveScores.PainNRS >= painThreshold {
        // P1 発火
    }

    // P2: state.Config.Thresholds.ACWRRedLine は既に競技別値
    // ...
}
```

### Task 2-5: Go Node 5 修正 — 競技別推奨アクション
- **ファイル**: `pace-inference/internal/pipeline/node5_presentation.go`
- **変更**: `SportProfile.RecommendedActions` から競技固有の推奨を取得
- **SP**: 3
- **依存**: Task 2-1

```go
func (n *Node5Presentation) getRecommendations(state *PipelineState, decision string) []string {
    sport := domain.NormalizeSport(state.Context.Sport)
    profile := config.SportProfiles[string(sport)]

    if actions, ok := profile.RecommendedActions[decision]; ok {
        return actions
    }
    // フォールバック: "other" プロファイル
    return config.SportProfiles["other"].RecommendedActions[decision]
}
```

### Task 2-6: TS パイプライン競技対応
- **ファイル**: `pace-platform/lib/engine/v6/pipeline.ts` + 各ノード
- **変更**: Go側と同一の競技分岐をTSフォールバックに適用
- **SP**: 5
- **依存**: Sprint 1 TS タスク完了

```typescript
// pipeline.ts: コンストラクタで sport を受け取り Config を生成
constructor(sport?: string, configOverrides?: Partial<PipelineConfig>) {
  const sportConfig = sport ? configForSport(sport) : DEFAULT_PIPELINE_CONFIG;
  this.config = configOverrides
    ? mergePipelineConfig(sportConfig, configOverrides)
    : sportConfig;
}
```

### Task 2-7: Go パイプライン競技別テスト
- **ファイル**: `pace-inference/internal/pipeline/pipeline_test.go`
- **内容**: 5競技 × P1-P5 の判定結果テスト
- **SP**: 5
- **依存**: Task 2-1 ~ 2-5

```
テストマトリクス:
┌──────────┬────────┬──────────┬────────────┬───────┬───────┐
│ Scenario │ soccer │ baseball │ basketball │ rugby │ other │
├──────────┼────────┼──────────┼────────────┼───────┼───────┤
│ P1 Pain  │ ≥8     │ ≥8       │ ≥8         │ ≥8×1.4│ ≥8    │
│ P2 ACWR  │ >1.5   │ >1.3     │ >1.4       │ >1.5  │ >1.5  │
│ P3 3-day │ 共通   │ 共通     │ 共通       │ 共通  │ 共通  │
│ P4 GAS   │ 共通   │ 共通     │ 共通       │ 共通  │ 共通  │
│ P5 Normal│ 共通   │ 共通     │ 共通       │ 共通  │ 共通  │
│ Monotony │ >2.0   │ >2.0     │ >2.5       │ >2.0  │ >2.0  │
└──────────┴────────┴──────────┴────────────┴───────┴───────┘

各セル: 閾値ちょうどの入力 → 期待される priority/decision を検証
```

### Sprint 2 合計: **7タスク / 23 SP**

---

## 3. Sprint 3: データ入力 + 品質ゲート

**目標**: 推論トレースログ・品質ゲート・RLS の完全化

### Task 3-1: inference_trace_logs テーブル確認 + RLS + インデックス
- **ファイル**: DB マイグレーション
- **SP**: 3
- **内容**: 既存テーブルに `sport_profile_applied TEXT` カラム追加。RLS ポリシー設定

### Task 3-2: device_kappa マスタテーブル作成
- **ファイル**: DB マイグレーション
- **SP**: 2
- **内容**: デバイス信頼度定数テーブル

### Task 3-3: pipeline/route.ts — トレースログ保存の完全化
- **ファイル**: `pace-platform/app/api/pipeline/route.ts`
- **SP**: 3
- **依存**: Task 3-1
- **内容**: nodeResults の実値を inference_trace_logs に保存。`sport_profile_applied` を含める

### Task 3-4: 品質ゲート確認・修正
- **ファイル**: `pace-inference/internal/pipeline/quality_gate.go` + TS版
- **SP**: 3
- **内容**: `qualityScore < 0.6` の GREEN→YELLOW 降格ロジック確認

### Task 3-5: 傾向通知 — 3日間線形回帰
- **ファイル**: `pace-inference/internal/pipeline/trend.go` + TS版
- **SP**: 3
- **内容**: ACWR閾値接近検出

### Task 3-6: RLS 実装
- **ファイル**: DB マイグレーション
- **SP**: 5
- **内容**: Player(自分のみ) / Coach(チーム全員) / Doctor(トレースログ含む全データ)

### Sprint 3 合計: **6タスク / 19 SP**

---

## 4. Sprint 4: フロントエンド（データ入力）

**目標**: 選手・スタッフ向け入力画面の構築

### Task 4-1: sRPE・睡眠品質・ウェルネス入力フォーム（モバイル）
- **SP**: 5

### Task 4-2: CSV アップロード画面
- **SP**: 3

### Task 4-3: EHR 既往歴チェックボックス入力画面
- **SP**: 3

### Task 4-4: セットアップウィザード改修 — 競技選択UI強化
- **SP**: 2
- **依存**: Task 1-7
- **内容**: 競技アイコン・説明文追加、5競技のカード選択UI

### Sprint 4 合計: **4タスク / 13 SP**

---

## 5. Sprint 5: フロントエンド（判定表示 + 競技別UI）

**目標**: MDTコパイロット画面 + 競技別UI最適化

### Task 5-1: MDT コパイロット画面
- **SP**: 8
- **内容**: リスクサマリー・推論トレース・推奨アクション・承認ボタン + 競技名表示

### Task 5-2: P1 即時通知 + P2 担当者通知
- **SP**: 5

### Task 5-3: 法的免責事項コンポーネント
- **SP**: 2

### Task 5-4: 人間承認フローUI
- **SP**: 5
- **依存**: Task 5-1, 5-3

### Task 5-5: 競技別UI最適化
- **SP**: 5
- **依存**: Sprint 1 完了
- **内容**:

```
ダッシュボード指標表示の切替:
┌──────────────┬──────────────────┬──────────────────┬───────────────────┬──────────────────┐
│              │ soccer           │ baseball         │ basketball        │ rugby            │
├──────────────┼──────────────────┼──────────────────┼───────────────────┼──────────────────┤
│ 主要負荷指標 │ ACWR+スプリント  │ ACWR+投球数      │ ACWR+ジャンプ回数 │ ACWR+衝撃G       │
│ 痛み表示     │ 標準NRS          │ 肩/肘NRS強調     │ 膝/足首NRS強調    │ 頭部/頸部NRS強調 │
│ 推奨アクション│ スプリント制限   │ 投球数制限       │ ジャンプ制限      │ コンタクト除外   │
│ 痛み部位     │ 下肢中心         │ 肩・肘・腰       │ 膝・足首・腰     │ 全身+頭部        │
└──────────────┴──────────────────┴──────────────────┴───────────────────┴──────────────────┘
```

### Task 5-6: 競技別推奨アクション文言
- **SP**: 3
- **依存**: Task 2-5 (Node 5 の出力)

### Sprint 5 合計: **6タスク / 28 SP**

---

## 6. Sprint 6: テスト + i18n

**目標**: 全競技のE2Eテスト + 日本語化

### Task 6-1: E2E パイプライン全体実行テスト
- **SP**: 8
- **内容**: 5競技 × Node 0→5 の正常系・異常系・フォールバック

### Task 6-2: 競技別 P2 閾値テスト
- **SP**: 5
- **内容**: soccer(1.5), baseball(1.3), basketball(1.4), rugby(1.5), other(1.5)

### Task 6-3: P1 アラート発火 → 通知 → 承認フロー E2E
- **SP**: 5

### Task 6-4: 品質ゲート降格テスト
- **SP**: 3

### Task 6-5: パフォーマンステスト
- **SP**: 3
- **内容**: Go < 50ms, TS < 500ms

### Task 6-6: i18n 全 UI テキスト日本語化
- **SP**: 3

### Sprint 6 合計: **6タスク / 27 SP**

---

## 7. 定数ファイル設計（Sprint 4-5 で実装）

### 7.1 `src/lib/basketball/constants.ts`

```typescript
export const BASKETBALL_ACTIVITY_MAP = [
  { maxLoad: 150,  label: 'Recovery',      menu: 'シューティング・フリースロー・軽いドリル (15分)' },
  { maxLoad: 400,  label: 'Standard',      menu: 'ハーフコート練習・3on3 (40分)' },
  { maxLoad: 700,  label: 'High Intensity', menu: '5on5 スクリメージ・フルコート練習 (60分)' },
  { maxLoad: Infinity, label: 'Game',       menu: 'フル試合 (40-48分)' },
];

export const BASKETBALL_POSITION_CONFIG = {
  PG: { label: 'ポイントガード',     color: 'text-blue-700',   bgColor: 'bg-blue-100' },
  SG: { label: 'シューティングガード', color: 'text-cyan-700',   bgColor: 'bg-cyan-100' },
  SF: { label: 'スモールフォワード',  color: 'text-brand-700',  bgColor: 'bg-brand-100' },
  PF: { label: 'パワーフォワード',    color: 'text-amber-700',  bgColor: 'bg-amber-100' },
  C:  { label: 'センター',           color: 'text-red-700',    bgColor: 'bg-red-100' },
} as const;

export const BASKETBALL_SRPE_LABELS = [
  '全く疲れない',                      // 0
  'ほとんど疲れない',                   // 1
  '少し疲れた',                        // 2
  'やや疲れた（ウォームアップ程度）',     // 3
  '普通（シューティングドリル）',        // 4
  'ややキツい（3on3）',                 // 5
  'キツい（5on5スクリメージ）',          // 6
  'かなりキツい（フルコート練習）',       // 7
  '非常にキツい（フルゲーム前半終了）',   // 8
  '極めてキツい',                       // 9
  '限界（フルゲーム40-48分）',           // 10
] as const;

export const BASKETBALL_QUESTIONS = {
  ankleInstability: '足首に不安定感はありますか？',
  kneePatellar:     '膝（特に膝蓋腱）に痛みはありますか？',
  kneeACL:          '着地時に膝に不安感はありますか？',
  achilles:         'アキレス腱に張りはありますか？',
  shoulder:         '肩に違和感はありますか？',
  shin:             'すねに痛みはありますか？（シンスプリント）',
  lowerBack:        '腰に痛みはありますか？',
  finger:           '指に痛みはありますか？',
  mentalReadiness:  '集中力は問題ありませんか？',
} as const;

export const BASKETBALL_GAME_DAY_PRESCRIPTION = {
  'MD-1': {
    lowLoad:  'シューティング + ストレッチ → PRIME (Fresh)',
    highLoad: '軽いシューティング確認のみ',
  },
  'MD-0': {
    GREEN:  'フル出場可能',
    YELLOW: '出場時間制限を推奨（25分以下）',
    ORANGE: 'ベンチスタート + 限定出場',
    RED:    '出場不可',
  },
  'MD+1': {
    default: 'アクティブリカバリー（軽いシューティング + ストレッチ）',
  },
  'B2B': {  // Back-to-Back 連戦
    default: '連戦回復プロトコル: 出場時間30%削減を推奨',
  },
} as const;
```

### 7.2 `src/lib/baseball/constants.ts`

```typescript
export const BASEBALL_ACTIVITY_MAP_PITCHER = [
  { maxLoad: 50,   label: 'Recovery',    menu: 'キャッチボール・軽いブルペン (15分)' },
  { maxLoad: 200,  label: 'Moderate',    menu: 'ブルペン投球 (40-60球)' },
  { maxLoad: 400,  label: 'Game Relief', menu: '実戦登板・中継ぎ相当 (20-30球)' },
  { maxLoad: Infinity, label: 'Game Start', menu: '先発登板 (80-100球+)' },
];

export const BASEBALL_ACTIVITY_MAP_FIELDER = [
  { maxLoad: 100,  label: 'Recovery',    menu: 'バッティングケージ・軽い守備練習' },
  { maxLoad: 300,  label: 'Standard',    menu: '打撃練習 + 守備/走塁 (60分)' },
  { maxLoad: 500,  label: 'Scrimmage',   menu: '紅白戦・シート打撃' },
  { maxLoad: Infinity, label: 'Game',     menu: '公式戦フル出場' },
];

export const BASEBALL_POSITION_CONFIG = {
  SP:    { label: '先発投手',       color: 'text-red-700',    bgColor: 'bg-red-100',    isPitcher: true },
  RP:    { label: '中継ぎ投手',     color: 'text-orange-700', bgColor: 'bg-orange-100', isPitcher: true },
  CP:    { label: '抑え投手',       color: 'text-amber-700',  bgColor: 'bg-amber-100',  isPitcher: true },
  C_pos: { label: '捕手',          color: 'text-blue-700',   bgColor: 'bg-blue-100',   isPitcher: false },
  '1B':  { label: '一塁手',        color: 'text-cyan-700',   bgColor: 'bg-cyan-100',   isPitcher: false },
  '2B':  { label: '二塁手',        color: 'text-teal-700',   bgColor: 'bg-teal-100',   isPitcher: false },
  SS:    { label: '遊撃手',        color: 'text-brand-700',  bgColor: 'bg-brand-100',  isPitcher: false },
  '3B':  { label: '三塁手',        color: 'text-indigo-700', bgColor: 'bg-indigo-100', isPitcher: false },
  LF:    { label: '左翼手',        color: 'text-green-700',  bgColor: 'bg-green-100',  isPitcher: false },
  CF:    { label: '中堅手',        color: 'text-emerald-700', bgColor: 'bg-emerald-100', isPitcher: false },
  RF:    { label: '右翼手',        color: 'text-lime-700',   bgColor: 'bg-lime-100',   isPitcher: false },
  DH:    { label: '指名打者',      color: 'text-gray-700',   bgColor: 'bg-gray-100',   isPitcher: false },
} as const;

export const BASEBALL_SRPE_LABELS = [
  '全く疲れない',                    // 0
  'ほとんど疲れない',                 // 1
  '少し疲れた',                      // 2
  'やや疲れた（守備練習）',           // 3
  '普通（バッティングケージ）',       // 4
  'ややキツい（打撃練習）',           // 5
  'キツい（紅白戦）',                // 6
  'かなりキツい（先発60球）',         // 7
  '非常にキツい（先発80球）',         // 8
  '極めてキツい（先発100球超）',      // 9
  '限界（延長完投）',                // 10
] as const;

export const BASEBALL_QUESTIONS_PITCHER = {
  shoulderHeaviness: '肩（特に外旋時）に重さ・違和感はありますか？',
  elbowMedial:       '肘の内側に痛みはありますか？',
  forearmTightness:   '前腕に張りはありますか？',
  gripStrength:       '握力の低下を感じますか？',
  releasePoint:       'リリースポイントに違和感はありますか？',
  lowerBack:          '腰に痛みはありますか？',
  mentalReadiness:    '今日の登板に集中できそうですか？',
} as const;

export const BASEBALL_QUESTIONS_FIELDER = {
  shoulderThrowing:   'スローイング時に肩に痛みはありますか？',
  batSwingPain:       'バットスイング時に痛みはありますか？',
  hamstringTightness: 'ハムストリングに張りはありますか？',
  lowerBack:          '腰に痛みはありますか？',
  legHeaviness:       '走塁時に脚の重さを感じますか？',
  mentalReadiness:    '今日の試合に集中できそうですか？',
} as const;

export const PITCH_SMART_GUIDELINES = {
  dailyMax: {
    '15-18': 95,
    '19+': 110,  // 推奨値（制限なしだがガイドライン）
  },
  requiredRestDays: [
    { minPitches: 1,  maxPitches: 30,  restDays: 0 },
    { minPitches: 31, maxPitches: 45,  restDays: 1 },
    { minPitches: 46, maxPitches: 65,  restDays: 2 },
    { minPitches: 66, maxPitches: 80,  restDays: 2 },
    { minPitches: 81, maxPitches: 95,  restDays: 3 },
    { minPitches: 96, maxPitches: 999, restDays: 4 },
  ],
} as const;

export const BASEBALL_GAME_DAY_PRESCRIPTION = {
  pitcher: {
    'MD-1': '軽いキャッチボールのみ。ブルペン禁止。',
    'MD-0': {
      GREEN:  '登板可能',
      YELLOW: '投球数制限付きで登板可能',
      ORANGE: '登板回避推奨',
      RED:    '登板不可',
    },
    'MD+1': '投球禁止。フラッシュ（軽い有酸素15分）のみ。',
    'MD+2': 'キャッチボール可。ブルペンは不可。',
    'MD+3': '軽いブルペン可（30球以下）。',
    'MD+4': '通常練習に復帰可能。',
  },
  fielder: {
    'MD-1': '軽いバッティング確認 + ストレッチ',
    'MD-0': {
      GREEN: 'フル出場可能',
      YELLOW: 'スタメン出場、途中交代を検討',
      RED: '出場不可',
    },
    'MD+1': 'アクティブリカバリー',
  },
} as const;
```

---

## 8. 依存関係グラフ

```
Sprint 1 (基盤)
├── Task 1-1: Go sport_profiles.go
│   ├── Task 1-2: Go config.go 統合 ───┐
│   └── Task 1-3: Go sport.go          │
├── Task 1-4: TS sport-profiles.ts     │
│   └── Task 1-5: TS config.ts ────────┤
├── Task 1-6: DB migration ────────────┤
│   ├── Task 1-7: onboarding API fix   │
│   └── Task 1-8: pipeline route fix ──┘
│
Sprint 2 (ノード対応) ← Sprint 1 全完了が前提
├── Task 2-1: Go Node 0 (SportProfile ロード)
│   ├── Task 2-2: Go Node 2 (EWMA)
│   ├── Task 2-3: Go Node 3 (FeatureWeights)
│   ├── Task 2-4: Go Node 4 (ACWR閾値 + Pain)
│   └── Task 2-5: Go Node 5 (推奨アクション)
├── Task 2-6: TS パイプライン全体
└── Task 2-7: テスト ← 2-1~2-6 全完了

Sprint 3 (データ層) ← Sprint 2 並行可
├── Task 3-1~3-6 ← Sprint 1 の DB タスク完了が前提

Sprint 4-5 (フロントエンド) ← Sprint 2 完了後
├── Sprint 4: データ入力UI
└── Sprint 5: 判定表示 + 競技別UI ← Sprint 4 完了後

Sprint 6 (テスト) ← Sprint 5 完了後
└── E2E + パフォーマンス + i18n
```

---

## 9. リスク分析

### 9.1 既存サッカーロジックのリグレッション: **低リスク**

| 保証策 | 内容 |
|--------|------|
| デフォルトフォールバック | `sportProfile` 未指定時は `DEFAULT_PIPELINE_CONFIG` をそのまま使用 |
| soccer Profile の値 | 現行 `DefaultConfig()` と完全一致する値を設定 |
| ゴールデンテスト | Sprint 2-7 で「sport='soccer'の出力 === sport未指定の出力」を検証 |
| ConfigForSport("soccer") | `DefaultConfig()` と同一出力になることを CI で保証 |

### 9.2 Go/TS 間の値不一致: **中リスク**

| 緩和策 | 内容 |
|--------|------|
| スナップショットテスト | 5競技 × 同一入力 → Go/TS の decision/priority/ACWR が一致するか CI 検証 |
| JSON 外部化（Phase 2） | パラメータ値を JSON に外部化し、Go embed + TS import で同一ソース化 |

### 9.3 野球投手の設計複雑度: **中〜高リスク**

| 項目 | 対応 |
|------|------|
| MVP では投球数 ACWR なし | sRPE ベースの通常 ACWR のみ。`ACWRRedLine=1.3` の保守的閾値で安全側に倒す |
| 投手固有の DailyInput 拡張 | Phase 2 で `pitchingLoad` フィールド追加。MVP はsRPE + 主観スコアで運用 |
| 先発 vs 中継ぎ分岐 | Phase 2。MVP ではポジション（SP/RP/CP）による UI 差分のみ |

### 9.4 エビデンス不足パラメータ

| パラメータ | Level | フォールバック | 感度分析 |
|-----------|-------|--------------|---------|
| バスケ ACWR 1.4 | 3 (Svilar 2018) | 1.5 (保守的) | Phase 2 |
| 野球 ChronicSpan 21日 | 3-4 (Fleisig 2022) | 28日 (標準) | Phase 2 |
| ラグビー structural_soft 半減期 5日 | 4-5 | 7日 (標準) | Phase 2 |
| バスケ Monotony 2.5 | 4-5 | 2.0 (標準) | Phase 2 |

### 9.5 マイグレーション（既存ユーザー影響ゼロ）

1. `organizations.sport` に `DEFAULT 'other'` → 既存チームは自動的に `other` プロファイル適用
2. `other` プロファイル = 現行 `DefaultConfig()` と同一値 → 推論結果に変化なし
3. UI は `sport === 'other'` の場合、現行サッカーUIと同一表示
4. 既存ユーザーはダッシュボード設定画面で sport を変更可能（Sprint 5）

---

## 10. 実装サマリー

| Sprint | タスク数 | SP | 主要成果物 |
|--------|---------|-----|-----------|
| **Sprint 1** | 8 | 21 | SportProfile (Go/TS), DB migration, API bugfix |
| **Sprint 2** | 7 | 23 | Node 0-5 競技対応 (Go/TS), 競技別テスト |
| **Sprint 3** | 6 | 19 | トレースログ, 品質ゲート, RLS |
| **Sprint 4** | 4 | 13 | 入力UI (sRPE, CSV, EHR, セットアップ改修) |
| **Sprint 5** | 6 | 28 | MDTコパイロット, 競技別UI, 通知, 承認フロー |
| **Sprint 6** | 6 | 27 | E2E テスト, パフォーマンス, i18n |
| **合計** | **37** | **131** | |

### 新規作成ファイル: 8
### 変更ファイル: 16
### 推定変更行数: ~2,500行（テスト含む）

---

## 付録: 実装着手順序（推奨）

```
Day 1-2: Sprint 1 (Task 1-1 → 1-3 → 1-4 → 1-5 並行、1-6 → 1-7 → 1-8 並行)
Day 3-5: Sprint 2 (Task 2-1 → 2-2~2-5 並行 → 2-6 → 2-7)
Day 5-7: Sprint 3 (Sprint 2 と部分的に並行可)
Day 8-9: Sprint 4 (フロントエンド入力)
Day 10-12: Sprint 5 (フロントエンド判定表示)
Day 13-14: Sprint 6 (テスト + i18n)
```

**クリティカルパス**: Sprint 1 (Task 1-1) → Sprint 2 (Task 2-1) → Sprint 5 (Task 5-1) → Sprint 6 (Task 6-1)
