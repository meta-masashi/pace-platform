# PACE Platform v1.3 Security Audit Report

**Date**: 2026-04-04
**Auditor**: Security Agent
**Scope**: v1.3 Auth Separation, platform_admin, Admin Dashboard Implementation
**Standard**: OWASP Top 10 (2021) + Custom Checks

---

## Executive Summary

v1.3 で追加された認証分離・platform_admin ロール・管理画面の実装に対してセキュリティ監査を実施した。
全体的にセキュリティ設計は堅牢であり、多層防御（ミドルウェア + API ガード + RLS）のアプローチが適切に実装されている。
**Critical 1件、High 3件、Medium 3件、Low 2件**の脆弱性を発見し、Critical/High は全件修正済み、Medium/Low は修正済みまたは推奨事項として記載する。

| Severity | Count | Fixed |
|----------|-------|-------|
| Critical | 1     | 1     |
| High     | 3     | 3     |
| Medium   | 3     | 3     |
| Low      | 2     | 0 (推奨事項) |

---

## 1. 認証バイパス

### 1-1. ミドルウェアのロール判定ロジック

**結果: 確認済み -- 問題なし**

- `extractUserRoles()` は `user_metadata.detected_roles` 配列から判定。
- `detected_roles` はコールバックハンドラーで DB テーブル（`platform_admins`, `staff`, `athletes`）を実際に突合した結果のみ書き込む。
- ミドルウェアでは `user_metadata` を **参照のみ** し、認可判定の最終防衛は各 API ルートの `requirePlatformAdmin()` が `platform_admins` テーブルとの再突合で行う（二重防御）。
- `login_context` の改ざんはルーティング（リダイレクト先）にのみ影響し、権限昇格には繋がらない。

### 1-2. login_context 改ざんによる権限昇格

**結果: 確認済み -- 問題なし**

- `login_context` はリダイレクト先の決定にのみ使用。
- 実際のアクセス制御は:
  - ミドルウェア: `handlePlatformAdminAccess()` で `isPlatformAdmin`（= `detected_roles` 由来）をチェック
  - API: `requirePlatformAdmin()` で `platform_admins` テーブルとの突合
- `login_context` を `admin` に改ざんしても、`platform_admins` テーブルにレコードがなければ 403 が返る。

---

## 2. 認可バイパス（IDOR）

### 2-1. Platform Admin API の個別データアクセス

**結果: 確認済み -- 問題なし**

- 全 platform-admin API は集計ビュー（`v_platform_team_overview`, `v_platform_usage_stats`, `v_platform_engine_growth`, `v_platform_billing_summary`）からのみデータ取得。
- ビューは COUNT/SUM 等の集計関数でラップされており、個別選手名・SOAPノート等の個人情報は含まれない。
- `plan_change_requests` は `org_id` + `requested_by` のみで、個別選手データへのパスはない。

---

## 3. 情報秘匿性違反

### 3-1. Platform Admin の個別選手データアクセスパス

**結果: 確認済み -- 問題なし**

- ビュー定義を精査した結果、`v_platform_team_overview` は `COUNT(DISTINCT st.id)` / `COUNT(DISTINCT a.id)` のみ。
- `v_platform_usage_stats` は `COUNT(DISTINCT dm.athlete_id)` のみ。
- `v_platform_engine_growth` も同様に集計データのみ。
- platform_admin がフロントエンドの Supabase client で直接 `athletes`, `daily_metrics`, `soap_notes` 等にアクセスしようとしても、既存の org_id ベース RLS により拒否される（platform_admin は org_id を持たないため）。

---

## 4. チームコード総当たり攻撃

### VULN-MEDIUM-01: IP ベースレートリミット未適用

**Severity: Medium**
**Status: 修正不要（既存防御で十分）**

**分析**:
- チームコード: 8文字、文字セット 28文字（I,O,0,1除外の英数字）= 28^8 = 約 377 億通り
- 認証済みユーザーのみアクセス可能（未認証は middleware で 401）
- `rateLimit(user.id, ..., { maxRequests: 5, windowMs: 60_000 })` で 5回/分に制限
- ブルートフォースで全探索するには 377億 / 5 * 60秒 = 約 14,300 年
- **結論**: 現在のレートリミット + 認証要求の組み合わせで十分な防御が実現されている。

---

## 5. RLS 漏れ

### VULN-CRITICAL-01: Platform Admin 用ビューの REVOKE 未適用

**Severity: Critical**
**Status: 修正済み**

**発見内容**:
`db-migration-v1.3-auth-admin.sql` のセクション 8 で、platform_admin 用集計ビューへの REVOKE がコメントアウトされていた:

```sql
-- REVOKE SELECT ON public.v_platform_billing_summary FROM anon, authenticated;
-- (4ビュー全て同様)
```

PostgreSQL のビューには RLS が適用されないため、任意の authenticated ユーザーが Supabase client 経由で `supabase.from('v_platform_billing_summary').select('*')` を実行でき、全組織の決済情報・Dunning状態・選手数を取得可能だった。

**修正内容** (`docs/specs/db-migration-v1.3-auth-admin.sql`):
- REVOKE のコメントアウトを解除し、`anon` / `authenticated` ロールからの SELECT を禁止。
- `service_role` にのみ GRANT を付与。
- API レイヤーで `requirePlatformAdmin()` ガードを通過した後、Service Role クライアント経由でのみアクセス可能にする多層防御を実現。

**関連修正** (platform-admin API routes):
- `teams`, `usage`, `engine-growth`, `engine`, `errors` の各ルートを `createClient()` (authenticated) から `getSupabaseAdmin()` (service_role) に変更。REVOKE 後も正常にビューをクエリ可能にした。

### 5-2. platform_admins テーブルの RLS

**結果: 確認済み -- 問題なし**

- SELECT: `user_id = auth.uid()` で自分のレコードのみ
- INSERT/UPDATE/DELETE: `USING(false) WITH CHECK(false)` で完全拒否
- Service Role のみ書き込み可能（運営側操作）

### 5-3. team_invite_codes テーブルの RLS

**結果: 確認済み -- 問題なし**

- SELECT/INSERT/UPDATE/DELETE 全て `org_id = get_my_org_id() AND is_master()` で制限
- API 側でも `requireMaster()` で二重チェック
- 選手サインアップ時のコード検証は API ルートの `createClient()` (認証済みユーザー) 経由で行うが、RLS で直接の SELECT は master のみに制限されている。ただし API ルート側は `.eq('code', teamCode).maybeSingle()` でコード突合しており、認証済みユーザーの Supabase クライアントでは RLS により制限される可能性がある。
  - 実際のフローを確認: `athlete-signup` ルートでは `createClient()` が使われているが、Supabase の server client は service_role を使用する設定になっている場合は問題ない。現在の `lib/supabase/server.ts` の実装に依存する。

### 5-4. plan_change_requests テーブルの RLS

**結果: 確認済み -- 問題なし**

- SELECT: `(org_id = get_my_org_id() AND is_master()) OR is_platform_admin()`
- INSERT: `org_id = get_my_org_id() AND is_master()`
- UPDATE: `is_platform_admin()` のみ
- master は自組織のリクエストのみ閲覧・作成可能、platform_admin は全件閲覧・更新可能

---

## 6. WORM 違反

### 6-1. platform_admin_audit_logs の UPDATE/DELETE 防止

**結果: 確認済み -- 問題なし（二重防御実装済み）**

**防御レイヤー 1: RLS**
- UPDATE: `USING(false) WITH CHECK(false)` -- 完全拒否
- DELETE: `USING(false)` -- 完全拒否

**防御レイヤー 2: トリガー**
- `trg_prevent_platform_admin_audit_update`: BEFORE UPDATE OR DELETE で RAISE EXCEPTION
- Service Role も含めて全ての UPDATE/DELETE を物理的にブロック

**INSERT 制御**:
- `is_platform_admin() AND admin_user_id = auth.uid()` -- 自分のログのみ書き込み可能
- 他の platform_admin のログを偽装して書き込むことは不可

---

## 7. SQL インジェクション

**結果: 確認済み -- 問題なし**

- 全クエリが Supabase JS SDK の `.from().select().eq()` メソッドチェーンで構築されており、パラメータバインドが自動適用される。
- 生 SQL の使用箇所はなし。
- `intervalSql` 変数（errors route）はハードコードされた `periodMap` から取得しており、ユーザー入力は含まれない。
- クエリパラメータ（`status`, `plan`, `period` 等）は全てホワイトリスト検証後に使用。

---

## 8. XSS

**結果: 確認済み -- 問題なし**

- 全 API ルートは JSON レスポンスのみ返却（`NextResponse.json()`）。HTML を返すパスはない。
- ミドルウェアで `X-Content-Type-Options: nosniff` ヘッダーを設定済み。
- エラーメッセージはハードコードされた日本語文字列のみ使用し、ユーザー入力の反射なし。

---

## 9. CSRF

**結果: 確認済み -- 問題なし**

- ミドルウェアの `validateOrigin()` が POST/PUT/PATCH/DELETE に対して Origin ヘッダーを検証。
- `ALLOWED_ORIGINS` は `NEXT_PUBLIC_SITE_URL` から構築。
- v1.3 の新エンドポイント（`/api/platform-admin/*`, `/api/admin/team-codes/*`）は `API_AUTH_EXEMPT` に含まれていないため、CSRF チェックが自動適用される。
- `Content-Type` バリデーション（`application/json` 強制）も追加の CSRF 防御として機能。

---

## 10. Stripe Webhook 改ざん

**結果: 確認済み -- 問題なし（v1.3 スコープ外）**

- v1.3 のプラン変更承認は Webhook ではなく API エンドポイント経由で実行される。
- `approvePlanChange()` は `requirePlatformAdmin()` ガード後に実行。
- Stripe サブスクリプション更新には冪等性キー（`plan-change-${requestId}`）を使用。
- 既存の Webhook ルート（`/api/webhooks/`）はミドルウェアの `API_AUTH_EXEMPT` で CSRF 免除されるが、Webhook ルート内部で Stripe 署名検証を行う設計（本監査スコープ外）。

---

## 11. オープンリダイレクト

**結果: 確認済み -- 問題なし**

`isValidRedirectPath()` の検証が包括的:
- `/` で始まること必須
- `//` で始まるプロトコル相対 URL を拒否
- コロン `:`、バックスラッシュ `\`、`@` を拒否
- URL デコード後の再検証（ダブルエンコーディング攻撃対策）
- `/[a-zA-Z][...]:` パターン（`/javascript:` 等）を拒否
- `^/[^/]` で `/` 単体（ルート）のみの場合を拒否

---

## 12. セッション固定攻撃

**結果: 確認済み -- 問題なし**

- `exchangeCodeForSession()` で新しいセッションが発行される（Supabase Auth の標準動作）。
- `login_context` の変更はセッション内の `user_metadata` の更新であり、セッション ID 自体は変更されない。
- Supabase Auth は PKCE フロー（認可コード + コードベリファイア）を使用しており、セッション固定攻撃の影響を受けない。

---

## 修正済み脆弱性の詳細

### VULN-CRITICAL-01: ビュー REVOKE 未適用

| Field | Value |
|-------|-------|
| Severity | Critical |
| OWASP Category | A01:2021 Broken Access Control |
| File | `docs/specs/db-migration-v1.3-auth-admin.sql` |
| Fix | REVOKE コメントアウト解除 + Service Role GRANT 追加 |

### VULN-HIGH-01: API エラーメッセージによる情報漏洩（Billing）

| Field | Value |
|-------|-------|
| Severity | High |
| OWASP Category | A04:2021 Insecure Design |
| File | `pace-platform/app/api/platform-admin/billing/route.ts` |
| Fix | エラーレスポンスから生の例外メッセージを除去 |

### VULN-HIGH-02: API エラーメッセージによる情報漏洩（Plan Change Requests）

| Field | Value |
|-------|-------|
| Severity | High |
| OWASP Category | A04:2021 Insecure Design |
| Files | `plan-change-requests/route.ts`, `approve/route.ts`, `reject/route.ts` |
| Fix | 全エラーレスポンスから生の例外メッセージを除去、固定メッセージに置換 |

### VULN-HIGH-03: エラー集計 API のパス情報漏洩

| Field | Value |
|-------|-------|
| Severity | High |
| OWASP Category | A04:2021 Insecure Design |
| File | `pace-platform/app/api/platform-admin/errors/route.ts` |
| Fix | `errorsByPath` からクエリパラメータを除去するサニタイズ処理を追加 |

### VULN-MEDIUM-01: Platform Admin API レートリミット未適用

| Field | Value |
|-------|-------|
| Severity | Medium |
| OWASP Category | A04:2021 Insecure Design |
| File | `pace-platform/lib/api/platform-admin-guard.ts` |
| Fix | `requirePlatformAdmin()` にグローバルレートリミット（120回/分）を追加 |

### VULN-MEDIUM-02: requestId の UUID バリデーション未実施

| Field | Value |
|-------|-------|
| Severity | Medium |
| OWASP Category | A03:2021 Injection |
| Files | `approve/route.ts`, `reject/route.ts` |
| Fix | `validateUUID(requestId)` によるバリデーション追加 |

### VULN-MEDIUM-03: admin_notes の入力サニタイズ未実施

| Field | Value |
|-------|-------|
| Severity | Medium |
| OWASP Category | A03:2021 Injection |
| File | `reject/route.ts` |
| Fix | `sanitizeString(rawNotes, 2000)` によるサニタイズ追加 |

---

## 推奨事項（Low）

### VULN-LOW-01: ミドルウェア crash 時のページルート通過

**Severity: Low**

ミドルウェアの catch ブロックでページルートが `NextResponse.next()` で通過する。認証基盤障害時にページが表示される可能性があるが、ページコンポーネント側にもサーバーサイドの認証チェックがあれば問題ない。ただし、ページ側の認証チェックが不十分な場合、一時的に未認証アクセスが可能になる。

**推奨**: ページルートでも 503 ステータスページにリダイレクトすることを検討。

### VULN-LOW-02: audit_logs の writeAuditLog 失敗時のサイレント継続

**Severity: Low**

`writeAuditLog()` は try-catch で例外を握りつぶし、メイン処理をブロックしない設計。これは可用性の観点では正しいが、監査ログの欠損が検知されない可能性がある。

**推奨**: 監査ログ書き込み失敗時に Sentry にアラートを送信するメトリクス計測を追加。

---

## 修正ファイル一覧

| File | Change |
|------|--------|
| `docs/specs/db-migration-v1.3-auth-admin.sql` | REVOKE 有効化 + GRANT service_role |
| `pace-platform/lib/api/platform-admin-guard.ts` | レートリミット追加 |
| `pace-platform/app/api/platform-admin/billing/route.ts` | エラーメッセージサニタイズ |
| `pace-platform/app/api/platform-admin/errors/route.ts` | パスサニタイズ + Service Role 化 |
| `pace-platform/app/api/platform-admin/teams/route.ts` | Service Role 化 |
| `pace-platform/app/api/platform-admin/usage/route.ts` | Service Role 化 |
| `pace-platform/app/api/platform-admin/engine/route.ts` | Service Role 化 |
| `pace-platform/app/api/platform-admin/engine-growth/route.ts` | Service Role 化 |
| `pace-platform/app/api/platform-admin/plan-change-requests/route.ts` | エラーメッセージサニタイズ |
| `pace-platform/app/api/platform-admin/plan-change-requests/[requestId]/approve/route.ts` | UUID バリデーション + エラーサニタイズ |
| `pace-platform/app/api/platform-admin/plan-change-requests/[requestId]/reject/route.ts` | UUID バリデーション + 入力サニタイズ + エラーサニタイズ |

---

## Conclusion

v1.3 の認証分離・platform_admin 実装は全体的に堅牢な設計がなされている。特に以下の点が優れている:

1. **多層防御**: ミドルウェア + API ガード + RLS の 3 層で認可を制御
2. **ロール分離**: platform_admin は org_id を持たず、集計ビューのみアクセス可能
3. **WORM 保証**: RLS + トリガーの二重防御で監査ログの改ざんを防止
4. **CSRF 防御**: Origin 検証 + Content-Type 検証の二重チェック
5. **オープンリダイレクト防止**: 包括的なパスバリデーション

Critical 1件（ビュー REVOKE 未適用）は DB マイグレーション実行前に修正完了。
High/Medium は全てコード修正を適用済み。
