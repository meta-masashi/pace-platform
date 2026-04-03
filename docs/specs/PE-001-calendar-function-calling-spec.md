# PE-001: Google Calendar — Function Calling 戦略仕様書

**バージョン:** 1.0
**作成日:** 2026-04-02
**ステータス:** ドラフト（レビュー待ち）
**準拠:** PACE v6.1 マスタープラン Phase 2（SaaS アップセル源泉）
**関連ADR:** ADR-027（Calendar 負荷予測統合）

---

## 1. 概要

Google Calendar からチームのスケジュールイベントを取得し、
Function Calling（JSON Schema Mode）で構造化データに変換する。
これにより `contextFlags.isGameDay` / `isHighLoadDay` を自動設定し、
P1-P5 判定のコンテキスト・オーバーライドに使用する。

**プランゲーティング:** `feature_calendar_sync` — Pro 以上

---

## 2. 既存実装の確認

以下のファイルが既に実装済み:

| ファイル | 機能 |
|---------|------|
| `src/app/api/calendar/connect/route.ts` | OAuth2 接続設定 |
| `src/app/api/calendar/callback/route.ts` | OAuth2 コールバック |
| `src/app/api/calendar/sync/route.ts` | イベント同期（30日先まで） |
| `src/app/api/calendar/events/route.ts` | イベント取得 |
| `pace-platform/lib/calendar/google-client.ts` | Google Calendar クライアント |
| `pace-platform/lib/calendar/token-crypto.ts` | AES-256-GCM トークン暗号化 |
| `pace-platform/lib/calendar/load-predictor.ts` | イベントベース負荷予測 |
| `pace-platform/lib/calendar/types.ts` | 型定義 |

---

## 3. Function Calling によるイベント分類

### 3.1 現状の分類方式

現在 `calendar/sync` は文字列マッチングでイベントを分類している。
Function Calling に移行することで、曖昧なイベント名も正確に分類できる。

### 3.2 Function Calling 仕様（JSON Schema Mode）

```typescript
const classifyEventTool = {
  name: 'classify_calendar_event',
  description: 'Classify a calendar event into a training load category',
  parameters: {
    type: 'object',
    properties: {
      event_type: {
        type: 'string',
        enum: ['match', 'high_intensity', 'moderate', 'recovery', 'rest', 'travel', 'meeting', 'other'],
        description: 'The category of the event based on expected physical load',
      },
      expected_load: {
        type: 'string',
        enum: ['very_high', 'high', 'moderate', 'low', 'none'],
        description: 'Expected physical load level',
      },
      is_competition: {
        type: 'boolean',
        description: 'Whether this is an official competition/match',
      },
    },
    required: ['event_type', 'expected_load', 'is_competition'],
  },
};
```

### 3.3 contextFlags 自動設定

| Calendar Event Type | contextFlags | 影響 |
|--------------------|--------------|----|
| `match` (is_competition=true) | `isGameDay = true` | P4 閾値 +1（寛容化） |
| `high_intensity` | `isHighLoadDay = true` | Fatigue Focus モード発動 |
| `travel` | `isTravelDay = true` | 主観低下を許容 |
| `rest` | — | 通常処理 |

### 3.4 A2 原則との整合性

Function Calling の出力は **構造化された enum/boolean 値** であり、LLM の「判断」ではない。
- LLM は「試合」「練習」等のラベルを付与するだけ
- 実際の判定ロジック（P4 閾値調整等）は確定的アルゴリズムが行う
- Function Calling が失敗した場合: 全 contextFlags = false（保守的デフォルト）

---

## 4. ADR-027: Calendar 負荷予測統合

**→ 別ファイル: `docs/adr/ADR-027-calendar-load-prediction.md`**（既存の場合は更新）

### 決定事項

1. Calendar 連携は Pro 以上限定（OAuth 管理コスト + API コスト）
2. Function Calling で構造化出力を保証（自由テキスト生成を禁止）
3. Calendar データは `schedule_events` テーブルに保存（既存）
4. 同期頻度: 1日1回自動 + スタッフの手動トリガー
5. contextFlags への反映は Node 4 判定の **入力** として使用（判定ロジック自体は不変）

---

## 完了基準チェックリスト

- [x] Function Calling の JSON Schema 定義
- [x] contextFlags 自動設定ルール定義
- [x] A2 原則との整合性確認（LLM は分類のみ、判定は確定的）
- [x] プランゲーティング（Pro 以上）明記
- [x] 既存実装との差分明確化
