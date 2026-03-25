# PACE Phase 1 修正要件：Web-First / PWA 運用への最適化

> 確定日: 2026-03-25
> ステータス: 確定版
> 関連: [Phased PRD v1.0](./phased-prd-v1.md) | [実装変更指示書](./implementation-change-directive.md)

---

## 方針

技術スタック（Supabase + Vercel）の強みを最大限に活かし、アプリストアを経由せずに「まるでネイティブアプリのような体験」を提供する。

---

## 1. フロントエンド・アーキテクチャ（Next.js レスポンシブ設計）

単一の Web アプリケーション（Next.js）で、ユーザーのデバイスに応じて最適な画面を提供する。

### スタッフ向け画面（The 7 AM Monopoly Dashboard）

| 項目 | 仕様 |
|------|------|
| ターゲットデバイス | タブレット（iPad 等）横画面、PC ブラウザ（Chrome/Safari） |
| UI 要件 | チーム全体の一覧性、選手詳細カード、ワンタップ・アプルーバルのタッチ操作最適化 |
| ブレイクポイント | `md:` (768px) 以上でデスクトップ/タブレットレイアウト |

### 選手向け画面（The Blood Input）

| 項目 | 仕様 |
|------|------|
| ターゲットデバイス | スマートフォン（縦画面）ブラウザ |
| UI 要件 | 毎朝の P0（主観アンケート）や疲労度入力を片手で数タップで完了 |
| 設計方針 | モバイルファースト SPA、画面遷移を極限まで削減 |
| ブレイクポイント | `max-w-[430px]` でモバイル中心レイアウト |

---

## 2. PWA（Progressive Web App）の導入

### 「ホーム画面に追加」機能

- `manifest.json` と Service Worker を実装
- 初回ログイン時に「ホーム画面に追加」を促すバナー表示
- Standalone モード（URL バー非表示）でフルスクリーン起動
- アイコン: PACE ブランドアイコン（192px / 512px）

### オフライン・キャッシュ（軽量化）

- ロッカールーム・ピッチ上など不安定な通信環境対応
- Service Worker で静的アセットと前日データをキャッシュ
- オフライン時: 前日のダッシュボードを表示 + 「オフライン」バッジ
- オンライン復帰時: 自動同期

### 実装ファイル

| ファイル | 内容 |
|---------|------|
| `public/manifest.json` | PWA マニフェスト（name, icons, start_url, display: standalone, theme_color） |
| `public/sw.js` | Service Worker（静的アセットキャッシュ + API レスポンスキャッシュ） |
| `app/layout.tsx` | `<link rel="manifest">` + メタタグ追加 |
| `app/_components/pwa-install-prompt.tsx` | インストール促進バナー |

---

## 3. 認証・通知設計の Web 最適化

### 認証フロー

| 方式 | 優先度 | 説明 |
|------|--------|------|
| マジックリンク認証 | 推奨 | Supabase Auth — メール送信でパスワード不要ログイン |
| Google アカウント連携 | 推奨 | OAuth 2.0 — ワンタップ SSO |
| Apple アカウント連携 | オプション | Sign in with Apple（iOS ユーザー向け） |
| メール + パスワード | フォールバック | 従来方式（既存実装済み） |

### 通知機能

| 方式 | Phase 1 | Phase 2 |
|------|---------|---------|
| Web Push 通知 | ✅ 実装 | 維持 |
| 自動メール通知 | ✅「毎朝 6:30 本日のアジェンダ生成完了」 | 維持 |
| Slack 通知 | ✅ Webhook（既存） | 維持 |
| ネイティブ Push | ❌ 対象外 | React Native 移行時に実装 |

---

## 4. Phase 2（ネイティブアプリ化）への架け橋

### 段階的移行戦略

```
Phase 1（現在）
├── ロジック（ベイズ推論 / タグコンパイラ）    → lib/ に集約
├── DB（Supabase）                              → API Routes 経由
├── React コンポーネント                         → PWA として完成
└── 出力: Web アプリ（PWA）

Phase 2（将来）
├── Web コード資産をそのまま活用
├── ブラウザ限界を超える機能のみネイティブ化:
│   ├── Computer Vision（カメラ動作解析）
│   ├── 高頻度 IMU（100Hz 加速度解析）
│   └── HealthKit / Health Connect 連携
└── 出力: React Native / Expo でガワを被せ → ストア公開
```

### コード共有の原則

| レイヤー | Phase 1 | Phase 2 |
|---------|---------|---------|
| ビジネスロジック | `lib/` (TypeScript) | そのまま流用 |
| API | Next.js API Routes | そのまま流用 |
| UI コンポーネント | React (Tailwind) | React Native に移植 |
| デバイス機能 | Web API のみ | Native モジュール追加 |

---

## 関連ドキュメント

- [Phased PRD v1.0](./phased-prd-v1.md)
- [GTM ロードマップ 2026-2028](./gtm-product-roadmap-2026-2028.md)
- [実装変更指示書](./implementation-change-directive.md)
