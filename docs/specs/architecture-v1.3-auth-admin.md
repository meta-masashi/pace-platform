# PACE Platform v1.3 アーキテクチャ設計書
# ログイン分離 + プラットフォーム管理画面 + platform_admin ロール

> **作成日:** 2026-04-04
> **ステータス:** 設計確定（実装前レビュー待ち）
> **依拠:** MASTER-SPEC v1.3 セクション 3.5, 4-2

---

## 1. ミドルウェアフロー図

### 1.1 全体フロー（pace-platform/middleware.ts 改修）

```
リクエスト受信
    │
    ├── 静的アセット / _next/ ? ─── YES ──→ [PASS + セキュリティヘッダー]
    │
    ├── 廃止 API (/api/telehealth, /api/insurance) ? ── YES ──→ [410 Gone]
    │
    ├── PUBLIC_ROUTES ? ── YES ──→ [PASS + セキュリティヘッダー]
    │   (/login, /auth/login, /auth/athlete-login, /auth/admin-login,
    │    /auth/callback, /tokushoho, /privacy, /auth/athlete-signup)
    │
    ├── CSRF チェック (POST/PUT/PATCH/DELETE) ── FAIL ──→ [403]
    │
    ├── Content-Type チェック ── FAIL ──→ [415]
    │
    ├── API_AUTH_EXEMPT ? ── YES ──→ [PASS + セキュリティヘッダー]
    │
    ├── Supabase セッション検証
    │   │
    │   ├── user == null ?
    │   │   ├── API ルート ──→ [401 JSON]
    │   │   └── ページルート ──→ [リダイレクト: ログインURL判定]
    │   │       ├── /platform-admin/* ──→ /auth/admin-login
    │   │       ├── /home, /checkin, /history ──→ /auth/athlete-login
    │   │       └── その他 ──→ /auth/login
    │   │
    │   └── user != null ?
    │       │
    │       ├── ★ ログインページへのアクセス（認証済みユーザーのリダイレクト）
    │       │   │
    │       │   ├── /auth/login にアクセス
    │       │   │   ├── is_platform_admin → /auth/admin-login へリダイレクト
    │       │   │   ├── athlete_only（staff でない） → /auth/athlete-login へリダイレクト
    │       │   │   └── staff → /dashboard へリダイレクト
    │       │   │
    │       │   ├── /auth/athlete-login にアクセス
    │       │   │   ├── is_platform_admin → /auth/admin-login へリダイレクト
    │       │   │   ├── staff_member → /auth/login へ「スタッフの方はこちら」表示
    │       │   │   └── athlete → /home へリダイレクト
    │       │   │
    │       │   └── /auth/admin-login にアクセス
    │       │       ├── is_platform_admin → /platform-admin へリダイレクト
    │       │       └── それ以外 → /auth/login へリダイレクト
    │       │
    │       ├── ★ /platform-admin/* へのアクセス制御
    │       │   ├── is_platform_admin → [PASS]
    │       │   └── それ以外 → [403 or /dashboard へリダイレクト]
    │       │
    │       └── ★ 通常ページ
    │           └── [PASS + x-authenticated-user-id ヘッダー]
```

### 1.2 ロール判定順序（ミドルウェア内）

```
1. platform_admins テーブルに user.id が存在 → platform_admin
2. staff_members テーブルに user.id が存在 → staff（role: master/AT/PT/S&C）
3. athletes テーブルに user.id が存在 → athlete
4. いずれにも該当しない → unknown（ログインページへリダイレクト）
```

> **注意:** ミドルウェアでの DB クエリはパフォーマンスに影響するため、
> ロール判定はコールバック時にセッション metadata へ書き込み、
> ミドルウェアでは metadata を参照する方式を採用する（セクション 5 参照）。

---

## 2. ルーティングテーブル

### 2.1 認証関連ルート

| パス | メソッド | 認証要否 | 説明 |
|------|---------|---------|------|
| `/auth/login` | GET | 不要（public） | スタッフ用ログインページ |
| `/auth/athlete-login` | GET | 不要（public） | 選手用ログインページ（**新規**） |
| `/auth/admin-login` | GET | 不要（public） | プラットフォーム管理者用ログインページ（**新規**） |
| `/auth/athlete-signup` | GET | 不要（public） | 選手セルフサインアップ（**新規**） |
| `/api/auth/callback` | GET | 不要 | OAuth / Magic Link コールバック（**改修**） |
| `/api/auth/login` | POST | 不要 | メール+パスワード認証（既存） |

### 2.2 認証後リダイレクト先

| ログイン元 | ロール | リダイレクト先 | login_context |
|-----------|--------|--------------|---------------|
| `/auth/login` | staff | `/dashboard` | `staff` |
| `/auth/login` | athlete_only | `/auth/athlete-login` へ誘導 | - |
| `/auth/login` | platform_admin | `/auth/admin-login` へ誘導 | - |
| `/auth/athlete-login` | athlete | `/home` | `athlete` |
| `/auth/athlete-login` | staff（兼選手） | `/home` | `athlete` |
| `/auth/athlete-login` | platform_admin | `/auth/admin-login` へ誘導 | - |
| `/auth/admin-login` | platform_admin | `/platform-admin` | `platform_admin` |
| `/auth/admin-login` | staff/athlete | `/auth/login` へ誘導 | - |

### 2.3 プラットフォーム管理画面ルート（全て **新規**）

| パス | 説明 | 認可要件 |
|------|------|---------|
| `/platform-admin` | ダッシュボード（P1） | platform_admin のみ |
| `/platform-admin/billing` | 決済状況（P2） | platform_admin のみ |
| `/platform-admin/teams` | 契約チーム + プラン管理（P3） | platform_admin のみ |
| `/platform-admin/errors` | システムエラー（P4） | platform_admin のみ |
| `/platform-admin/engine` | 推論エンジン監視（P5） | platform_admin のみ |
| `/platform-admin/usage` | 利用率（P6） | platform_admin のみ |
| `/platform-admin/engine-growth` | エンジン成長率（P7） | platform_admin のみ |

### 2.4 既存ルート（変更なし）

| パス | Route Group | 認可要件 |
|------|------------|---------|
| `/dashboard` | `(staff)` | staff ロール |
| `/home` | `(athlete)` | athlete ロール |
| `/admin/*` | `(staff)` | master ロール |

---

## 3. API エンドポイント一覧

### 3.1 チームコード管理 API（**新規**）

| メソッド | パス | 認可要件 | レスポンス概要 |
|---------|------|---------|--------------|
| GET | `/api/admin/team-codes` | staff: master のみ | チームコード一覧（code, expires_at, max_uses, current_uses, is_active） |
| POST | `/api/admin/team-codes` | staff: master のみ | チームコード新規生成。リクエスト: `{ expires_in_days?: number, max_uses?: number }` |
| PATCH | `/api/admin/team-codes/[codeId]` | staff: master のみ | コード無効化。リクエスト: `{ is_active: false }` |
| DELETE | `/api/admin/team-codes/[codeId]` | staff: master のみ | コード削除（論理削除） |

### 3.2 選手セルフサインアップ API（**新規**）

| メソッド | パス | 認可要件 | レスポンス概要 |
|---------|------|---------|--------------|
| POST | `/api/auth/athlete-signup` | 認証済みユーザー（athlete未登録） | チームコード検証 + athletes レコード作成。リクエスト: `{ team_code: string }` |

### 3.3 プラットフォーム管理 API（全て **新規**）

| メソッド | パス | 認可要件 | レスポンス概要 |
|---------|------|---------|--------------|
| GET | `/api/platform-admin/billing` | platform_admin | 組織別 Stripe 請求サマリー、MRR 推移、未払い一覧 |
| GET | `/api/platform-admin/teams` | platform_admin | 契約組織一覧（名称、ステータス、プラン、スタッフ数、選手数） |
| GET | `/api/platform-admin/errors` | platform_admin | API エラー率推移、エラー種別集計、エンジン稼働状況 |
| GET | `/api/platform-admin/engine` | platform_admin | Go/TS 切替状況、レイテンシ p50/p95/p99、Shadow Mode 差分 |
| GET | `/api/platform-admin/usage` | platform_admin | 組織別 DAU/MAU、チェックイン率、機能別利用率 |
| GET | `/api/platform-admin/engine-growth` | platform_admin | 組織別データ蓄積量、推論精度推移、データ品質スコア |
| GET | `/api/platform-admin/plan-change-requests` | platform_admin | プラン変更依頼一覧 |
| POST | `/api/platform-admin/plan-change-requests/[requestId]/approve` | platform_admin | プラン変更承認 |
| POST | `/api/platform-admin/plan-change-requests/[requestId]/reject` | platform_admin | プラン変更却下 |

### 3.4 API 認可チェックパターン

全 `/api/platform-admin/*` エンドポイントは以下の共通パターンを使用:

```typescript
// lib/api/platform-admin-guard.ts（新規）
import { createClient } from '@/lib/supabase/server';

export async function requirePlatformAdmin(): Promise<{
  userId: string;
} | { error: Response }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json(
      { success: false, error: '認証が必要です。' },
      { status: 401 }
    )};
  }

  const { data: admin } = await supabase
    .from('platform_admins')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!admin) {
    return { error: NextResponse.json(
      { success: false, error: 'プラットフォーム管理者権限が必要です。' },
      { status: 403 }
    )};
  }

  return { userId: user.id };
}
```

---

## 4. 認証コールバック改修設計

### 4.1 現行の問題点

現在の `GET /api/auth/callback` は:
1. `athletes` テーブルをチェック → athlete なら `/home`
2. `staff` テーブルをチェック → staff なら `/dashboard`
3. どちらでもない → `/login`

v1.3 では以下が追加で必要:
- `platform_admins` テーブルチェック
- `login_context` の引き継ぎ（どのログインページから来たか）
- セッション metadata への `login_context` 書き込み

### 4.2 改修後のフロー

```
GET /api/auth/callback?code=xxx&login_context=staff|athlete|admin

    1. code → session 交換
    2. user 取得
    3. login_context パラメータ読み取り（OAuth redirect URL に付与）
    4. ロール判定:
       a. platform_admins.user_id == user.id → role = 'platform_admin'
       b. staff_members.id == user.id → role = 'staff'
       c. athletes.user_id == user.id → role = 'athlete'
       d. いずれでもない → role = 'unknown'
    5. login_context + role に基づくリダイレクト:
       ┌─────────────────┬──────────────────┬─────────────────────┐
       │ login_context    │ role             │ リダイレクト先        │
       ├─────────────────┼──────────────────┼─────────────────────┤
       │ admin           │ platform_admin   │ /platform-admin      │
       │ admin           │ other            │ /auth/login?error=.. │
       │ staff           │ staff            │ /dashboard           │
       │ staff           │ athlete_only     │ /auth/athlete-login  │
       │ staff           │ platform_admin   │ /auth/admin-login    │
       │ athlete         │ athlete/both     │ /home                │
       │ athlete         │ staff_only       │ /auth/login          │
       │ athlete         │ platform_admin   │ /auth/admin-login    │
       │ (なし)          │ any              │ 既存ロジック維持      │
       └─────────────────┴──────────────────┴─────────────────────┘
    6. セッション metadata 更新:
       user.user_metadata.login_context = login_context
       user.user_metadata.detected_role = role
```

### 4.3 login_context の受け渡し方法

Magic Link / Google OAuth の `redirectTo` URL にクエリパラメータとして付与:

```typescript
// auth-helpers.ts 改修
export async function signInWithMagicLink(
  email: string,
  loginContext: 'staff' | 'athlete' | 'admin' = 'staff'
): Promise<{ success: boolean; error?: string }> {
  const supabase = getBrowserClient();
  const redirectTo = `${window.location.origin}/api/auth/callback?login_context=${loginContext}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  // ...
}
```

---

## 5. セッション管理方針（login_context フラグ）

### 5.1 方針概要

`login_context` はユーザーがどのログインページを経由したかを示すセッションレベルのフラグ。
Supabase Auth の `user_metadata` に保存し、ミドルウェアおよびクライアントサイドで参照する。

### 5.2 データ格納場所

```
Supabase Auth → user_metadata: {
  login_context: 'staff' | 'athlete' | 'platform_admin',
  detected_roles: ['staff', 'athlete'],  // 兼務判定用
  login_timestamp: ISO8601
}
```

**選択理由:**
- Cookie に直接格納する案も検討したが、Supabase Auth の session 管理と二重管理になるため却下
- `user_metadata` は `supabase.auth.updateUser()` で更新可能
- ミドルウェアでは `supabase.auth.getUser()` で取得済みの user オブジェクトから参照可能（追加 DB クエリ不要）

### 5.3 ロール切替スイッチの制御

| login_context | detected_roles | 選手ビュー切替 | スタッフビュー切替 |
|---------------|---------------|--------------|-----------------|
| `staff` | `['staff', 'athlete']` | 可能 | - (既にスタッフ) |
| `staff` | `['staff']` | 不可（選手レコードなし） | - |
| `athlete` | `['athlete', 'staff']` | - (既に選手) | **不可**（セキュリティ制約） |
| `athlete` | `['athlete']` | - | 不可 |
| `platform_admin` | `['platform_admin']` | 不可 | 不可 |

### 5.4 ミドルウェアでのメタデータ参照（DB クエリ回避）

```typescript
// middleware.ts 内
const { data: { user } } = await supabase.auth.getUser();

if (user) {
  const loginContext = user.user_metadata?.login_context as string | undefined;
  const detectedRoles = user.user_metadata?.detected_roles as string[] | undefined;

  // platform_admin パス制御
  if (pathname.startsWith('/platform-admin')) {
    if (!detectedRoles?.includes('platform_admin')) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // 認証済みユーザーのログインページアクセス制御
  if (pathname === '/auth/login' && detectedRoles?.includes('platform_admin')) {
    return NextResponse.redirect(new URL('/auth/admin-login', request.url));
  }
  // ... 他のリダイレクトロジック
}
```

### 5.5 初回ログイン時のメタデータ初期化

認証コールバック (`/api/auth/callback`) でロール判定後にメタデータを更新:

```typescript
// コールバック内
const roles: string[] = [];
if (platformAdmin) roles.push('platform_admin');
if (staffMember) roles.push('staff');
if (athlete) roles.push('athlete');

await supabase.auth.updateUser({
  data: {
    login_context: loginContext,
    detected_roles: roles,
    login_timestamp: new Date().toISOString(),
  },
});
```

---

## 6. ディレクトリ構造の変更計画

### 6.1 新規追加ファイル

```
pace-platform/
├── app/
│   ├── auth/
│   │   ├── login/
│   │   │   └── page.tsx                    # 既存 → /login から移動（スタッフ用）
│   │   ├── athlete-login/
│   │   │   └── page.tsx                    # 【新規】選手用ログイン
│   │   ├── admin-login/
│   │   │   └── page.tsx                    # 【新規】管理者用ログイン
│   │   └── athlete-signup/
│   │       └── page.tsx                    # 【新規】選手セルフサインアップ
│   │
│   ├── (platform-admin)/                   # 【新規】Route Group
│   │   ├── layout.tsx                      # 管理画面レイアウト（サイドバー + コンテンツ）
│   │   └── platform-admin/
│   │       ├── page.tsx                    # P1: ダッシュボード
│   │       ├── billing/
│   │       │   └── page.tsx                # P2: 決済状況
│   │       ├── teams/
│   │       │   └── page.tsx                # P3: 契約チーム + プラン管理
│   │       ├── errors/
│   │       │   └── page.tsx                # P4: システムエラー
│   │       ├── engine/
│   │       │   └── page.tsx                # P5: 推論エンジン監視
│   │       ├── usage/
│   │       │   └── page.tsx                # P6: 利用率
│   │       └── engine-growth/
│   │           └── page.tsx                # P7: エンジン成長率
│   │
│   └── api/
│       ├── admin/
│       │   └── team-codes/
│       │       ├── route.ts                # 【新規】GET（一覧）/ POST（生成）
│       │       └── [codeId]/
│       │           └── route.ts            # 【新規】PATCH（無効化）/ DELETE
│       ├── auth/
│       │   ├── callback/
│       │   │   └── route.ts                # 【改修】login_context + platform_admin 対応
│       │   └── athlete-signup/
│       │       └── route.ts                # 【新規】チームコード検証 + athlete 登録
│       └── platform-admin/
│           ├── billing/
│           │   └── route.ts                # 【新規】
│           ├── teams/
│           │   └── route.ts                # 【新規】
│           ├── errors/
│           │   └── route.ts                # 【新規】
│           ├── engine/
│           │   └── route.ts                # 【新規】
│           ├── usage/
│           │   └── route.ts                # 【新規】
│           ├── engine-growth/
│           │   └── route.ts                # 【新規】
│           └── plan-change-requests/
│               ├── route.ts                # 【新規】GET（一覧）
│               └── [requestId]/
│                   ├── approve/
│                   │   └── route.ts        # 【新規】POST
│                   └── reject/
│                       └── route.ts        # 【新規】POST
│
├── lib/
│   ├── api/
│   │   └── platform-admin-guard.ts         # 【新規】platform_admin 認可ガード
│   └── supabase/
│       └── auth-helpers.ts                 # 【改修】login_context パラメータ追加
│
├── middleware.ts                            # 【改修】ログインURL分離 + platform-admin ガード
│
└── components/
    └── platform-admin/
        ├── admin-sidebar.tsx               # 【新規】管理画面サイドバー
        ├── admin-header.tsx                # 【新規】管理画面ヘッダー
        ├── kpi-summary-card.tsx            # 【新規】KPI サマリーカード
        └── billing-table.tsx               # 【新規】請求一覧テーブル
```

### 6.2 既存ファイルの改修

| ファイル | 改修内容 |
|---------|---------|
| `pace-platform/middleware.ts` | PUBLIC_ROUTES 追加、ログインURL分離ロジック、platform-admin パスガード |
| `pace-platform/app/api/auth/callback/route.ts` | platform_admins チェック追加、login_context 引き継ぎ、メタデータ更新 |
| `pace-platform/lib/supabase/auth-helpers.ts` | `signInWithMagicLink()` / `signInWithGoogle()` に login_context パラメータ追加 |
| `pace-platform/app/login/page.tsx` | `/auth/login` へのリダイレクト（後方互換性）、または直接移動 |
| `pace-platform/app/(staff)/_components/staff-header.tsx` | 選手ビュー切替トグル追加（兼務者のみ表示） |

### 6.3 後方互換性

| 旧パス | 対応 |
|-------|------|
| `/login` | `/auth/login` へ 301 リダイレクト（middleware で処理） |
| `/api/auth/callback`（login_context なし） | 既存ロジック維持（staff → /dashboard, athlete → /home） |

---

## 7. DB スキーマ変更（Data Engineer への引き継ぎ事項）

### 7.1 新規テーブル

```sql
-- platform_admins: プラットフォーム管理者テーブル
CREATE TABLE platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- team_codes: チームコード（選手セルフサインアップ用）
CREATE TABLE team_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  max_uses INT,                              -- NULL = 無制限
  current_uses INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- plan_change_requests: プラン変更依頼
CREATE TABLE plan_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  requested_plan TEXT NOT NULL,               -- 'standard' | 'pro' | 'pro_cv' | 'enterprise'
  current_plan TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',     -- 'pending' | 'approved' | 'rejected'
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 7.2 RLS ポリシー

```sql
-- platform_admins: 本人のみ参照可
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_admins_self" ON platform_admins
  FOR SELECT USING (user_id = auth.uid());

-- team_codes: master ロールのみ CRUD
ALTER TABLE team_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_codes_master" ON team_codes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM staff_members
      WHERE staff_members.id = auth.uid()
      AND staff_members.role = 'master'
      AND staff_members.organization_id = team_codes.organization_id
    )
  );

-- team_codes: 認証済みユーザーのコード検証（SELECT のみ、is_active かつ未期限のみ）
CREATE POLICY "team_codes_verify" ON team_codes
  FOR SELECT USING (
    is_active = true
    AND expires_at > now()
    AND (max_uses IS NULL OR current_uses < max_uses)
  );
```

### 7.3 ヘルパー関数

```sql
-- is_platform_admin(): 現在のユーザーが platform_admin かどうか
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

---

## 8. セキュリティ考慮事項

### 8.1 platform_admin の情報秘匿性

- platform_admin は **集計ビューのみ** アクセス可能
- 個別選手データ、SOAP ノート、スタッフ個人情報へのアクセスは RLS で完全遮断
- API レスポンスには個人を特定できる情報を含めない（組織名・集計値のみ）
- platform_admin API は全て `/api/platform-admin/` プレフィックスに統一し、ミドルウェアで一括ガード

### 8.2 チームコードのセキュリティ

- コードはランダム生成（最低 8 文字、英数字混在）
- 有効期限のデフォルト: 7 日間
- 使用回数の追跡（`current_uses` カラム）
- master のみがコード生成・無効化可能
- コード検証 API はレートリミット適用（1 分あたり 5 回まで）

### 8.3 ログインコンテキストの改ざん防止

- `login_context` は OAuth redirect URL のクエリパラメータとして受け渡すため、ユーザーが改変可能
- **対策:** コールバック内でロール判定を再検証し、`login_context` と実際のロールが不一致の場合は正しいページへリダイレクト
- `login_context` は利便性のためのヒントであり、**アクセス制御の根拠としない**
- アクセス制御は常にサーバーサイドのロール判定（DB クエリ / user_metadata 内の `detected_roles`）に基づく

---

## 9. 実装優先順序

| 順序 | タスク | 依存関係 |
|------|-------|---------|
| 1 | DB スキーマ（platform_admins, team_codes, plan_change_requests） | なし |
| 2 | `is_platform_admin()` ヘルパー関数 + RLS ポリシー | 1 |
| 3 | 認証コールバック改修（login_context + platform_admin 判定） | 1, 2 |
| 4 | auth-helpers.ts 改修（login_context パラメータ追加） | なし |
| 5 | middleware.ts 改修（ログインURL分離 + platform-admin ガード） | 3 |
| 6 | `/auth/athlete-login` ページ | 4 |
| 7 | `/auth/admin-login` ページ | 4 |
| 8 | `/auth/athlete-signup` ページ + API | 1 |
| 9 | `/api/admin/team-codes` API | 1, 2 |
| 10 | `(platform-admin)` レイアウト + ダッシュボード | 2, 5 |
| 11 | `/api/platform-admin/*` API エンドポイント群 | 2 |
| 12 | platform-admin 各画面（P2-P7） | 10, 11 |
| 13 | スタッフヘッダーの選手ビュー切替トグル | 3, 5 |
