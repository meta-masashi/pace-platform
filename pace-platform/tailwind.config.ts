import type { Config } from 'tailwindcss';

// ─── PACE Platform v6.0 デザイントークン ──────────────────────────────────
// フィロソフィー: "Complexity to Clarity"
// Math-Invisible Design: 専門用語は直感的な言葉に変換
// 3-Layer Information Architecture: Status → Narrative → Evidence
//
// カラーシステム:
//   Base: Deep Space (#0D1117) — 集中・プロフェッショナル・高コントラスト
//   Risk: Pulse Red (#FF4B4B) — 緊急・停止
//   Caution: Amber Caution (#FF9F29) — 矛盾・注意・デカップリング
//   Active: Cyber Cyan (#00F2FF) — 神経系・未来・インテリジェンス
//   Brand: Emerald (#10b981) — 信頼・成長（既存ブランド維持）
// ──────────────────────────────────────────────────────────────────────────

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // ── カラーパレット ───────────────────────────────────────────────────
      colors: {
        // === PACE v6.0 "Deep Space" カラーシステム ===

        // Deep Space ベースカラー（Bio-War Room / Evidence Vault 用）
        'deep-space': {
          50:  '#E6E8EB',
          100: '#C0C5CC',
          200: '#8B95A3',
          300: '#56647A',
          400: '#2D3B51',
          500: '#161B22',  // カードサーフェス
          600: '#0D1117',  // ベース背景
          700: '#090D12',
          800: '#06080C',
          900: '#030406',
        },

        // Pulse Red — 高リスク・緊急停止（コントラスト比 #FF4B4B on #0D1117 = 5.2:1 ✓）
        'pulse-red': {
          50:  '#FFF0F0',
          100: '#FFD6D6',
          200: '#FFB3B3',
          300: '#FF8A8A',
          400: '#FF6B6B',
          500: '#FF4B4B',  // メイン
          600: '#E63E3E',
          700: '#CC3232',
          800: '#B32626',
          900: '#991A1A',
        },

        // Amber Caution — デカップリング・主観客観乖離
        // コントラスト比 #FF9F29 on #0D1117 = 6.8:1 ✓
        'amber-caution': {
          50:  '#FFF8EB',
          100: '#FFECC7',
          200: '#FFDB94',
          300: '#FFC95C',
          400: '#FFB440',
          500: '#FF9F29',  // メイン
          600: '#E68C1F',
          700: '#CC7A16',
          800: '#B3680D',
          900: '#995604',
        },

        // Cyber Cyan — Bio-Active・神経系インテリジェンス
        // コントラスト比 #00F2FF on #0D1117 = 10.1:1 ✓
        'cyber-cyan': {
          50:  '#E6FEFF',
          100: '#B3FBFF',
          200: '#80F8FF',
          300: '#4DF5FF',
          400: '#26F3FF',
          500: '#00F2FF',  // メイン
          600: '#00D4E0',
          700: '#00B6C2',
          800: '#0098A3',
          900: '#007A85',
        },

        // === 既存ブランドカラー（後方互換性維持） ===
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },

        // Status: Critical (red) — 既存互換
        critical: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },

        // Status: Watchlist (amber) — 既存互換
        watchlist: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },

        // Status: Optimal Conditioning (teal) — 既存互換
        optimal: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },

        // === shadcn/ui セマンティックトークン ===
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },

      // ── タイポグラフィ ────────────────────────────────────────────────────
      fontFamily: {
        sans: [
          '"Noto Sans JP"',
          'Inter',
          '"Hiragino Sans"',
          '"Hiragino Kaku Gothic ProN"',
          'Meiryo',
          'sans-serif',
        ],
        label: ['Inter', '"Noto Sans JP"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // 日本語対応: line-height 最低 1.6
        '2xs': ['11px', { lineHeight: '1.5', letterSpacing: '0.02em' }],
        xs:    ['12px', { lineHeight: '1.6', letterSpacing: '0.01em' }],
        sm:    ['14px', { lineHeight: '1.65', letterSpacing: '0' }],
        base:  ['16px', { lineHeight: '1.75', letterSpacing: '0' }],
        lg:    ['18px', { lineHeight: '1.7', letterSpacing: '-0.01em' }],
        xl:    ['20px', { lineHeight: '1.5', letterSpacing: '-0.01em' }],
        '2xl': ['24px', { lineHeight: '1.4', letterSpacing: '-0.02em' }],
        '3xl': ['30px', { lineHeight: '1.3', letterSpacing: '-0.02em' }],
        '4xl': ['36px', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        // KPI値用（数字専用・Inter フォント想定）
        'kpi-lg': ['40px', { lineHeight: '1', letterSpacing: '-0.03em' }],
        'kpi-md': ['28px', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'kpi-sm': ['22px', { lineHeight: '1', letterSpacing: '-0.02em' }],
        // Glowing Core 中央スコア用
        'score-hero': ['56px', { lineHeight: '1', letterSpacing: '-0.04em' }],
      },

      // ── 角丸 ─────────────────────────────────────────────────────────────
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: '16px',
        '2xl': '20px',
        full: '9999px',
      },

      // ── シャドウ ──────────────────────────────────────────────────────────
      boxShadow: {
        sm:           '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        DEFAULT:      '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        md:           '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        lg:           '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        card:         '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.05)',
        'card-hover': '0 4px 12px -2px rgb(0 0 0 / 0.12), 0 2px 6px -2px rgb(0 0 0 / 0.08)',
        // v6.0: Deep Space テーマ用グロウシャドウ
        'glow-green':  '0 0 20px rgba(16, 185, 129, 0.3), 0 0 60px rgba(16, 185, 129, 0.1)',
        'glow-red':    '0 0 20px rgba(255, 75, 75, 0.3), 0 0 60px rgba(255, 75, 75, 0.1)',
        'glow-amber':  '0 0 20px rgba(255, 159, 41, 0.3), 0 0 60px rgba(255, 159, 41, 0.1)',
        'glow-cyan':   '0 0 20px rgba(0, 242, 255, 0.3), 0 0 60px rgba(0, 242, 255, 0.1)',
      },

      // ── スペーシング ──────────────────────────────────────────────────────
      spacing: {
        sidebar: '240px',
        '11': '44px',  // モバイルタッチターゲット最小値（WCAG 2.1）
      },

      // ── キーフレーム ──────────────────────────────────────────────────────
      keyframes: {
        // 既存アニメーション
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'ring-fill': {
          from: { strokeDashoffset: 'var(--ring-circumference)' },
          to: { strokeDashoffset: 'var(--ring-target-offset)' },
        },
        'score-count': {
          from: { opacity: '0', transform: 'scale(0.8)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'gauge-needle': {
          from: { transform: 'rotate(-90deg)' },
          to: { transform: 'rotate(var(--gauge-rotation))' },
        },

        // === v6.0 新規アニメーション ===

        // Glowing Core: ステータスに応じた脈動（Status Circle 用）
        'core-pulse-healthy': {
          '0%, 100%': {
            boxShadow: '0 0 20px rgba(16, 185, 129, 0.2), 0 0 60px rgba(16, 185, 129, 0.05)',
            transform: 'scale(1)',
          },
          '50%': {
            boxShadow: '0 0 40px rgba(16, 185, 129, 0.4), 0 0 100px rgba(16, 185, 129, 0.15)',
            transform: 'scale(1.02)',
          },
        },
        'core-pulse-warning': {
          '0%, 100%': {
            boxShadow: '0 0 20px rgba(255, 159, 41, 0.2), 0 0 60px rgba(255, 159, 41, 0.05)',
            transform: 'scale(1)',
          },
          '50%': {
            boxShadow: '0 0 40px rgba(255, 159, 41, 0.4), 0 0 100px rgba(255, 159, 41, 0.15)',
            transform: 'scale(1.015)',
          },
        },
        // 警告灯: 重厚な赤の点滅（Critical 用）
        'core-alert': {
          '0%, 100%': {
            boxShadow: '0 0 30px rgba(255, 75, 75, 0.3), 0 0 80px rgba(255, 75, 75, 0.1)',
            opacity: '1',
          },
          '50%': {
            boxShadow: '0 0 50px rgba(255, 75, 75, 0.6), 0 0 120px rgba(255, 75, 75, 0.25)',
            opacity: '0.9',
          },
        },

        // Chain Reaction Line: 電位が流れるアニメーション（3D ヒートマップ用）
        'chain-flow': {
          '0%': { strokeDashoffset: '100%', opacity: '0.3' },
          '50%': { opacity: '1' },
          '100%': { strokeDashoffset: '0%', opacity: '0.3' },
        },

        // Bio-Scan: 走査線アニメーション（CV カメラオーバーレイ用）
        'scan-line': {
          '0%': { top: '0%', opacity: '0' },
          '10%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { top: '100%', opacity: '0' },
        },

        // 神経系解析インジケータ
        'neural-process': {
          '0%': { width: '0%' },
          '60%': { width: '85%' },
          '100%': { width: '100%' },
        },

        // デカップリングメーター（アナログメーター振れ）
        'meter-swing': {
          '0%': { transform: 'rotate(-45deg)' },
          '100%': { transform: 'rotate(var(--meter-angle))' },
        },

        // イノベーションプロット: ドット出現
        'dot-appear': {
          '0%': { opacity: '0', transform: 'scale(0)' },
          '60%': { transform: 'scale(1.2)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },

        // What-If シミュレーター: リスク色変化
        'risk-transition': {
          '0%': { filter: 'hue-rotate(0deg)' },
          '100%': { filter: 'hue-rotate(var(--risk-hue-shift))' },
        },

        // スケルトンローダー（Deep Space テーマ用）
        'skeleton-dark': {
          '0%, 100%': { backgroundColor: 'rgba(139, 149, 163, 0.1)' },
          '50%': { backgroundColor: 'rgba(139, 149, 163, 0.2)' },
        },
      },

      // ── アニメーション ────────────────────────────────────────────────────
      animation: {
        // 既存
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'ring-fill': 'ring-fill 1.2s ease-out forwards',
        'score-count': 'score-count 0.6s ease-out 0.4s forwards',
        'fade-in-up': 'fade-in-up 0.5s ease-out forwards',
        'gauge-needle': 'gauge-needle 1s ease-out 0.3s forwards',

        // v6.0 新規
        'core-pulse-healthy': 'core-pulse-healthy 3s ease-in-out infinite',
        'core-pulse-warning': 'core-pulse-warning 2s ease-in-out infinite',
        'core-alert': 'core-alert 1.5s ease-in-out infinite',
        'chain-flow': 'chain-flow 2s linear infinite',
        'scan-line': 'scan-line 2.5s ease-in-out',
        'neural-process': 'neural-process 3s ease-out forwards',
        'meter-swing': 'meter-swing 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'dot-appear': 'dot-appear 0.4s ease-out forwards',
        'risk-transition': 'risk-transition 0.8s ease-in-out forwards',
        'skeleton-dark': 'skeleton-dark 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
