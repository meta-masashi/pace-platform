# PACE Platform セッション引き継ぎプロンプト

以下をそのまま新しいセッションに貼り付けてください。

---

## コンテキスト

あなたはPACE Platform（サッカー特化コンディション判定支援Webアプリ）のフルスタック開発を継続します。

### リポジトリ
- GitHub: `meta-masashi/pace-platform`
- ブランチ: `main`（本番）、`claude/practical-booth`（開発ワークツリー）
- ワークツリー: `/Users/masashisasaki/Desktop/PACE-platform/.claude/worktrees/practical-booth`
- デプロイ: Vercel（`pace-platform/` ディレクトリ）、Supabase（DB + Auth）
- 本番URL: https://hachi-riskon.com

### 技術スタック
- **フロントエンド**: Next.js 15 + React 19 + Tailwind CSS 3 + Recharts + Framer Motion
- **バックエンド**: Supabase PostgreSQL + RLS + Edge Functions
- **推論エンジン**: Go 1.26（`pace-inference/`）— 6ノードパイプライン（TypeScript版もフォールバックとして維持）
- **AI**: Google Gemini 2.0 Flash（NLGテキスト整形のみ、判定ロジックには使用しない）
- **決済**: Stripe サブスクリプション
- **CI/CD**: GitHub Actions（ci.yml + deploy.yml）
- **状態管理**: React Query v5 + Zustand

### プロジェクト構造
```
pace-platform/          ← Vercel にデプロイされるNext.jsアプリ
  app/(staff)/          ← スタッフPC画面（4ハブサイドバー）
  app/(athlete)/        ← 選手モバイルPWA（5タブ下部ナビ）
  app/api/              ← 61 APIエンドポイント
  lib/engine/v6/        ← TypeScript推論エンジン（フォールバック用）
  lib/supabase/         ← client.ts（ブラウザ）、server.ts（サーバー）
  hooks/                ← React Queryカスタムフック
pace-inference/         ← Go推論エンジン（28ファイル、2,534行）
  internal/pipeline/    ← 6ノード + 品質ゲート + 傾向検出
  internal/math/        ← EWMA、Z-Score、sigmoid、decay
  internal/domain/      ← 型定義
  cmd/server/           ← HTTPサーバー（POST /v6/infer, GET /health）
supabase/migrations/    ← 55マイグレーションファイル
docs/specs/             ← 仕様書群
```

### 認証情報
- **Supabase Project Ref**: `lwoadgkwywhyixgddkow`
- **Supabase Access Token**: `.env.local` に保存済み（`sbp_7a2343cc7c91365a20dbf3e69ec3c86e718aa8de`）
- **Supabase Anon Key**: GitHub Secrets `NEXT_PUBLIC_SUPABASE_ANON_KEY` に設定済み
- **テストアカウント**:
  - スタッフ: `master@paceplatform.com` / `Pace2026!`（他AT/PT/S&Cも同パスワード）
  - 選手: `m.sasaki.at@gmail.com` / `Pace2026!`（田中健太 FW#9）

### 完了済みの作業（このセッションで実施）

1. **Gap Remediation Phase 1-5**（18タスク）: P1 Sleep+Fatigue、NSAID masking、LOCF+Decay、Φ_structural、η_NM、Baseline reset、PHV age correction 等
2. **REMEDIATION-PLAN-v2**（18タスク）: ODE/EKF/FFM排除、複合P2条件、P3慢性不適応、FIFA 11+推奨、GPS統合、エビデンスベース特徴量重み
3. **UI/UX Phase 1-4**: React Query導入、MetricLabel二層表現、SOAP Wizard、API統合、ラプソード型選手詳細、コーチング履歴
4. **モバイルアプリ**: 履歴ページ、プロフィールページ、5タブナビ、PWA manifest
5. **Go推論エンジン**: 全4週間完了（型定義→数学関数→6ノード→品質ゲート→傾向検出→HTTPハンドラー→Docker）
6. **セキュリティ**: RLS修正（選手データ分離）、CSP unsafe-eval除去、xlsx削除、OWASP監査
7. **認証修正**: Cookie-based SSR、middleware crash guard、env var dot notation、ロール分岐ルーティング
8. **Bio-War Room**: ダッシュボードから非表示（ファイルは保持）
9. **指標日本語化**: Readiness→コンディションスコア、Fitness EWMA→フィットネス（42日平均）等

### 未完了・次のアクション

1. **仕様書更新**: `docs/specs/MASTER-SPEC-CURRENT.md` を最新状態に書き直し（調査完了、書き出し未着手）
2. **Go エンジンの本番統合**: TypeScript API → Go サービス呼び出し（Shadow Mode → カナリア → 全量）
3. **残存品質課題**: `as unknown as` 13箇所（JSONB cast、構造上不可避）、`as string` 259箇所（共通ヘルパー `lib/supabase/type-helpers.ts` 作成済みだが未適用）
4. **トレーニング生成**: 選手データが取得できない問題（RLS or team_id不一致の可能性）
5. **レポート生成**: カラム名修正済み（`recorded_date`→`date`）、動作確認未了
6. **選手詳細ページのデザイン改善**: アバター追加、シミュレーター統合（ユーザーが「一旦現状のまま」と判断）

### 重要な設計原則

1. **判定ロジックは100%確定的**: Node 0-4にLLMの出力を使ってはならない。Geminiは Node 5 のテキスト整形のみ
2. **品質問題時は専門家に委譲**: qualityScore < 0.6 → YELLOW + 「専門家の確認を推奨」
3. **傾向は通知するが判定は変えない**: 閾値未到達でも接近傾向があれば TrendNotice として追加
4. **エビデンスベース**: Oxford CEBM Level 2 以上のみ判定ロジックに採用
5. **TypeScript版は削除しない**: Go がダウンしたら即座にフォールバック
6. **デプロイ**: `pace-platform/` が Vercel にデプロイされる（`src/` ではない）。cherry-pick で main に反映
7. **RLS**: `get_my_org_id()` は `SECURITY DEFINER` で循環参照を回避。選手は `user_id = auth.uid()` のみ

### 主要仕様書

- `docs/specs/MASTER-SPEC-CURRENT.md` — マスター仕様書（更新予定）
- `docs/specs/SYSTEM-AUDIT-REPORT.md` — 3ループ監査レポート
- `docs/specs/GO-MIGRATION-RISK-MITIGATION.md` — Go移行リスク緩和設計
- `docs/specs/REMEDIATION-PLAN-v2-EVIDENCE-BASED.md` — エビデンスベース改修計画
- `docs/specs/CV-ENGINE-REMEDIATION-SOCCER-EVIDENCE-BASED.md` — CVエンジン改修

### DB Management API の使い方

```bash
TOKEN="sbp_7a2343cc7c91365a20dbf3e69ec3c86e718aa8de"
curl -s -X POST "https://api.supabase.com/v1/projects/lwoadgkwywhyixgddkow/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT COUNT(*) FROM athletes"}'
```
