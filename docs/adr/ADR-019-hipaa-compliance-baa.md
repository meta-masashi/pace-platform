# ADR-019: HIPAA対応・BAA締結・データフロー監査設計

**ステータス:** 承認済み
**作成日:** 2026-03-24
**決定者:** @05-architect, @01-pm
**関連ADR:** ADR-001（システム全体アーキテクチャ）, ADR-007（S3ダイレクトアップロード）, ADR-008（動画保持ポリシー）, ADR-010（Stripe Webhook セキュリティ）

---

## コンテキスト

PACE Platform は医療・スポーツ医療分野において、アスリートの診断情報・生体データ・動画セッションを取り扱う。一部の顧客組織（特に米国市場向け、大学スポーツ医療部門）は HIPAA（Health Insurance Portability and Accountability Act）準拠を契約条件として要求する。

Phase 4 において Enterprise プランの展開に伴い、正式な HIPAA 対応および BAA（Business Associate Agreement: 事業提携契約）締結の設計を確立する必要がある。

主要な検討事項：
1. どのデータが PHI（Protected Health Information）に該当するか
2. PHIへのアクセスを監査ログにどう記録するか
3. どのサブプロセッサーとBAA締結が必要か
4. ADR-008の動画7日保持ポリシーとHIPAAの6年保持要件をどう整合させるか

---

## 決定事項

### 1. PHI（Protected Health Information）の定義

PACE Platform において以下のデータを PHI として扱う：

| テーブル / リソース | カラム / フィールド | PHI 該当理由 |
|-------------------|-------------------|-------------|
| `athletes` | `name`, `date_of_birth`, `contact_info` | 個人識別情報 |
| `soap_notes` | `subjective`, `objective`, `assessment`, `plan` | 診断・治療記録 |
| `assessments` | 全カラム | 医療評価データ |
| `daily_metrics` | `heart_rate`, `hrv`, `sleep_data`, `injury_flags` | 生体測定データ |
| S3 `cv_sessions/` | マスキング済み動画（.mp4） | 運動動作の医療的解析対象 |

**PHI 非該当（意図的に除外）:**

| リソース | 除外理由 |
|---------|--------|
| S3 `raw_videos/` | 顔マスキング前の動画は7日で削除（ADR-008）。PHI対象とすると6年保持義務が生じS3コスト過大 |
| `cv_sessions.inference_result` | マスキング済み動画の姿勢推定数値。氏名等と切り離せば匿名化可能 |
| `organizations`, `staff` | 医療情報を含まない組織・スタッフ管理データ |

### 2. audit_log テーブル設計

**PHIアクセスごとに audit_log テーブルへ自動記録する。**

```sql
CREATE TABLE audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,             -- auth.users.id
  org_id        UUID NOT NULL,             -- 操作した組織
  resource_type TEXT NOT NULL,             -- 'athlete', 'soap_note', 'assessment', 'daily_metric', 'cv_session'
  resource_id   UUID NOT NULL,             -- 対象レコードのID
  action        TEXT NOT NULL,             -- 'read', 'create', 'update', 'delete'
  ip_address    INET,                      -- クライアントIPアドレス
  user_agent    TEXT,                      -- ブラウザ / クライアント情報
  metadata      JSONB DEFAULT '{}',        -- 追加コンテキスト（検索クエリ等）
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 検索用インデックス
CREATE INDEX idx_audit_log_user    ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_org     ON audit_log(org_id, created_at DESC);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id, created_at DESC);

-- パーティショニング（年次）: 6年分のログを効率管理
-- PARTITION BY RANGE (created_at) は本番導入時に検討
```

### 3. audit_log のアクセス制御

**audit_log は RLS 対象外とし、Edge Function の `service_role` 経由のみ書き込み可能とする。**

```sql
-- RLS は無効（service_role のみ操作可能）
ALTER TABLE audit_log DISABLE ROW LEVEL SECURITY;

-- anon / authenticated ロールからの直接アクセスを禁止
REVOKE ALL ON audit_log FROM anon, authenticated;

-- service_role のみ全操作許可（デフォルト）
GRANT ALL ON audit_log TO service_role;
```

監査ログ参照は専用の Admin API エンドポイント（`/api/admin/audit-log`）経由のみとし、スタッフ自身が自分のアクセスログを改ざんできない設計とする。

### 4. 監査ログ記録の実装方法

**PostgreSQL Trigger による自動記録（reads を除く writes）+ Edge Function による reads 記録の2方式を採用。**

```sql
-- SOAP Note への書き込み操作を自動記録するトリガー
CREATE OR REPLACE FUNCTION log_phi_mutation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (user_id, org_id, resource_type, resource_id, action)
  VALUES (
    auth.uid(),
    COALESCE(NEW.org_id, OLD.org_id),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    LOWER(TG_OP)  -- 'insert' → 'create', 'update', 'delete'
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 各PHIテーブルにトリガーをアタッチ
CREATE TRIGGER audit_soap_notes
  AFTER INSERT OR UPDATE OR DELETE ON soap_notes
  FOR EACH ROW EXECUTE FUNCTION log_phi_mutation();

CREATE TRIGGER audit_assessments
  AFTER INSERT OR UPDATE OR DELETE ON assessments
  FOR EACH ROW EXECUTE FUNCTION log_phi_mutation();

CREATE TRIGGER audit_daily_metrics
  AFTER INSERT OR UPDATE OR DELETE ON daily_metrics
  FOR EACH ROW EXECUTE FUNCTION log_phi_mutation();
```

**Read アクセスの記録（Edge Function）:**

```typescript
// supabase/functions/_shared/audit.ts
export async function logPhiAccess(
  supabaseAdmin: SupabaseClient,
  params: {
    userId: string;
    orgId: string;
    resourceType: string;
    resourceId: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }
) {
  await supabaseAdmin.from('audit_log').insert({
    ...params,
    action: 'read',
  });
}
```

### 5. 暗号化設計

| レイヤー | 方式 | ステータス |
|---------|------|----------|
| Supabase（PostgreSQL）保存時 | AES-256 | Supabase がデフォルトで提供。充足 |
| Supabase ↔ クライアント転送 | TLS 1.3 | Supabase が強制。確認済み |
| S3 動画（cv_sessions/）保存時 | SSE-S3（AES-256） | 既存設定で充足。ADR-007 参照 |
| S3 ↔ ECS 転送 | TLS 1.3 | AWS デフォルト。確認済み |
| アプリ ↔ クライアント転送 | TLS 1.3（Vercel 強制） | 確認済み |

**フィールドレベル暗号化は現フェーズでは採用しない。** Supabase の透過的なAES-256とTLS 1.3の組み合わせが HIPAA の暗号化要件を充足するため。フィールドレベル暗号化は実装コストが高く、全文検索・インデックス等の機能制約も生じる。

### 6. BAA締結対象サブプロセッサー

PHIを保存・処理するサービスとのみBAA締結が必要：

| サブプロセッサー | PHI 保存 | BAA 必要 | 締結方法 |
|----------------|---------|---------|---------|
| **Supabase** | あり（DB全体） | 必要 | Supabase Enterprise プランで提供 |
| **AWS** | あり（S3動画） | 必要 | AWSコンソール → My Account → Agreements より無料締結 |
| **Vercel** | なし（転送のみ） | 必要 | Enterprise Agreement に含まれる |
| Stripe | なし（課金情報のみ） | 不要 | - |
| Google（Gemini API） | なし（プロンプトのみ）| 不要 | - |
| OpenAI | なし（プロンプトのみ） | 不要 | - |

**注:** GeminiおよびOpenAIへのLLMプロンプトに PHI（選手の氏名・診断詳細）を含めないことをシステム設計上保証する（ADR-009 のコンテキスト注入設計を参照）。

### 7. raw_videos と HIPAA 6年保持要件の整合

ADR-008 にて raw_videos（未マスキング動画）の7日保持・自動削除が決定されている。HIPAA の最低保持期間は6年であり、一見矛盾する。

**解決方針: raw_videos（未マスキング動画）を HIPAA 上で "Not PHI" 扱いとする。**

根拠：
1. raw_videos は S3 に一時的に保管され、顔マスキング処理後は cv_sessions にマスキング済み動画として保存される
2. マスキング処理後の動画はアスリートの顔が識別不可能であり、HIPAA の個人識別情報要件（18 identifiers）の「顔写真及び同等の画像」に該当しない
3. raw_videos の7日削除は「PHI ではないデータを不要になった時点で削除する」という HIPAA の "minimum necessary" 原則に合致する

**マスキング済み動画（cv_sessions/）はPHIとして6年保持。**

```
S3 バケット構成:
  pace-raw-videos/     → PHI非該当。7日でライフサイクルポリシーにより自動削除
  pace-cv-sessions/    → PHI該当。6年保持。SSE-S3暗号化。
```

### 8. 可用性・バックアップ（RTO/RPO）

| 指標 | 目標値 | 現状 |
|------|--------|------|
| RTO（Recovery Time Objective） | 4時間 | Supabase Managed DB の障害対応SLAで充足 |
| RPO（Recovery Point Objective） | 1時間 | Supabase Daily Backup（WAL連続バックアップ）で充足 |

現時点では Supabase の Daily Backup（Point-in-Time Recovery）が RPO 1時間を満たす。将来的に RPO 15分が必要となった場合は Supabase Enterprise の高頻度バックアップオプションを検討する。

---

## BAA締結手順

### Step 1: Supabase BAA

1. Supabase Enterprise プランへのアップグレード（現在 Pro → Enterprise）
2. [Supabase Enterprise お問い合わせ](https://supabase.com/contact/enterprise) からBAA要求
3. Supabase 法務チームとのBAA文書レビュー（通常2〜4週間）
4. 電子署名（DocuSign）で締結

**注意:** Supabase のBAAは Enterprise プランでのみ提供。Pro プランでは不可。

### Step 2: AWS BAA

1. AWS Management Console → My Account → Agreements
2. "Business Associate Addendum" を検索
3. 「Accept」をクリック（無料、即時有効）
4. 対象サービス: S3（pace-cv-sessions バケットが所属するリージョンのS3）

### Step 3: Vercel BAA

1. Vercel Enterprise Agreement の締結（既存の Enterprise プランに含まれる）
2. Vercel アカウントチームに HIPAA BAA の添付を依頼
3. Vercel の DPA（Data Processing Addendum）との併用で充足

---

## HIPAA 管理的保護措置

技術的な実装に加え、以下の管理的措置が必要：

- **アクセス管理ポリシー:** 最小権限の原則。スタッフへの PHI アクセス権限は業務上必要な範囲に限定
- **インシデント対応手順:** PHI漏洩疑い時の60日以内の HHS 報告義務（Breach Notification Rule）
- **従業員トレーニング:** PHI取り扱いに関する年次トレーニング記録の保持
- **リスク評価:** 年次 HIPAA リスクアセスメントの実施・記録

---

## 却下した選択肢

### A. raw_videos を全期間（6年）HIPAA対象として保持

**却下理由:**
- 未マスキング動画はPII（顔情報）を含み、むしろリスクが高い。長期保持はリスク増加
- S3 ストレージコスト: 1動画あたり平均200MB × 6年 × 想定セッション数での試算では月次コストが約15倍になる
- HIPAA の "minimum necessary" 原則は「必要最小限のデータのみ保持」を求めており、顔マスキング済み版のみ保持する方が原則に合致する

### B. 全PHIのフィールドレベル暗号化

**却下理由:**
- 実装コストが高く（pgcrypto または アプリ層での暗号化）、Phase 4 スコープ外
- 暗号化されたカラムへのインデックス作成が困難（全文検索・範囲検索が機能しなくなる）
- Supabase の透過的 AES-256 + TLS 1.3 で HIPAA 暗号化要件は充足しており、追加実装の費用対効果が低い

---

## 影響範囲

- `supabase/migrations/` への audit_log テーブル・トリガー追加
- `supabase/functions/_shared/audit.ts` の新規実装
- 各 PHI アクセス API エンドポイントへの監査ログ記録処理の追加
- S3 バケットのライフサイクルポリシー設定（cv_sessions: 6年保持ルール追加）
- Supabase Enterprise プランへのアップグレード手続き
- AWS BAA 締結作業（AWSコンソール操作）
- Vercel BAA 締結作業（アカウントチームへの連絡）
- インシデント対応手順書の作成（別途ドキュメント）

---

## 参照

- [ADR-007: S3ダイレクトアップロード](./ADR-007-s3-direct-upload.md)
- [ADR-008: 動画保持ポリシー](./ADR-008-video-retention-policy.md)
- [ADR-009: LLMコンテキスト注入設計](./ADR-009-llm-context-injection.md)
- [HIPAA Security Rule (45 CFR Part 164)](https://www.hhs.gov/hipaa/for-professionals/security/index.html)
- [HIPAA Breach Notification Rule](https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html)
- [AWS HIPAA Eligible Services](https://aws.amazon.com/compliance/hipaa-eligible-services-reference/)
- [Supabase HIPAA Compliance](https://supabase.com/docs/guides/platform/hipaa-compliance)
