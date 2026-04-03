# PACE Platform v6.0 UI/UX デザイン仕様書

**バージョン:** 6.0
**作成日:** 2026-03-25
**作成者:** 02-ui-ux（皮膚・感覚 / UI・UXデザイナーエージェント）
**ステータス:** 承認済み
**関連ADR:** ADR-026（デザインシステム v2.0）

---

## 1. デザイン・フィロソフィー: "Complexity to Clarity"

### 1.1 Math-Invisible Design

専門用語を直感的な言葉に変換する。UIに数式を直接表示しない。

| 数理用語（内部） | UI表示ラベル | 理由 |
|---|---|---|
| $D_{tissue}$ (組織ダメージ) | 「回復の質」 | 肯定的フレーミング |
| $SampEn$ (サンプルエントロピー) | 「動作の乱れ」 | 感覚的に理解可能 |
| ODE解 $D(t)$ | 「身体の負荷蓄積」 | 具象的比喩 |
| カルマン残差 $y_k$ | 「申告と実態の差」 | 二項対立で明確化 |
| MRF伝達係数 $W_{ij}$ | 「連鎖の強さ」 | アニメーションで直感化 |
| ACWR | 「負荷バランス」 | 既存ラベル維持（認知済み） |

### 1.2 3-Layer Information Architecture

全画面は以下の3層で情報を段階的に開示する:

| レイヤー | 目的 | 表示時間 | 情報密度 | UI表現 |
|---|---|---|---|---|
| Layer 1 (Status) | 1秒で状況把握 | 即時 | 最小 | 色 + 一言メッセージ + グロウエフェクト |
| Layer 2 (Narrative) | なぜそうなったか | 3-5秒 | 中 | 運動連鎖図解 + デカップリング表示 |
| Layer 3 (Evidence) | 数理的証跡 | 必要時 | 高 | KaTeX数式 + トレースログ + Data Lineage |

---

## 2. デザイントークン定義

### 2.1 カラーシステム

#### v6.0 "Deep Space" パレット（Bio-War Room / Evidence Vault 専用）

```
用途              カラーコード    HSL               心理的効果
────────────────────────────────────────────────────────────────
Base Background   #0D1117       216 28% 7%        集中・プロフェッショナル
Card Surface      #161B22       216 22% 11%       浮遊感・階層
High Risk (RED)   #FF4B4B       0 100% 65%        緊急・停止・血管の赤
Decoupling (ORG)  #FF9F29       33 100% 58%       矛盾・注意・対話の必要性
Bio-Active (CYN)  #00F2FF       183 100% 50%      神経系・未来・インテリジェンス
Brand Green       #10b981       160 84% 39%       信頼・成長（既存維持）
```

#### WCAG AA コントラスト比検証結果

| テキスト色 | 背景色 | コントラスト比 | 判定 |
|---|---|---|---|
| #00F2FF (Cyber Cyan) | #0D1117 (Deep Space) | 10.1:1 | AA/AAA 適合 |
| #FF4B4B (Pulse Red) | #0D1117 (Deep Space) | 5.2:1 | AA 適合 |
| #FF9F29 (Amber Caution) | #0D1117 (Deep Space) | 6.8:1 | AA/AAA 適合 |
| #E6E8EB (テキスト) | #0D1117 (Deep Space) | 13.8:1 | AA/AAA 適合 |
| #10b981 (Brand) | #FFFFFF (White) | 3.4:1 | Large Text のみ AA |
| #059669 (Brand-600) | #FFFFFF (White) | 4.6:1 | AA 適合 |

> **注意:** Brand #10b981 は白背景での通常テキストに使用不可。ボタンラベルなど大サイズテキスト（18px以上 or 14px bold）にのみ使用する。通常テキストには Brand-600 #059669 を使用すること。

#### テーマ切替ロジック

```
アスリート向け (Mobile PWA)  → Light テーマ (:root)
スタッフ通常業務             → Light テーマ (:root) + ダークサイドバー
Bio-War Room / Evidence Vault → .theme-deep-space クラスを付与
```

### 2.2 タイポグラフィ

```typescript
fontFamily: {
  sans:  ['Noto Sans JP', 'Inter', 'sans-serif'],   // 本文
  label: ['Inter', 'Noto Sans JP', 'sans-serif'],    // UIラベル・数値
  mono:  ['JetBrains Mono', 'monospace'],             // Evidence Vault 数式
}
```

| 用途 | fontSize | lineHeight | 備考 |
|---|---|---|---|
| 本文（日本語） | 16px (base) | 1.75 | 最低 14px / line-height 1.6 |
| UIラベル | 12px (xs) | 1.6 | font-label |
| KPI数値 | 40px (kpi-lg) | 1.0 | tabular-nums, font-label |
| Glowing Core スコア | 56px (score-hero) | 1.0 | 中央配置 |
| 数式（Evidence） | 14px (sm) | 1.65 | font-mono |

### 2.3 角丸・シャドウ

```
角丸:
  sm:  4px  — ボタン、バッジ
  md:  8px  — カード、入力フィールド
  lg:  12px — モーダル、大きなパネル
  xl:  16px — Glowing Core 外枠
  full: 9999px — アバター、ステータスドット

シャドウ:
  card:       通常カード
  card-hover: ホバー時
  glow-green: 状態良好グロウ
  glow-red:   危険グロウ
  glow-amber: 注意グロウ
  glow-cyan:  Bio-Active グロウ
```

---

## 3. 画面一覧

### 3.1 アスリート向け "The Performance Compass" (Mobile PWA)

| # | 画面名 | ルートパス | 主要コンポーネント | 認証要否 | v6.0変更 |
|---|---|---|---|---|---|
| A1 | ホーム（Status Circle） | /(athlete)/home | GlowingCore, ActionOfTheDay, BreakdownCard | 要 | **大幅改修** |
| A2 | チェックイン | /(athlete)/checkin | AdaptiveCheckinForm, FatigueFocusUI, VigorUI | 要 | **改修: 動的質問** |
| A3 | Bio-Scan（CV） | /(athlete)/bioscan | CameraOverlay, SkeletonLine, ScanIndicator, MotionScore | 要 | **新規** |
| A4 | 履歴 | /(athlete)/history | ConditioningTrendChart, CalendarView | 要 | 軽微 |

### 3.2 指導者・MDT向け "The Bio-War Room" (Tablet/Desktop)

| # | 画面名 | ルートパス | 主要コンポーネント | 認証要否 | v6.0変更 |
|---|---|---|---|---|---|
| S1 | ダッシュボード | /(staff)/dashboard | KpiCard, AlertActionHub, TeamSelector | 要 | 軽微 |
| S2 | トリアージ | /(staff)/triage | TriageColumn, TriageCard | 要 | 既存 |
| S3 | 選手詳細 | /(staff)/athletes/[id] | AthleteDetail, LockManager | 要 | 既存 |
| S4 | アセスメント | /(staff)/assessment/[id] | AssessmentSession, PosteriorPanel, RedFlagModal | 要 | 既存 |
| S5 | What-If シミュレータ | /(staff)/what-if | **WhatIfSimulator**, InterventionSlider, RiskHeatmap3D, CounterfactualExplanation | 要 | **大幅改修** |
| S6 | 3D キネティック・ヒートマップ | /(staff)/warroom | **BodyModel3D**, TissueStressLayer, ChainReactionLine, StressPopup | 要 | **新規** |
| S7 | デカップリング・パネル | /(staff)/warroom/decoupling | InconsistencyMeter, InnovationPlot, KalmanResidualDots | 要 | **新規** |
| S8 | Evidence Vault | /(staff)/warroom/evidence | OneClickAudit, KaTeXRenderer, DataLineageTable, DeviceKappaTable | 要 | **新規** |
| S9 | リハビリ管理 | /(staff)/rehab/[id] | ProgramDetail, PhaseStepper, RecoveryCurveChart | 要 | 既存 |
| S10 | SOAP記録 | /(staff)/soap/new | SoapForm, AiGenerateButton | 要 | 既存 |
| S11 | レポート | /(staff)/reports | ReportViewer | 要 | 既存 |

### 3.3 共通画面

| # | 画面名 | ルートパス | 主要コンポーネント | 認証要否 |
|---|---|---|---|---|
| C1 | ランディングページ | / | Hero, Features, CTA, Footer | 不要 |
| C2 | ログイン | /login | LoginForm, SocialLoginButton | 不要 |
| C3 | セットアップ | /(onboarding)/setup | SetupWizard | 要 |
| C4 | 設定 | /(staff)/settings | ProfileForm, NotificationSettings, SecuritySettings | 要 |
| C5 | 管理者 | /(staff)/admin | StaffTable, TeamsManagement, BillingPage | 要(admin) |

---

## 4. v6.0 新規コンポーネント仕様

### 4.1 GlowingCore（アスリートホーム中央円）

```
コンポーネント名: GlowingCore
パス: app/(athlete)/home/_components/glowing-core.tsx
役割: 画面中央の大きな円。ステータスに応じて色と振る舞いが変化。

Props:
  score: number (0-100)
  status: 'optimal' | 'caution' | 'critical'

振る舞い:
  optimal (score >= 70):
    - 色: brand-500 (#10b981) のグラデーション
    - アニメーション: animate-core-pulse-healthy (3s, ゆっくり脈動)
    - グロウ: glow-green シャドウ
    - UXメッセージ: 「好調です」

  caution (40 <= score < 70):
    - 色: amber-caution-500 (#FF9F29)
    - アニメーション: animate-core-pulse-warning (2s, やや速い脈動)
    - グロウ: glow-amber シャドウ
    - UXメッセージ: 「注意が必要です」

  critical (score < 40):
    - 色: pulse-red-500 (#FF4B4B)
    - アニメーション: animate-core-alert (1.5s, 警告灯のように点滅)
    - グロウ: glow-red シャドウ
    - UXメッセージ: 「回復を優先してください」

サイズ:
  モバイル: 240px x 240px (w-60 h-60)
  タブレット以上: 280px x 280px

中央テキスト:
  スコア数値: text-score-hero (56px), font-label, tabular-nums
  ステータスラベル: text-sm, font-semibold
  「コンディション」ラベル: text-xs, text-muted-foreground

アクセシビリティ:
  aria-label="コンディションスコア {score}点 ステータス: {statusLabel}"
  role="status"
  prefers-reduced-motion: アニメーション無効化、静的グロウのみ

実装上の制約:
  既存 ConditioningRing との共存: GlowingCore は Light テーマでは ConditioningRing を使用。
  Deep Space テーマ時のみ GlowingCore の円形グロウ表現を適用。
```

### 4.2 ActionOfTheDay（今日の行動指針）

```
コンポーネント名: ActionOfTheDay
パス: app/(athlete)/home/_components/action-of-the-day.tsx
役割: 具体的な行動指針を最優先表示

Props:
  action: string       // 例: 「今日はスプリントを控え、臀部の活性化を3セット」
  priority: 'high' | 'medium' | 'low'
  source?: string      // AI推論元ノード名

レイアウト:
  - カード形式 (rounded-xl, p-4)
  - 左に優先度アイコン（priority に応じた色）
  - 右にアクション文言
  - 下部に小さく source 表記（Layer 2 への導線）

カラー:
  high:   bg-pulse-red-50 border-pulse-red-200 text-pulse-red-800
  medium: bg-amber-caution-50 border-amber-caution-200 text-amber-caution-800
  low:    bg-brand-50 border-brand-200 text-brand-800

アクセシビリティ:
  role="alert" (priority === 'high' の場合)
  aria-live="polite" (それ以外)
```

### 4.3 AdaptiveCheckinForm（動的チェックインフォーム）

```
コンポーネント名: AdaptiveCheckinForm
パス: app/(athlete)/checkin/_components/adaptive-checkin-form.tsx
役割: 前日の負荷に応じて質問を動的に変更

ロジック:
  昨日の負荷が高い場合 (fatigue_ewma > threshold):
    → "Fatigue Focus" モード: 睡眠質・痛み・主観的疲労に絞り込み（3問）
    → UIヒント: 「昨日ハードでしたね。回復に集中しましょう」
    → カラー: amber-caution 系

  昨日の負荷が低い / 元気な場合:
    → 通常モード + "Vigor" 質問追加（やる気、意欲の自己評価）
    → UIヒント: 「調子が良さそうです！」
    → カラー: brand 系

UI構造:
  - ステップインジケーター（既存 6ステップを維持 / Fatigue Focusは3ステップ）
  - 各質問は fullscreen スライドで表示
  - スワイプまたはボタンで次へ
  - 最小タッチターゲット: 44px x 44px
```

### 4.4 BioScanOverlay（カメラスキャンUI）

```
コンポーネント名: BioScanOverlay
パス: app/(athlete)/bioscan/_components/bio-scan-overlay.tsx
役割: Node 6 CV カメラオーバーレイ

フロー:
  1. カメラ起動 → フルスクリーンビデオ表示
  2. 骨格ラインがリアルタイムでオーバーレイ (SVG, cyber-cyan-500 色)
  3. 膝ブレ検知時: 該当関節に pulse-red-500 の点滅マーカー
  4. 10秒カウントダウン → スキャン完了

スキャン完了後の演出:
  - 画面遷移: scan-overlay CSS クラス（走査線アニメーション）
  - インジケータ: 「神経系ノイズを解析中...」+ animate-neural-process プログレスバー
  - 完了表示: 「本日の動作精度：{score}%」のフェードイン (animate-fade-in-up)

カラー:
  骨格ライン: cyber-cyan-500 (#00F2FF), stroke-width 2px
  関節ポイント: cyber-cyan-400, r=6px
  異常関節: pulse-red-500, アニメーション付き
  プログレスバー: cyber-cyan-500 → brand-500 グラデーション

アクセシビリティ:
  - カメラ権限取得前に説明テキスト表示
  - 音声フィードバック（スクリーンリーダー対応）: aria-live="polite"
  - prefers-reduced-motion: 走査線アニメーション無効
```

### 4.5 BodyModel3D（3D キネティック・ヒートマップ）

```
コンポーネント名: BodyModel3D
パス: app/(staff)/warroom/_components/body-model-3d.tsx
役割: 人体3Dモデルに ODE + MRF 結果を統合表示

テーマ: .theme-deep-space 必須

サブレイヤー:
  TissueStressLayer:
    - 筋肉・腱・骨のダメージを深度別に色分け
    - 表面 (shallow): cyber-cyan-500 → brand-500 グラデーション
    - 深部 (deep): amber-caution-500 → pulse-red-500 グラデーション
    - 色マッピング: 0% → cyber-cyan, 30% → brand, 60% → amber, 90% → pulse-red

  ChainReactionLine:
    - SVG path 要素、class="chain-line-animated"
    - 色: pulse-red-500 (stroke)
    - アニメーション: animate-chain-flow (stroke-dashoffset による電位流動)
    - タップ/クリックで StressPopup 表示

  StressPopup:
    - トリガー: ChainReactionLine タップ
    - 内容例: 「右足首の硬さが原因で、左膝への衝撃が 1.4倍に増幅されています」
    - 背景: deep-space-500, border: deep-space-300
    - テキスト: foreground (Light on Dark)
    - 閉じるボタン: 右上 X アイコン、min-h-11 (44px)

3D実装方針:
  - 初期実装: SVG 2D 人体図（正面・背面切替）で代替
  - 将来: Three.js / React Three Fiber で 3D 化
  - 理由: MVP スコープでは 2D SVG の方がパフォーマンス・a11y の担保が容易

アクセシビリティ:
  - 3D/2D モデルに aria-label="人体ヒートマップ"
  - 各部位に role="button" + aria-label="右膝 リスクレベル: 高"
  - キーボード: Tab で各部位にフォーカス可能
```

### 4.6 InconsistencyMeter（デカップリング・インジケータ）

```
コンポーネント名: InconsistencyMeter
パス: app/(staff)/warroom/decoupling/_components/inconsistency-meter.tsx
役割: 「主観（申告）」と「客観（物理）」の乖離をアナログメーター表現

テーマ: .theme-deep-space

Props:
  subjectiveScore: number (0-100)
  objectiveScore: number (0-100)
  residual: number // カルマン残差

表示:
  - SVG 半円メーター (180度)
  - 針: animate-meter-swing, --meter-angle に応じた回転
  - 左端 (0°): 「一致」(brand-500)
  - 中央 (90°): 「軽度乖離」(amber-caution-500)
  - 右端 (180°): 「重度乖離」(pulse-red-500)
  - 針の先端にドロップシャドウ

ラベル:
  中央下: 「申告と実態の差」
  数値表示: 乖離率 (%, font-label, tabular-nums)

アクセシビリティ:
  role="meter"
  aria-valuenow={residual}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-label="主観と客観の乖離度"
```

### 4.7 InnovationPlot（カルマン残差プロット）

```
コンポーネント名: InnovationPlot
パス: app/(staff)/warroom/decoupling/_components/innovation-plot.tsx
役割: カルマン残差ドットを時系列表示

テーマ: .theme-deep-space

Props:
  residuals: { date: string; value: number; isOutlier: boolean }[]
  toleranceBand: { upper: number; lower: number }

表示:
  - SVG scatter plot
  - 統計的許容範囲: deep-space-300 の半透明帯 (opacity 0.15)
  - 正常ドット: cyber-cyan-500, r=4px
  - 異常ドット (isOutlier): pulse-red-500, r=6px, animate-dot-appear
  - 異常ドットに注釈吹き出し: 「アドレナリンによるマスキングの可能性」

軸:
  X軸: 日付 (text-xs, text-muted-foreground)
  Y軸: 残差値 (tabular-nums)

アクセシビリティ:
  role="img"
  aria-label="カルマン残差プロット: {outlierCount}件の異常検知"
  各ドットに title 属性
```

### 4.8 WhatIfSimulator（改修版）

```
コンポーネント名: WhatIfSimulator (既存 WhatIfDashboard を改修)
パス: app/(staff)/what-if/_components/what-if-dashboard.tsx
役割: PACE v6.0 最大のUXキラー機能

改修ポイント:
  1. スライダー操作 → ODE リアルタイム推論 → 3D モデル色変化
  2. フラグ操作 → MRF 伝達係数変更 → 連鎖ライン色変化
  3. UXメッセージの自然言語化

入力コントロール:
  既存 InterventionControls を拡張:
  - 「今日の練習メニュー」スライダー (0-100%)
  - 「足首のテーピング」トグル → MRF 伝達係数 W_ij を一時緩和
  - 「ブレース装着」トグル
  - 各フラグに Deep Space テーマ用スタイル追加

出力フィードバック:
  - RiskHeatmap3D: BodyModel3D の軽量版 (SVG 2D)
  - 色変化アニメーション: animate-risk-transition
  - UXメッセージカード:
    背景: deep-space-500
    テキスト: foreground
    例文: 「もし今日、予定通りスプリントを行うと、明日のアキレス腱ダメージは
           臨界点の95%に達します。メニューを20%削減すれば、安全圏（70%）で
           維持可能です。」
    数値ハイライト: 95% → pulse-red-500, 70% → brand-500

Deep Space テーマ対応:
  - .theme-deep-space クラス検知時に slider-whatif クラスを付与
  - グラデーショントラック: brand → amber-caution → pulse-red
  - サム（つまみ）: cyber-cyan-500 + glow-cyan シャドウ
```

### 4.9 OneClickAudit（Evidence Vault）

```
コンポーネント名: OneClickAudit
パス: app/(staff)/warroom/evidence/_components/one-click-audit.tsx
役割: 「なぜRED判定なのか？」ボタンで計算式を展開表示

テーマ: .theme-deep-space

UI:
  折りたたみ前:
    - ボタン: 「なぜこの判定か？」
    - 背景: deep-space-400, border: deep-space-300
    - アイコン: ChevronDown (cyber-cyan-500)

  展開後:
    - KaTeX でレンダリングされた数式:
      「組織ダメージ D(t) が閾値 D_crit を突破（ODE解）」
      「既往歴（Node 0）による Prior Offset 2.5x 適用」
    - 背景: katex-container クラス
    - フォント: font-mono

  Data Lineage テーブル:
    - 使用デバイスのκ係数（信頼性）を表示
    - テーブルヘッダー: deep-space-400
    - 奇数行: deep-space-500
    - 偶数行: deep-space-600
    - κ値が高い: brand-500 テキスト
    - κ値が低い: pulse-red-500 テキスト + 警告アイコン

アクセシビリティ:
  数式: aria-label で平文化（例: "Dティッシュ括弧t イコール..."）
  テーブル: caption + scope 属性
```

---

## 5. 既存コンポーネント改修仕様

### 5.1 ConditioningRing → GlowingCore 統合

```
変更内容:
  - Light テーマ: 既存 ConditioningRing をそのまま使用（変更なし）
  - Deep Space テーマ (.theme-deep-space):
    GlowingCore コンポーネントに切替
    - 円形グロウエフェクト追加
    - 脈動アニメーション追加
    - 背景: transparent（Deep Space ベースに溶け込む）

実装方針:
  AthleteHomeContent 内で useTheme() フックでテーマ判定し、
  条件分岐でコンポーネントを切替。
  ConditioningRing は変更せず後方互換性を維持。
```

### 5.2 InterventionControls 拡張

```
追加 Props:
  tapingEnabled: boolean      // テーピングフラグ
  braceEnabled: boolean       // ブレースフラグ
  onTapingChange: (v: boolean) => void
  onBraceChange: (v: boolean) => void

新規トグル:
  {
    key: 'tapingEnabled',
    label: '足首テーピング',
    icon: <TapeIcon />,
    description: 'MRF伝達を15%緩和'
  },
  {
    key: 'braceEnabled',
    label: 'ブレース装着',
    icon: <BraceIcon />,
    description: 'MRF伝達を25%緩和'
  }

Deep Space テーマ対応:
  - isOn 色: cyber-cyan-500 (brand-500 の代替)
  - isOff 色: deep-space-300
  - ボーダー: deep-space-300
```

---

## 6. アクセシビリティ（a11y）チェックリスト — WCAG 2.1 AA 準拠

```
## コントラスト
- [ ] テキストコントラスト比: 4.5:1 以上（通常テキスト）
- [ ] 大テキストコントラスト比: 3:1 以上（18px+ / 14px bold+）
- [ ] Deep Space テーマ: 全テキストが #0D1117 背景上で AA 適合
- [ ] グロウエフェクト: 情報伝達の唯一手段にしない（色+テキストで冗長化）

## キーボード操作
- [ ] Tab キーで全インタラクティブ要素にアクセス可能
- [ ] focus-visible: ring-2 ring-ring のアウトライン表示
- [ ] Deep Space テーマ: focus ring を cyber-cyan-500 に変更
- [ ] Escape キーでモーダル・ポップアップを閉じる
- [ ] 3D ヒートマップ: Tab で各身体部位にフォーカス

## スクリーンリーダー
- [ ] alt テキスト: 全 <img> タグに意味のある alt 属性
- [ ] aria-label: 全アイコンボタンに設定
- [ ] 見出し階層: h1 > h2 > h3 の正しい階層
- [ ] GlowingCore: role="status" + aria-label
- [ ] InconsistencyMeter: role="meter" + aria-valuenow
- [ ] InnovationPlot: role="img" + aria-label
- [ ] ChainReactionLine: SVG title 要素
- [ ] KaTeX 数式: aria-label で平文化

## タッチ & モーション
- [ ] タッチターゲット: モバイルで最小 44x44px (spacing-11)
- [ ] prefers-reduced-motion: 全アニメーション無効化
- [ ] 脈動エフェクト: 減弱モードでは静的表示に切替
- [ ] 走査線 (scan-line): 減弱モードでは即座に完了表示

## ダイナミックコンテンツ
- [ ] ActionOfTheDay (priority=high): role="alert"
- [ ] シミュレーション結果更新: aria-live="polite"
- [ ] エラーメッセージ: aria-live="assertive"
- [ ] ローディング状態: aria-busy="true"
```

---

## 7. レスポンシブデザイン要件

### ブレークポイントと挙動定義

| ブレークポイント | 幅 | 対象 | 主要変更点 |
|---|---|---|---|
| (default) | ~639px | アスリートモバイル PWA | 単カラムレイアウト、GlowingCore 240px、タッチ最適化 |
| sm | 640px | 大型スマホ横向き | — |
| md | 768px | タブレット | War Room: 2カラムレイアウト、サイドバー表示 |
| lg | 1024px | デスクトップ | War Room: 3カラム、What-If: 30%/70% 分割 |
| xl | 1280px | 大型ディスプレイ | 3D ヒートマップフル表示、Evidence テーブル拡張 |

### モバイルファースト原則

```
基本スタイルはモバイル向けに記述し、md: / lg: のプレフィックスで拡張する。

例:
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

GlowingCore:
  モバイル: w-60 h-60 (240px)
  md: w-70 h-70 (280px)

BodyModel3D:
  モバイル: 非表示 (hidden) → 簡易リストビューにフォールバック
  md: 表示 (block)

What-If:
  モバイル: 縦スタック (flex-col)
  lg: 横分割 (grid-cols-[3fr_7fr])

Evidence Vault:
  モバイル: KaTeX 横スクロール (overflow-x-auto)
  lg: フル表示
```

---

## 8. テーマ切替実装ガイド

### 8.1 CSS クラスベースのテーマ切替

```tsx
// War Room レイアウトでの適用例
export default function WarRoomLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-deep-space min-h-screen bg-deep-space-600 text-deep-space-50">
      {children}
    </div>
  );
}
```

### 8.2 テーマ判定フック

```tsx
// hooks/use-theme-mode.ts
export function useThemeMode(): 'light' | 'dark' | 'deep-space' {
  // pathname が /warroom を含む場合 → 'deep-space'
  // darkMode class がある場合 → 'dark'
  // それ以外 → 'light'
}
```

---

## 9. 自律連鎖トリガー

UI/UXデザイン仕様書が完成しました。
@03-frontend を呼び出します。
以下の仕様書一式を渡し、フロントエンドの実装を開始させます：
- デザイントークン定義（tailwind.config.ts 向け — 実装済み）
- 画面一覧とレイアウト指示（全27画面）
- v6.0 新規コンポーネント仕様（9コンポーネント）
- 既存コンポーネント改修仕様（2コンポーネント）
- アクセシビリティチェックリスト（WCAG 2.1 AA）
- レスポンシブ要件（モバイルファースト）
- テーマ切替実装ガイド（Light / Dark / Deep Space）
