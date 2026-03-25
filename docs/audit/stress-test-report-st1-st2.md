# PACE v6.0 ストレステスト報告書 (ST-1 / ST-2)

## 実施日: 2026-03-25
## 対象: pace-platform/ ディレクトリ全体
## 監査者: Claude Opus 4.6 自動セキュリティ監査

---

## ST-1: TypeScript 型安全性監査

### 1.1 TypeScript コンパイラ (`tsc --noEmit`)

**結果: PASS (0 errors)**

`npx tsc --noEmit` は **エラーゼロ** で完了。型レベルの不整合はコンパイラ上は検出されなかった。

### 1.2 ESLint

**結果: 0 errors, 81 warnings**

全て `@typescript-eslint/no-unused-vars` 警告。ESLint エラー (error-level violation) は **ゼロ**。

未使用変数の詳細は以下カテゴリに分類:

| カテゴリ | 件数 | 代表例 |
|---------|------|--------|
| 未使用 import (型) | ~20 | `FeatureVector`, `InferenceOutput`, `PipelineConfig` 等 |
| 未使用変数 (ロジック) | ~15 | `halfCircumference`, `arcLength`, `OPTIONAL_FIELDS` 等 |
| 未使用 state setter | ~10 | `setMappings`, `setLoading`, `setShowForm` 等 (integrations/page.tsx) |
| 未使用 eslint-disable | 7 | 不要な `eslint-disable` ディレクティブ |
| テストコード内 | ~29 | テストヘルパー・モック関数の未使用 |

### 1.3 `as any` キャスト

**検出: 4 件**

| # | 重大度 | ファイル | 行 | 問題 | 修正方針 |
|---|--------|---------|-----|------|---------|
| 1 | LOW | `lib/observability/web-vitals.ts` | 25 | `(globalThis as any)['window']` — window 参照 | `typeof window !== 'undefined'` ガードに置換 |
| 2 | LOW | `lib/observability/web-vitals.ts` | 26 | `(globalThis as any)['navigator']` — navigator 参照 | 同上 |
| 3 | LOW | `lib/observability/web-vitals.ts` | 27 | `(globalThis as any)['sessionStorage']` — sessionStorage 参照 | 同上 |
| 4 | LOW | `lib/billing/stripe-client.ts` | 13 | `(globalThis as any).window` — SSR ガード | 同上 |

**評価**: 全て SSR/ブラウザ環境判定のイディオムであり、セキュリティリスクは低い。ただし型安全性向上のため `typeof window` ガードへの置換を推奨。

### 1.4 Non-null アサーション (`!.`)

**検出: 37 件** (app/ + lib/ 内)

| # | 重大度 | ファイル | 行 | 問題 | 修正方針 |
|---|--------|---------|-----|------|---------|
| 1 | MEDIUM | `lib/reroute/detector.ts` | 205,213,257,265 | `recent[i]!.nrs` — 配列インデックスの非null アサーション | Optional chaining + フォールバック |
| 2 | MEDIUM | `lib/rts/predictor.ts` | 239,247 | `recent[i-1]!.nrs` — 同上 | 同上 |
| 3 | LOW | `lib/learning/lr-updater.ts` | 69 | `dataPoints[0]!.nodeId` — 長さチェック済みだが明示性が欠ける | `dataPoints[0]?.nodeId ?? "unknown"` |
| 4 | LOW | `lib/dbn/engine.ts` | 332 | `projections[i]!.nodeStates` | Optional chaining |
| 5 | LOW | `lib/routing/parser.ts` | 187 | `match[3]!.trim()` — regex マッチの非null アサーション | グループ存在チェック追加 |
| 6 | MEDIUM | `app/api/reroute/detect/route.ts` | 215,224 | `savedProposal!.id` — DB 挿入結果の非null アサーション | 挿入後の明示的 null チェック |
| 7 | HIGH | `app/api/s2s/credentials/route.ts` | 143,173,193,209,255,331,360 | `auth.staff!.org_id`, `auth.user!.id` — 認証結果の非null アサーション (7件) | requireMaster 戻り値の型をナロイングして明示的チェック |
| 8 | LOW | `app/api/assessment/answer/route.ts` | 280-287 | `assessmentResultData!.primaryDiagnosis` 等 (8件) | `if (assessmentResultData)` ガード内で使用するか、ガードの型ナロイングを確認 |
| 9 | LOW | 各 UI コンポーネント | 複数 | `QUADRANTS[0]!.label`, `nodes[0]!.id` 等 | 定数配列は安全だが Optional chaining が望ましい |

### 1.5 未保護 `.json()` 呼び出し

**検出: 100+ 件**

大部分は以下の2パターン:

| パターン | 件数 | リスク |
|---------|------|--------|
| **サーバー側 `request.json()`**: `try-catch` 内で呼ばれている | ~30 | LOW — 適切に保護されている |
| **クライアント側 `res.json()`**: `fetch` 後に直接呼ぶ | ~70 | MEDIUM — ネットワークエラー時にクラッシュの可能性 |

**特記**: `app/api/dbn/simulate/route.ts:56` の `const body = await request.json()` は `try` ブロック内で呼ばれているが、JSON パースエラーの個別ハンドリングがない。他の多くの API ルートは専用の `try-catch` で JSON パースエラーを 400 レスポンスに変換しているのに対し、このルートでは汎用的な 500 エラーになる。

### 1.6 エクスポート関数の戻り値型

**検出: 20+ 件**

`lib/` 配下のエクスポート関数で明示的な戻り値型アノテーションが欠けているもの:
- `runDecayBatch`, `calculateDecayedRisk`, `calculateChronicModifier` (decay/)
- `shapeWithGemini` (nlg/)
- `generateAlertCards` (nlg/)
- `callGeminiWithRetry` (gemini/)
- `generateRehabMenu` (gemini/)
- `checkRateLimit` (gemini/)

TypeScript は推論で対応するが、公開 API の安定性のため明示的アノテーションを推奨。

---

## ST-2: セキュリティ監査

### 2.1 認証バイパス

**結果: 全55 API ルートに認証チェックあり — バイパスなし**

全ルートを精査:
- 53/55 ルートが `createClient()` + `supabase.auth.getUser()` でセッション認証を実施
- 1 ルート (`/api/auth/callback`) は OAuth コールバックとして適切にセッション交換のみ実行
- 1 ルート (`/api/s2s/ingest`) は API キー認証 (Bearer トークン) を使用 — M2M 用途として適切

**追加防御**: `middleware.ts` でも全非公開ルートに対してセッション検証を実施。

| # | 重大度 | ファイル | 問題 | 修正方針 |
|---|--------|---------|------|---------|
| - | - | - | 認証バイパスは検出されなかった | - |

### 2.2 RLS バイパスリスク (Service Role Key)

**検出: 6 箇所** (アプリケーションコード内、テスト・scripts 除外)

| # | 重大度 | ファイル | 行 | 問題 | 修正方針 |
|---|--------|---------|-----|------|---------|
| 1 | MEDIUM | `app/api/s2s/ingest/route.ts` | 116 | `SUPABASE_SERVICE_ROLE_KEY` 使用 — S2S M2M エンドポイント | **妥当**: JWT なしの M2M 通信のため service role が必要。API キー認証 + レートリミットで防御済み。ただし操作対象を最小限に制限する追加ガードを推奨 |
| 2 | LOW | `lib/gemini/rate-limiter.ts` | 57 | レートリミットカウンター更新に service role 使用 | **妥当**: RLS ではユーザー自身のリミット更新を許可できないため |
| 3 | LOW | `lib/observability/tracer.ts` | 51 | トレースログ記録に service role 使用 | **妥当**: 横断的ログ記録のため |
| 4 | LOW | `lib/notifications/email-sender.ts` | 205 | Supabase Edge Function 呼び出しに service role 使用 | **妥当**: サーバー間通信 |
| 5 | LOW | `lib/notifications/morning-scheduler.ts` | 29,53 | スケジューラーが service role 使用 | **妥当**: バッチ処理のため |
| 6 | LOW | `lib/billing/webhook-handler.ts` | 27 | Stripe Webhook 処理に service role 使用 | **妥当**: Webhook はサーバー間通信 |

**評価**: 全て正当なユースケース。ただし service role の使用箇所が分散しているため、中央管理パターン (`lib/supabase/admin-client.ts` 等) への集約を推奨。

### 2.3 SQL インジェクション

**検出: 2 箇所の RPC 呼び出し**

| # | 重大度 | ファイル | 行 | 問題 | 修正方針 |
|---|--------|---------|-----|------|---------|
| 1 | LOW | `lib/decay/batch-processor.ts` | 66 | `.rpc("get_active_risks_for_decay", {...})` | パラメータバインディング使用 — 安全 |
| 2 | LOW | `lib/rag/retriever.ts` | 72 | `.rpc("match_documents", rpcArgs)` | パラメータバインディング使用 — 安全 |

**評価**: Supabase の `.rpc()` はプリペアドステートメントを使用するため SQL インジェクションリスクはない。生 SQL (`sql``, `.raw()`) の使用は **検出されなかった**。

### 2.4 シークレット露出

| # | 重大度 | ファイル | 行 | 問題 | 修正方針 |
|---|--------|---------|-----|------|---------|
| 1 | INFO | `tests/setup.ts` | 20-27 | テスト用モックキー (`sk_test_mock_key_for_testing`, `whsec_test_mock_secret`, `AIza_test_mock_key`) | テスト環境専用で本番キーではない — 問題なし |
| 2 | INFO | `.env` ファイル | - | `.env` ファイルは git にコミットされていない | PASS |

**NEXT_PUBLIC_ 変数の精査**:

| 変数名 | 内容 | リスク |
|--------|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL | LOW — 公開情報 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | LOW — RLS で保護される公開キー |
| `NEXT_PUBLIC_SITE_URL` | サイト URL | LOW — 公開情報 |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN | LOW — 公開情報 |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push 公開鍵 | LOW — 公開鍵のため問題なし |
| `NEXT_PUBLIC_STRIPE_PORTAL_URL` | Stripe ポータル URL | LOW — 公開 URL |
| **`NEXT_PUBLIC_GA4_API_SECRET`** | **GA4 Measurement Protocol API Secret** | **HIGH — GA4 API シークレットが NEXT_PUBLIC_ プレフィックスでクライアントに露出** |
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | GA4 測定 ID | LOW — 公開情報 |

### 2.5 XSS / インジェクション

| # | 重大度 | ファイル | 問題 | 修正方針 |
|---|--------|---------|------|---------|
| 1 | INFO | - | `dangerouslySetInnerHTML` はアプリケーションコードで **使用されていない** | PASS |

**評価**: React のデフォルト XSS 防御が機能しており、`dangerouslySetInnerHTML` は未使用。

### 2.6 CORS / セキュリティヘッダー

| # | 重大度 | ファイル | 問題 | 修正方針 |
|---|--------|---------|------|---------|
| 1 | HIGH | `next.config.ts` + `middleware.ts` | **Content-Security-Policy (CSP) ヘッダーが未設定** | `default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'` 等の CSP を設定 |
| 2 | MEDIUM | `next.config.ts` + `middleware.ts` | **Strict-Transport-Security (HSTS) ヘッダーが未設定** | `Strict-Transport-Security: max-age=31536000; includeSubDomains` を追加 |
| 3 | INFO | `next.config.ts` | `poweredByHeader: false` — 適切 | PASS |
| 4 | INFO | `middleware.ts` | `X-Frame-Options: DENY` — 適切 | PASS |
| 5 | INFO | `middleware.ts` | `X-Content-Type-Options: nosniff` — 適切 | PASS |
| 6 | INFO | `middleware.ts` | `Referrer-Policy: strict-origin-when-cross-origin` — 適切 | PASS |
| 7 | INFO | `middleware.ts` | `Permissions-Policy: camera=(), microphone=(), geolocation=()` — 適切 | PASS |
| 8 | INFO | `next.config.ts` | CORS は明示的に設定されていない (デフォルト same-origin) | PASS |

### 2.7 プロンプトインジェクション (AI セキュリティ)

**防御機構**:
- `lib/shared/security-helpers.ts`: 包括的な入力サニタイズ (`sanitizeUserInput`) + 出力ガードレール (`validateAIOutput`) + 安全なシステムプロンプト構築 (`createSafeSystemPrompt`) が実装済み
- `lib/gemini/client.ts`: `callGeminiWithRetry` 内で `validateAIOutput` を自動適用
- 30+ のインジェクションパターン (日英両対応) を検出・フィルタ

**問題点**:

| # | 重大度 | ファイル | 行 | 問題 | 修正方針 |
|---|--------|---------|-----|------|---------|
| 1 | HIGH | `app/api/soap/generate/route.ts` | 27, 181-232 | **`sanitizeUserInput` をインポートしているが未使用。** DB から取得した `athlete.position`, `athlete.sport` 等のフィールドがサニタイズなしで直接プロンプトに結合される。攻撃者が athlete データに悪意のあるテキストを格納した場合、プロンプトインジェクションが成立する可能性がある | DB データもプロンプト結合前に `sanitizeUserInput` を通す |
| 2 | MEDIUM | `app/api/conditioning/[athleteId]/route.ts` | 15 | **`sanitizeUserInput` をインポートしているが未使用。** `buildInsightPrompt` は数値データのみをプロンプトに結合するため実害リスクは低いが、デッドインポートとして不適切 | 不要インポートの削除、またはテキストフィールド追加時に備えて使用 |
| 3 | MEDIUM | `app/api/morning-agenda/route.ts` | - | Gemini を使用する NLG シェーパーを呼び出すが、入力サニタイズの明示的呼び出しが確認できない | `shapeWithGemini` の入力パスを精査し、必要に応じてサニタイズ追加 |
| 4 | MEDIUM | `app/api/training/generate/route.ts` | - | `team-menu-generator.ts` 経由で Gemini を使用。入力サニタイズの明示的呼び出しが不在 | プロンプト構築時のサニタイズ追加 |
| 5 | MEDIUM | `app/api/rehab/menu/route.ts` | - | `rehab-generator.ts` + `context-injector.ts` 経由で Gemini を使用。入力サニタイズの明示的呼び出しが不在 | コンテキスト注入時のサニタイズ追加 |

### 2.8 入力バリデーション (UUID)

**複数の API ルートで `validateUUID` による入力バリデーションが欠如**:

| # | 重大度 | ファイル | 問題 | 修正方針 |
|---|--------|---------|------|---------|
| 1 | MEDIUM | `app/api/dbn/simulate/route.ts` | `body.athleteId` を `as string` でキャストするのみ、UUID バリデーションなし | `validateUUID` によるバリデーション追加 |
| 2 | MEDIUM | `app/api/soap/generate/route.ts` | `body.athleteId` は `typeof` チェックのみ、UUID 形式バリデーションなし | `validateUUID` 追加 |
| 3 | MEDIUM | `app/api/assessment/start/route.ts` | `body.athleteId` の UUID バリデーションなし | `validateUUID` 追加 |
| 4 | MEDIUM | `app/api/checkin/route.ts` | `body.athlete_id` は `typeof === "string"` チェックのみ | `validateUUID` 追加 |
| 5 | MEDIUM | `app/api/reroute/detect/route.ts` | athleteId の UUID バリデーションなし | `validateUUID` 追加 |
| 6 | MEDIUM | `app/api/training/generate/route.ts` | athleteId の UUID バリデーションなし | `validateUUID` 追加 |
| 7 | MEDIUM | `app/api/morning-agenda/route.ts` | UUID バリデーションなし | `validateUUID` 追加 |
| 8 | MEDIUM | `app/api/counterfactual/evaluate/route.ts` | athleteId の UUID バリデーションなし | `validateUUID` 追加 |
| 9 | MEDIUM | `app/api/rehab/programs/route.ts` | athleteId の UUID バリデーションなし | `validateUUID` 追加 |
| 10 | MEDIUM | `app/api/rehab/menu/route.ts` | athleteId の UUID バリデーションなし | `validateUUID` 追加 |

**注記**: Supabase の RLS + UUID 型カラムにより SQL インジェクションの直接的リスクは低いが、不正な入力による予期しないエラーや潜在的な型混乱攻撃を防ぐため、一貫したバリデーションが必要。

### 2.9 WORM ログ整合性

**結果: 適切に実装されている**

#### `approval_audit_logs` (migration 018):
- RLS 有効
- INSERT ポリシーのみ (自組織チェック付き)
- SELECT ポリシーのみ (自組織チェック付き)
- **UPDATE ポリシーなし** -- WORM 準拠
- **DELETE ポリシーなし** -- WORM 準拠
- SHA-256 データハッシュによる改ざん検知 (`lib/audit/worm.ts`)
- `verifyAuditIntegrity()` による整合性検証関数あり

#### `inference_trace_logs` (migration 021):
- RLS 有効
- INSERT ポリシー (自組織チェック付き)
- SELECT ポリシー (自組織チェック付き)
- UPDATE ポリシーあり（acknowledge 関連のみ）
- **DB トリガー `enforce_trace_log_immutability`** による不変性強制:
  - 承認済みレコードの変更を完全拒否
  - 推論結果フィールド (trace_id, athlete_id, inference_snapshot, decision 等) の変更を完全拒否
- **DB トリガー `prevent_trace_log_delete`** による DELETE 完全禁止
- ON DELETE RESTRICT による参照整合性保護

| # | 重大度 | 問題 | 修正方針 |
|---|--------|------|---------|
| 1 | LOW | `approval_audit_logs` は RLS ポリシー不在により WORM を実現しているが、DB トリガーによる明示的な UPDATE/DELETE 禁止がない。service_role を持つ管理者は理論上 RLS をバイパスして変更可能 | `inference_trace_logs` と同様に DB トリガーを追加して service_role からも保護 |

---

## サマリー

### 検出件数

| 重大度 | 件数 | 主な問題 |
|--------|------|---------|
| **CRITICAL** | **0 件** | - |
| **HIGH** | **3 件** | GA4 API Secret のクライアント露出、CSP ヘッダー未設定、SOAP プロンプトインジェクション経路 |
| **MEDIUM** | **18 件** | HSTS 未設定、UUID バリデーション欠如 (10件)、非null アサーション (4件)、プロンプトサニタイズ未適用 (3件) |
| **LOW** | **12 件** | `as any` キャスト (4件)、非null アサーション (UI/定数) (5件)、WORM トリガー不足 (1件)、RPC (2件) |
| **INFO** | **4 件** | テスト用モックキー、dangerouslySetInnerHTML 未使用確認、CORS デフォルト設定、poweredByHeader 無効化 |

### 全体評価

PACE v6.0 は全体的に **高いセキュリティ水準** を達成している。全 API ルートに認証チェックがあり、RLS が適切に設定され、WORM ログも堅実に実装されている。プロンプトインジェクション防御も包括的なパターンマッチングと出力ガードレールが備わっている。

ただし、以下の 3 点は **優先的な対応** を推奨:

1. **`NEXT_PUBLIC_GA4_API_SECRET`**: GA4 Measurement Protocol の API シークレットがクライアントバンドルに含まれる。`NEXT_PUBLIC_` プレフィックスを除去し、サーバーサイドのみで使用するか、サーバープロキシ経由で GA4 に送信する設計に変更すべき。
2. **CSP ヘッダー未設定**: XSS 攻撃に対する最後の防御層が欠けている。Next.js の `headers()` で Content-Security-Policy を設定すべき。
3. **SOAP 生成ルートのプロンプトインジェクション経路**: `sanitizeUserInput` がインポートされながら未使用。DB データを直接プロンプトに結合しており、攻撃者がアスリートプロファイルの `position` や `sport` フィールドにインジェクションペイロードを格納した場合の攻撃経路が存在する。

### 推奨優先度

| 優先度 | アクション | 工数見積 |
|--------|----------|---------|
| P1 (即座) | GA4 API Secret のサーバー側移行 | 1h |
| P1 (即座) | SOAP 生成ルートのサニタイズ適用 | 30min |
| P2 (今週中) | CSP ヘッダー設定 | 2h |
| P2 (今週中) | HSTS ヘッダー設定 | 15min |
| P2 (今週中) | UUID バリデーション統一 (10 ルート) | 2h |
| P3 (次スプリント) | 非null アサーションの Optional chaining 化 | 3h |
| P3 (次スプリント) | 未使用インポート・変数のクリーンアップ (81件) | 2h |
| P3 (次スプリント) | approval_audit_logs への DELETE/UPDATE トリガー追加 | 1h |
| P4 (バックログ) | エクスポート関数の戻り値型アノテーション | 2h |
| P4 (バックログ) | `as any` の型安全な代替への置換 | 1h |
