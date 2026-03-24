# ADR-001: システムアーキテクチャ — レイヤー分離方針と実装変更指示書の統合

## 状況

PACE Platform v3.2 の商用リリースに向け、以下を確定する必要がある:

1. レイヤー分離方針（フロントエンド / API / データ / AI）
2. 実装変更指示書（2026-03-25）による方針転換の反映
3. Phase 6 計画機能（TeleHealth / 保険請求 / IMU）の正式な廃止記録

## 決定

### レイヤー分離

| レイヤー | 技術 | 責務 |
|---------|------|------|
| フロントエンド | Next.js 15 (App Router) → Vercel | UI / SSR / 静的アセット |
| API 層 | Supabase Edge Functions (TypeScript) | ビジネスロジック / 認証 / レートリミット |
| データ層 | Supabase PostgreSQL + pgvector | データ永続化 / RLS / ベクトル検索 |
| AI 層 | Gemini API / LangChain / Dify | 推論 / RAG / プロンプト管理 |
| CV 層 | FastAPI + Docker (GPU) | 動画解析 / SMPL / 顔マスキング（Phase 3） |

### 実装変更指示書による方針変更

#### 廃止（Phase 6 全機能）

以下はコードベースに**実装されていない計画のみの機能**であり、正式に廃止とする:

- `video_sessions` / `consultation_records` — TeleHealth 関連
- `billing_codes` / `billing_claims` — 保険請求関連
- `ai_plan_jobs` / `weekly_plans` — AIエージェント自律計画関連
- `imu_devices` / `imu_sessions` — IMUセンサー関連

**理由**: 現フェーズでは「ノイズ」。コアバリュー（コンディション管理 + ベイズ傷害評価）に集中する。

#### 強化

- **Googleカレンダー同期**: 試合・高負荷練習スケジュールを負荷予測のコンテキストとして活用
- **コンディション・スコア（ハイブリッド・ピーキング）**: sRPE EWMA ベースの新指標を導入（ADR-002 参照）
- **アラート第一主義**: Critical / Watchlist をすべてのUIの最優先トリガーとする

### 新しい開発フェーズ

旧 Phase 1-6 を Phase A-E に再編:

| Phase | 名前 | 内容 |
|-------|------|------|
| A | Cleanup | 不要な計画の正式廃止・アーキテクチャ基盤構築 |
| B | Engine | sRPE EWMA コンディション・スコア算出ロジック |
| C | Athlete UI | Oura Ring スタイルのサークルUI |
| D | Staff Dashboard | YouTube Analytics スタイルのKPI・チャート |
| E | Calendar Hub | Googleカレンダー連携・負荷予測統合 |

## 選択肢

### レイヤー分離

- **案A（採用）**: Supabase Edge Functions を API 層に使用。Next.js API Routes は BFF（Backend for Frontend）として最小限に留める。
  - メリット: RLS と同一ランタイムで動作、認証トークンの直接検証が可能
  - デメリット: Deno ランタイムの制約（一部 Node.js ライブラリ非互換）

- **案B（不採用）**: Next.js API Routes を API 層として全面使用。
  - 不採用理由: Supabase RLS との二重認証管理が発生、Edge Functions の既存実装（dunning-cron / stripe-webhook / embed-documents）との整合性が取れない

### Phase 6 の扱い

- **案A（採用）**: 正式廃止。DBテーブルは作成しない。
  - メリット: スコープ明確化、開発リソース集中
  - デメリット: 将来再実装時にゼロからの設計が必要

- **案B（不採用）**: 凍結（テーブルのみ作成、機能は実装しない）。
  - 不採用理由: 使用されないテーブルがマイグレーションに混在し、メンテナンスコスト増

## 結果

- Phase 6 関連の全テーブルは作成しない
- 既存マイグレーション（001-014）に Phase 6 テーブルは含まれていないため、変更不要
- `docs/specs/implementation-change-directive.md` を正式な方針文書として参照
- Googleカレンダー OAuth 連携用の環境変数を `.env.example` に追加
- コンディション・スコアの設計詳細は ADR-002 に記録
