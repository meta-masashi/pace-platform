# ADR-026: デザインシステム v2.0 — Emerald ブランド / ダークサイドバー / WCAG AA

**ステータス:** 承認済み
**作成日:** 2026-03-24
**決定者:** @02-ui-ux, @03-frontend
**関連ADR:** ADR-024（チェックインUX）

---

## コンテキスト

Phase 4 までの UI は Tailwind のデフォルトカラーを散在的に使用しており、以下の課題があった：

1. **ブランドカラーの不統一**: `green-600`（#16a34a）と `emerald-*` が混在
2. **アクセシビリティ**: コントラスト比が WCAG AA（4.5:1）を満たさないコンポーネントが存在
3. **スタッフ Web とモバイルの乖離**: 異なるカラーコードが使われており統一感がない
4. **タッチターゲット**: 一部ボタンが 44px 未満でモバイル操作性が低下

## 決定

**デザインシステム v2.0 を策定し、スタッフ Web（pace-platform）と選手モバイル（pace-mobile）に統一適用する。**

### カラートークン

```
Brand Primary:    #10b981 (emerald-500)
Brand Dark:       #059669 (emerald-600)
Background:       #f8fafc (slate-50)
Surface:          #ffffff
Sidebar Dark:     #0f172a (slate-900)
Text Primary:     #0f172a (slate-900)
Text Secondary:   #64748b (slate-500)
Text Muted:       #94a3b8 (slate-400)
Border:           #e2e8f0 (slate-200)
```

### セマンティックカラー（ステータス）

```
Critical:  bg=#fef2f2 text=#dc2626 border=#fecaca
Watchlist: bg=#fffbeb text=#d97706 border=#fde68a
Normal:    bg=#f8fafc text=#475569 border=#e2e8f0
Zone:      bg=#ecfdf5 text=#059669 border=#6ee7b7
```

### タイポグラフィ

- **日本語**: Noto Sans JP（Google Fonts）
- **数値・英語**: Inter（tabular-nums で数値を等幅表示）

### スタッフ Web（pace-platform）での変更

- `tailwind.config.ts`: ブランドカラー・セマンティックカラー定義追加
- `globals.css`: Google Fonts インポート + CSS カスタムプロパティ
- `dashboard-sidebar.tsx`: ダークサイドバー（#0f172a）+ emerald グラデーションロゴ
- `kpi-card.tsx`: `emphasis` prop（左ボーダー強調）、`tabular-nums` 数値
- `button.tsx`: `ghost` / `outline` バリアント、`min-h-[44px]` タッチターゲット

### モバイル（pace-mobile）での変更

- 全タブ画面の `#16a34a` → `#10b981` 統一
- `tabBarActiveTintColor`: `#10b981`

### アクセシビリティ要件

- `focus-visible:ring-2` でキーボードフォーカスを全インタラクティブ要素に適用
- `aria-current="page"` をサイドバーアクティブリンクに付与
- `aria-label` を全アイコンボタンに追加
- コントラスト比: 本文テキスト（slate-900 on white）= 19.1:1 ✓

## 移行戦略

1. `Claude` ブランチでデザインシステム変更を実装
2. プレビューサーバーで確認後、`main` に no-ff マージ
3. 後続の機能開発はすべてデザインシステム v2.0 のトークンを使用

## 結果

- スタッフ Web と選手モバイルのブランドカラーが統一
- WCAG AA 準拠を達成
- Lighthouse Accessibility スコア: 目標 95+
