# ADR-018: Enterpriseプラン設計・多チーム組織構造

**ステータス:** 承認済み
**作成日:** 2026-03-24
**決定者:** @05-architect, @01-pm
**関連ADR:** ADR-001（システム全体アーキテクチャ）, ADR-002（APIレイヤー分離）, ADR-017（CV解析アドオンプラン料金設計）

---

## コンテキスト

大学スポーツ部門・プロスポーツクラブのアカデミー組織など、複数チームを傘下に持つ組織体からの導入問い合わせが増加している。現行の PACE Platform は1組織=1チームを前提とした設計であり、以下の課題がある：

- スポーツ局（親組織）が傘下の各競技チームのデータを横断的に参照できない
- チームごとに個別のProプラン契約が必要で、請求管理が煩雑
- 各チームのスタッフアカウント管理を親組織が行えない

「企業グループ」「大学体育会」「クラブアカデミー」などのユースケースに対応するため、Enterpriseプランの多チーム組織構造を設計する。

---

## 決定事項

### 1. organizations テーブルの自己参照カラム追加

**`organizations` テーブルに `parent_organization_id UUID NULL` 自己参照カラムを追加する。**

```sql
ALTER TABLE organizations
  ADD COLUMN parent_organization_id UUID NULL
    REFERENCES organizations(id) ON DELETE SET NULL;

-- plan_type ENUM に 'enterprise' を追加
ALTER TYPE plan_type ADD VALUE 'enterprise';

-- インデックス（子組織一覧取得の高速化）
CREATE INDEX idx_organizations_parent ON organizations(parent_organization_id)
  WHERE parent_organization_id IS NOT NULL;
```

この設計により：
- 親組織: `parent_organization_id IS NULL` かつ `plan_type = 'enterprise'`
- 子組織: `parent_organization_id = <親組織のid>`
- 既存のProプラン組織: `parent_organization_id IS NULL` かつ `plan_type = 'pro'`

階層は2段階まで（親→子）に限定する。孫組織は現時点では不要であり、再帰クエリの複雑化を避ける。

### 2. plan_type ENUM 拡張

```sql
-- 現在の plan_type: 'standard', 'pro'
-- 追加
ALTER TYPE plan_type ADD VALUE 'enterprise';
```

### 3. Enterprise管理者ロール設計

**`enterprise_admin` 専用ロールは追加せず、既存の `master` ロールを拡張する。**

```sql
-- staff テーブルに is_enterprise_admin カラムを追加
ALTER TABLE staff
  ADD COLUMN is_enterprise_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- CHECK 制約: enterprise_admin フラグは master ロールのみ設定可
ALTER TABLE staff
  ADD CONSTRAINT chk_enterprise_admin_requires_master
    CHECK (
      is_enterprise_admin = FALSE OR role = 'master'
    );
```

`is_enterprise_admin = TRUE` のスタッフは、自組織（親組織）および傘下の全子組織データを参照できる。

### 4. Enterpriseプラン料金

| 項目 | 内容 |
|------|------|
| 月額 | 60万円/月 |
| 内容 | Pro機能 + CV Addon（複数チーム分） + 傘下チーム横断ダッシュボード |
| CV解析上限 | 傘下チーム合計200本/月（デフォルト）、契約時カスタマイズ可 |
| チーム数上限 | デフォルト10チーム（超過は個別見積） |

---

## RLS 設計

### 基本方針

- チーム間の選手・セッションデータは依然として RLS で分離する
- Enterprise管理者（`is_enterprise_admin = TRUE`）は傘下全チームを「参照のみ」可能
- データの書き込み（作成・更新・削除）は各チームのスタッフのみが実行可能

### athletes テーブル

```sql
-- Enterprise 管理者は傘下組織データも参照可
CREATE POLICY enterprise_admin_read ON athletes
  FOR SELECT
  USING (
    org_id IN (
      SELECT id FROM organizations
      WHERE id = current_org_id()
         OR parent_organization_id = current_org_id()
    )
    AND (
      -- 通常スタッフ: 自組織のみ
      current_org_id() = org_id
      OR
      -- Enterprise管理者: 傘下組織も可
      EXISTS (
        SELECT 1 FROM staff
        WHERE user_id = auth.uid()
          AND is_enterprise_admin = TRUE
      )
    )
  );
```

### cv_sessions テーブル

```sql
CREATE POLICY enterprise_admin_read ON cv_sessions
  FOR SELECT
  USING (
    org_id IN (
      SELECT id FROM organizations
      WHERE id = current_org_id()
         OR parent_organization_id = current_org_id()
    )
    AND EXISTS (
      SELECT 1 FROM staff
      WHERE user_id = auth.uid()
        AND (org_id = current_org_id() OR is_enterprise_admin = TRUE)
    )
  );
```

### organizations テーブル自体のポリシー

```sql
-- 親組織は自分と傘下組織の情報を参照可
CREATE POLICY org_hierarchy_read ON organizations
  FOR SELECT
  USING (
    id = current_org_id()
    OR parent_organization_id = current_org_id()
  );
```

---

## 技術実装

### ヘルパー関数

```sql
-- 現在のユーザーの組織IDを返す（既存関数）
CREATE OR REPLACE FUNCTION current_org_id() RETURNS UUID AS $$
  SELECT (auth.jwt() ->> 'org_id')::UUID;
$$ LANGUAGE SQL STABLE;

-- Enterprise管理者かどうかを判定
CREATE OR REPLACE FUNCTION is_enterprise_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff
    WHERE user_id = auth.uid()
      AND is_enterprise_admin = TRUE
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- 傘下組織IDの一覧を返す（親組織のIDを渡す）
CREATE OR REPLACE FUNCTION child_org_ids(parent_id UUID)
RETURNS SETOF UUID AS $$
  SELECT id FROM organizations
  WHERE parent_organization_id = parent_id;
$$ LANGUAGE SQL STABLE;
```

### Enterprise ダッシュボード API

```typescript
// apps/web/src/app/api/enterprise/overview/route.ts
export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();

  // Enterprise管理者チェック
  const { data: staffData } = await supabase
    .from('staff')
    .select('is_enterprise_admin, org_id')
    .eq('user_id', user.id)
    .single();

  if (!staffData?.is_enterprise_admin) {
    return NextResponse.json({ error: 'Enterprise admin required' }, { status: 403 });
  }

  // 傘下チーム一覧と各チームのサマリーを取得
  const { data: childOrgs } = await supabase
    .from('organizations')
    .select(`
      id,
      name,
      athletes(count),
      cv_analysis_usage(usage_count)
    `)
    .eq('parent_organization_id', staffData.org_id);

  return NextResponse.json({ organizations: childOrgs });
}
```

### マイグレーション順序

```
supabase/migrations/
  20260324_001_add_parent_organization.sql     # organizations 自己参照カラム
  20260324_002_add_enterprise_plan_type.sql    # plan_type ENUM 拡張
  20260324_003_add_is_enterprise_admin.sql     # staff テーブル拡張
  20260324_004_enterprise_rls_policies.sql     # RLS ポリシー追加
```

### Stripe Webhook 拡張

ADR-010 のウェブフックハンドラに以下のロジックを追加する：

- Enterprise プラン契約時: 親組織の `plan_type` を `enterprise` に更新
- Enterprise プラン解約時: 親組織を `pro` にダウングレード、子組織の `parent_organization_id` を NULL に設定（孤立防止）

---

## 却下した選択肢

### A. enterprise_accounts テーブルを別途作成

```sql
-- 却下案
CREATE TABLE enterprise_accounts (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  -- ...
);
ALTER TABLE organizations ADD COLUMN enterprise_account_id UUID REFERENCES enterprise_accounts(id);
```

**却下理由:**
- テーブル数が増加し、既存の RLS ポリシーとの整合性確保が困難
- `organizations` との JOIN が必要になり、クエリが複雑化
- 既存のマルチテナント設計（`org_id` ベース）との乖離が生じる
- 2段階の階層で十分なため、過剰設計

### B. enterprise_admin ロールを roles ENUM に新設

```sql
-- 却下案
ALTER TYPE staff_role ADD VALUE 'enterprise_admin';
```

**却下理由:**
- `auth.users` のロール管理が複雑化し、既存の認可ロジックへの影響範囲が大きい
- `master` ロールのフラグ拡張であれば既存の権限チェックロジックを再利用可能
- ロールが増えると将来の RBAC 拡張時の組み合わせ爆発リスクがある

---

## 影響範囲

- `supabase/migrations/` への新規マイグレーション4件
- `apps/web/src/app/api/enterprise/` の新規APIルート
- `apps/web/src/components/enterprise/` の新規ダッシュボードコンポーネント
- 既存 RLS ポリシーの見直し（athletes, cv_sessions, soap_notes）
- Stripe Webhook ハンドラの拡張
- 招待メールフローの拡張（親組織からの子組織スタッフ招待）

---

## 参照

- [ADR-001: システム全体アーキテクチャ](./ADR-001-system-architecture.md)
- [ADR-017: CV解析アドオンプラン料金設計](./ADR-017-cv-addon-plan-pricing.md)
- [Supabase RLS ドキュメント](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL 自己参照外部キー](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK)
