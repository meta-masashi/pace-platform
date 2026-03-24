# HACHI プロジェクト セキュリティポリシー

最終更新: 2026-03-24
対象バージョン: hachi-wp-secure v2.0 / pace-platform v3.0

---

## 1. 脆弱性の報告

セキュリティ上の問題を発見した場合は、**公開の Issue は作成しないでください**。
以下の連絡先に直接ご報告ください。

- 報告先メール: security@hachi.co.jp
- 暗号化: PGP 公開鍵を上記メールアドレスで要求してください
- 初回返信目標: 72 時間以内
- 修正・公開目標: 重大度 Critical は 7 日以内、High は 30 日以内

報告内容には以下を含めてください:
1. 影響を受けるコンポーネントとバージョン
2. 脆弱性の種類（例: XSS、SQLi、プロンプトインジェクション）
3. 再現手順（PoC コードがあれば）
4. 想定される影響範囲

---

## 2. セキュリティアーキテクチャ概要（4大防壁）

### 防壁1 — アクセス制御（Authentication & Authorization）

**WordPress レイヤー:**
- Supabase Auth JWT による認証（全 Edge Function で `auth.getUser()` 必須）
- WordPress nonce 検証（有効期限 4 時間、デフォルトより短縮）
- ログイン試行回数制限（5回: 10分ロック / 10回: 1時間ロック / 20回: 24時間ロック）
- ブルートフォース対策のエラーメッセージ汎用化

**Supabase レイヤー:**
- 全テーブルに Row Level Security (RLS) を有効化
- org_id によるマルチテナント完全分離
- ヘルパー関数 `get_my_org_id()` / `is_master()` / `is_at_or_pt()` による一元的な権限チェック
- Service Role キーはサーバーサイドのみで使用（フロントエンドには絶対に公開しない）

**Stripe 決済レイヤー:**
- Webhook 署名検証（`stripe.webhooks.constructEvent()`）を最初に実行
- 冪等性保証（`stripe_events` テーブルによる重複処理防止）
- イベントタイプのホワイトリスト方式（switch 文で明示的に許可されたイベントのみ処理）

### 防壁2 — AI セキュリティ（Prompt Injection & Output Guardrails）

**入力防御:**
- `sanitizeUserInput()` によるプロンプトインジェクション対策（35+ パターン）
- HTML タグ除去、連続改行圧縮、ロールオーバーライド文字列の無効化
- 文字数ハードキャップ（8,000 文字）
- `detectInjectionAttempt()` による早期ブロック

**出力防御:**
- `detectHarmfulOutput()` による医療的危険主張の検出（28+ パターン）
- 診断断言・処方指示・外科的推奨の禁止（日本語・英語両対応）
- 全 AI 出力への医療免責事項付与（`MEDICAL_DISCLAIMER`）
- CDS システムプレフィックスによるガードレール強化

**PII 保護:**
- `maskPii()` によるログ・監査出力の PII マスキング
- 対象: メールアドレス / 電話番号 / クレジットカード番号 / マイナンバー / 日本語氏名
- Gemini API へのリクエストに PII を含めない（RAG コンテキストの匿名化）

### 防壁3 — コスト・レート保護（Rate Limiting & Cost Guards）

- ユーザー別・エンドポイント別レートリミット（20 req/分、環境変数で調整可）
- 月次コール上限チェック（デフォルト 10,000 コール）
- `gemini_token_log` によるトークン使用量追跡
- REST API へのレートリミット（`hachi_check_rate_limit()` — 30 req/分）
- reCAPTCHA v3 によるボット対策（スコア閾値 0.5）

### 防壁4 — 耐障害性（Resilience & Fail-Safe）

- Gemini API 最大 3 回リトライ（指数バックオフ: 0ms → 1000ms → 2000ms）
- ガードレール違反時は即座にエラー（リトライなし）
- Stripe Webhook エラー時の Slack 通知
- セキュリティログのファイルローテーション（10MB 上限）
- ログディレクトリへの直接 HTTP アクセスブロック（`.htaccess`）

---

## 3. HTTP セキュリティヘッダー

全レスポンスに以下のヘッダーを付与:

| ヘッダー | 設定値 |
|---------|--------|
| Content-Security-Policy | nonce ベース、unsafe-inline 禁止 |
| Strict-Transport-Security | max-age=31536000; includeSubDomains; preload |
| X-Frame-Options | SAMEORIGIN |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera, mic, geolocation 等を無効化 |

---

## 4. OWASP Top 10 対応状況（2026-03-24 時点）

| OWASP ID | リスク | 対応状況 |
|---------|--------|---------|
| A01 アクセス制御の不備 | High | 全テーブル RLS 有効 / nonce 検証実装済み |
| A02 暗号化の失敗 | Medium | HTTPS 強制 / HSTS / Secure Cookie 実装済み |
| A03 インジェクション | High | パラメーター化クエリ / サニタイズ実装済み |
| A04 安全でない設計 | Medium | CDS ガードレール / プラン分離設計 |
| A05 セキュリティ設定ミス | Medium | 情報漏洩防止 / XML-RPC 無効化 実装済み |
| A06 脆弱なコンポーネント | Low | 自動マイナーアップデート有効 |
| A07 認証の失敗 | High | ブルートフォース対策 / JWT 管理 実装済み |
| A08 整合性の失敗 | Medium | Stripe Webhook 署名検証 実装済み |
| A09 ログとモニタリングの不備 | Low | セキュリティログ / Slack 通知 実装済み |
| A10 SSRF | Low | 外部 URL は固定の許可リスト (Google reCAPTCHA / Slack のみ) |

---

## 5. 定期監査スケジュール

| 周期 | 実施内容 | 担当 |
|-----|---------|-----|
| 毎月 | セキュリティログレビュー（不審なイベント確認） | DevOps |
| 四半期 | OWASP Top 10 コードレビュー（本ドキュメント基準） | セキュリティエンジニア |
| 四半期 | 依存パッケージの脆弱性スキャン（`npm audit` / `composer audit`） | DevOps |
| 半年 | RLS ポリシー全件監査（`SELECT * FROM pg_policies`） | DB管理者 |
| 半年 | AI セキュリティ監査（プロンプトインジェクションパターン更新） | AIエンジニア |
| 年次 | 外部ペネトレーションテスト | 外部セキュリティ会社 |
| 年次 | セキュリティポリシー全体見直し | 責任者 |

---

## 6. インシデント対応手順

### 重大度レベル

| レベル | 定義 | 初動目標 |
|-------|-----|---------|
| Critical | データ漏洩・認証バイパス・決済不正 | 1 時間以内に対応開始 |
| High | 機能停止・部分的なアクセス制御バイパス | 4 時間以内 |
| Medium | セキュリティ設定不備・パフォーマンス問題 | 24 時間以内 |
| Low | 情報漏洩リスク軽微・改善推奨 | 次回スプリント内 |

### 対応フロー

1. **検知**: セキュリティログ / Slack アラート / 外部報告
2. **初期評価**: 重大度判定・影響範囲の特定（30分以内）
3. **封じ込め**: 該当エンドポイントのアクセス遮断 / アカウント停止
4. **根本原因分析**: ログ解析・コードレビュー
5. **修正**: パッチ適用・設定変更
6. **検証**: ステージング環境でのテスト
7. **本番デプロイ**: 変更管理プロセスに従う
8. **事後報告**: インシデントレポート作成（72時間以内）

### 緊急連絡先

- セキュリティ責任者: security@hachi.co.jp
- インフラ緊急対応: devops@hachi.co.jp
- Supabase サポート: https://supabase.com/support
- Stripe サポート: https://support.stripe.com

---

## 7. 本番環境チェックリスト（デプロイ前確認事項）

人間の責任者が以下を確認してからデプロイすること:

### WordPress
- [ ] `wp-config-security.php` の AUTH_KEY 等 8 つのセキュリティキーを `https://api.wordpress.org/secret-key/1.1/salt/` で生成した値に変更済み
- [ ] `HACHI_RECAPTCHA_SECRET_KEY` / `HACHI_RECAPTCHA_SITE_KEY` を本番値に設定済み
- [ ] `HACHI_SLACK_WEBHOOK_URL` を本番チャンネルの URL に設定済み
- [ ] `WP_DEBUG` が `false` であることを確認

### Supabase
- [ ] 全テーブルの RLS が有効化されていることを `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'` で確認
- [ ] `SUPABASE_SERVICE_ROLE_KEY` がフロントエンドの環境変数に含まれていないことを確認（`NEXT_PUBLIC_` プレフィックスは絶対禁止）
- [ ] `013_billing_tables.sql` のマイグレーションが本番 DB に適用済みであることを確認

### Stripe
- [ ] `STRIPE_SECRET_KEY` が本番用（`sk_live_`）キーであることを確認
- [ ] `STRIPE_WEBHOOK_SECRET` が本番 Webhook エンドポイントの署名シークレットであることを確認
- [ ] Webhook エンドポイント URL が本番 URL に設定済みであることを確認

### Gemini API
- [ ] `GEMINI_API_KEY` が本番用キーであることを確認
- [ ] `GEMINI_MONTHLY_CALL_LIMIT` が本番の使用量予測に基づいて設定済みであることを確認

---

## 8. 既知の制限事項（Medium/Low リスク — 修正推奨）

1. **[Medium] IP スプーフィングリスク（security.php L573）**
   `HTTP_CF_CONNECTING_IP` を無条件に信頼している。Cloudflare を経由しない環境では IP が偽装される可能性がある。
   推奨: Cloudflare の IP レンジ検証を追加するか、`REMOTE_ADDR` を優先する設定を検討すること。

2. **[Medium] `hachi_flush_news_rest_cache()` の生 SQL（rest-api.php L254）**
   `$wpdb->query()` で固定のプレフィックス文字列による生 SQL を使用している。
   ユーザー入力は含まれないため SQL インジェクションリスクは低いが、将来の改修時に動的値を混入しないよう注意すること。

3. **[Low] SVG アップロードのサニタイズ（security.php L292）**
   現在は危険パターンの検出のみで、SVG の構造的なサニタイズ（外部参照の除去等）は行っていない。
   推奨: `svg-sanitizer` ライブラリの導入を検討すること。

4. **[Low] reCAPTCHA API エラー時のフォールバック（contact-handler.php L117）**
   Google reCAPTCHA API が応答しない場合、スコア 0.5 でフォールバック通過させている。
   推奨: 本番環境では API エラー時にフォームを拒否する（Fail-Closed）設定に変更することを検討すること。

5. **[Low] Gemini レートリミットのフェイルオープン（client.ts L82）**
   Supabase への接続不可時はレートリミットをスキップする設計になっている（Fail-Open）。
   推奨: キャッシュ層（Redis 等）を追加してオフラインでもレートリミットを維持することを検討すること。
