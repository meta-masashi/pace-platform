# ADR-017: CV解析アドオンプラン料金設計

**ステータス:** 承認済み
**作成日:** 2026-03-24
**決定者:** @05-architect, @01-pm
**関連ADR:** ADR-001（システム全体アーキテクチャ）, ADR-010（Stripe Webhook セキュリティ）, ADR-013（CV マイクロサービスアーキテクチャ）

---

## コンテキスト

PACE Platform の収益化戦略において、CV（コンピュータビジョン）解析機能は ECS GPU インスタンスのランニングコストが高く、Proプランへのバンドルは「CV解析を使わない組織」にもコストを転嫁することになる。

2026年Q1の顧客インタビュー（n=12チーム）により、以下の事実が判明した：

- CV解析を「毎月積極的に利用している」チーム: 42%（5/12）
- CV解析を「試験的に使ったが現在は不使用」チーム: 33%（4/12）
- CV解析を「使ったことがない」チーム: 25%（3/12）

Proプラン（30万円/月）にCV解析をバンドルし続けた場合、CV不使用組織のコスト感が「高い」となりチャーンリスクが顕在化する。一方で、CV解析を頻用するチームはGPUコスト相当のアドオン課金を受け入れる意思があることがインタビューで確認された。

Phase 4 Sprint 1 として、CV解析機能を独立したアドオンプランに分離し、料金体系を再設計する。

---

## 決定事項

### 1. プラン構造

**CV解析はProプランとは別のアドオンプランとして分離する。**

| プラン | 月額 | 内容 |
|--------|------|------|
| Standard | 10万円/月 | 選手管理・SOAP・基本分析 |
| Pro | 30万円/月 | Standard + LLM分析・高度ダッシュボード（CV解析なし） |
| Pro + CV Addon | 50万円/月 | Pro + CV解析API（50本/月上限） |
| Enterprise | 60万円/月 | Pro + CV Addon（複数チーム管理含む、上限カスタム） |

Proプランのみ契約の場合、`/api/cv/*` エンドポイントへのアクセスはすべて `403 Forbidden` を返す。

### 2. CV Addon プラン仕様

- **月次上限:** 50本/月（カレンダー月でリセット）
- **超過時の挙動:** 解析リクエストをブロックし、HTTP 429 を返す。レスポンスボディに追加購入フローのURLを含める
- **超過時の誘導:** アプリ内通知 + メール通知（上限80%到達時にアーリーウォーニング）
- **未使用枠の繰り越し:** なし（月末リセット）

### 3. 価格根拠

**CV Addon: 20万円/月**

| 項目 | 月次コスト試算 |
|------|-------------|
| ECS GPU（g4dn.xlarge × 2）| 約8万円 |
| S3 ストレージ・転送 | 約1万円 |
| SQS・ECR・CloudWatch | 約0.5万円 |
| インフラ合計 | 約9.5万円 |
| マージン（約2倍）| 約10.5万円 |
| **合計** | **約20万円** |

**Proプラン: 30万円/月（変更なし）**

CV解析不要の組織が「CV解析のために余分に払わされている」と感じてチャーンすることを防ぐため、Proプラン価格は据え置く。

### 4. Enterpriseプランの扱い

ADR-018 で定義する Enterprise プランは CV Addon を含む（追加費用なし）。Enterprise プランにおける月次CV解析上限は契約時に個別設定とし、`organizations.cv_addon_monthly_limit` カラムで管理する。

### 5. 既存Proプラン顧客への移行対応

- **移行通知タイミング:** 本番リリース60日前（Stripe 利用規約の変更通知要件に準拠）
- **移行期間:** 通知後60日間は、既存Proプラン顧客はCV解析を従来通り利用可能
- **移行完了後:** 自動的に CV Addon なしの新Proプランに移行。CV解析を継続利用する場合は明示的にアドオン契約が必要

---

## 技術実装

### Stripe 設定

```
環境変数:
  STRIPE_PRO_PRICE_ID=price_xxxxxxxx          # Pro プラン（30万円/月）
  STRIPE_CV_ADDON_PRICE_ID=price_yyyyyyyy     # CV Addon（20万円/月）
  STRIPE_ENTERPRISE_PRICE_ID=price_zzzzzzzz  # Enterprise（60万円/月）
```

Stripe の Subscription に複数 Price を attach する形式で実装する（Pro + CV Addon の同時契約）。

### データベーススキーマ変更

```sql
-- organizations テーブルへのカラム追加
ALTER TABLE organizations
  ADD COLUMN cv_addon_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN cv_addon_monthly_limit INTEGER NOT NULL DEFAULT 50;

-- CV解析使用量トラッキングテーブル
CREATE TABLE cv_analysis_usage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year_month  CHAR(7) NOT NULL,  -- 例: '2026-03'
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, year_month)
);

-- RLS: 組織自身のみ参照可
ALTER TABLE cv_analysis_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY cv_usage_org_isolation ON cv_analysis_usage
  FOR ALL USING (org_id = current_org_id());

-- 使用量更新用インデックス
CREATE INDEX idx_cv_usage_org_month ON cv_analysis_usage(org_id, year_month);
```

### Next.js Middleware

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';

export async function middleware(req: NextRequest) {
  // CV API パスへのアクセスチェック
  if (req.nextUrl.pathname.startsWith('/api/cv/')) {
    const supabase = createMiddlewareClient({ req, res: NextResponse.next() });
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 組織の cv_addon_enabled チェック
    const { data: org } = await supabase
      .from('organizations')
      .select('cv_addon_enabled, cv_addon_monthly_limit')
      .eq('id', session.user.user_metadata.org_id)
      .single();

    if (!org?.cv_addon_enabled) {
      return NextResponse.json(
        {
          error: 'CV Addon plan required',
          upgrade_url: '/settings/billing/cv-addon'
        },
        { status: 403 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/cv/:path*'],
};
```

### 月次使用量チェック（Edge Function）

```typescript
// supabase/functions/cv-analysis-gate/index.ts
// CV解析リクエスト前に使用量を確認し、上限超過時は 429 を返す
export async function checkAndIncrementCvUsage(orgId: string): Promise<boolean> {
  const yearMonth = new Date().toISOString().slice(0, 7);

  const { data, error } = await supabase.rpc('increment_cv_usage', {
    p_org_id: orgId,
    p_year_month: yearMonth,
  });

  // increment_cv_usage は上限超過時に false を返す
  return data === true;
}
```

### Stripe Webhook ハンドリング

ADR-010 のセキュリティ設計に従い、以下のイベントをハンドルする：

- `customer.subscription.created` → cv_addon_enabled を TRUE に更新
- `customer.subscription.deleted` → cv_addon_enabled を FALSE に更新
- `invoice.payment_failed` → cv_addon_enabled を FALSE に更新（猶予期間あり）

---

## 却下した選択肢

### A. Proプランにバンドル継続

**却下理由:** CV解析を利用しない組織（全体の58%）がCV解析コストを負担し続けることになる。顧客インタビューで「使わない機能のコストを払いたくない」という意見が複数あり、チャーンリスクが高い。ECS GPUコストが価格構造に不透明に内包されることでプライシングの説明責任も低下する。

### B. 従量課金（解析1本ごと）

**却下理由:** Stripe Metered Billing の実装複雑度が高く、Phase 4 のスプリントスコープに収まらない。また、チームが月末に「予算超過」を恐れてCV解析を控える「チリング効果」が生じる可能性がある。月次定額の方がチームの利用計画が立てやすい。

### C. 使用量ベース段階課金（10本/5万, 30本/12万, 50本/20万）

**却下理由:** Stripe の設定が複雑になり、請求書の可読性が低下する。シンプルな「50本/月固定」の方が顧客の理解・運用コストが低い。

---

## 影響範囲

- `apps/web/src/middleware.ts` の修正
- `supabase/migrations/` への新規マイグレーション追加
- `apps/web/src/app/settings/billing/` のUI更新（CV Addon 購入フロー）
- Stripe Dashboard でのプロダクト・価格設定
- 既存Proプラン顧客向けのメール通知テンプレート作成

---

## 参照

- [ADR-010: Stripe Webhook セキュリティ設計](./ADR-010-stripe-webhook-security.md)
- [ADR-013: CV マイクロサービスアーキテクチャ](./ADR-013-cv-microservice-architecture.md)
- [Stripe Subscription with multiple prices](https://stripe.com/docs/billing/subscriptions/multiple-products)
- [Stripe 利用規約変更通知要件](https://stripe.com/legal/ssa#section-d)
