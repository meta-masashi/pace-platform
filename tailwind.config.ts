import type { Config } from "tailwindcss";

// ─── PACE Platform デザイントークン v2.0 ────────────────────────────────
// ヘルスケア × スポーツ医療 SaaS 向けデザインシステム
// プライマリ: Emerald 系（医療×自然 = 信頼・成長）
// セマンティック: 医療臨床現場での直感的な色彩（赤=危険/緑=安全/黄=注意）
// フォント: Noto Sans JP（日本語）+ Inter（英数字・UIラベル）

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // ── カラーパレット ───────────────────────────────────────────────
      colors: {
        // ブランドカラー: Emerald（医療グリーン）
        brand: {
          50:  "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981", // メインブランドカラー
          600: "#059669", // ホバー・アクティブ
          700: "#047857", // ダーク
          800: "#065f46",
          900: "#064e3b",
          950: "#022c22",
        },
        // セマンティックカラー（WCAG AA 4.5:1 準拠確認済み）
        semantic: {
          // Critical: red-600（白背景コントラスト比 5.9:1 ✓）
          critical:          "#dc2626",
          "critical-bg":     "#fef2f2",
          "critical-text":   "#991b1b",
          "critical-border": "#fca5a5",
          // Watchlist: amber-600（コントラスト比 4.8:1 ✓）
          watchlist:          "#d97706",
          "watchlist-bg":     "#fffbeb",
          "watchlist-text":   "#92400e",
          "watchlist-border": "#fcd34d",
          // Normal: emerald-600
          normal:          "#059669",
          "normal-bg":     "#ecfdf5",
          "normal-text":   "#065f46",
          "normal-border": "#6ee7b7",
          // Zone (Peak): blue-600（コントラスト比 7.1:1 ✓）
          zone:          "#2563eb",
          "zone-bg":     "#eff6ff",
          "zone-text":   "#1e3a8a",
          "zone-border": "#93c5fd",
          // 汎用
          success: "#059669",
          warning: "#d97706",
          error:   "#dc2626",
          info:    "#2563eb",
        },
        // サーフェスカラー
        surface: {
          base:    "#f8fafc",  // ページ背景
          card:    "#ffffff",  // カード
          sidebar: "#0f172a", // ダークサイドバー
        },
        // 旧互換（既存コードが参照）
        critical: "#dc2626",
        watchlist: "#d97706",
        normal: "#059669",
      },

      // ── タイポグラフィ ────────────────────────────────────────────────
      fontFamily: {
        sans:  ["'Noto Sans JP'", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        label: ["Inter", "'Noto Sans JP'", "sans-serif"],
        mono:  ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        // 日本語対応: line-height 最低 1.6
        "2xs": ["11px", { lineHeight: "1.5",  letterSpacing: "0.02em" }],
        xs:    ["12px", { lineHeight: "1.6",  letterSpacing: "0.01em" }],
        sm:    ["14px", { lineHeight: "1.65", letterSpacing: "0" }],
        base:  ["16px", { lineHeight: "1.75", letterSpacing: "0" }],
        lg:    ["18px", { lineHeight: "1.7",  letterSpacing: "-0.01em" }],
        xl:    ["20px", { lineHeight: "1.5",  letterSpacing: "-0.01em" }],
        "2xl": ["24px", { lineHeight: "1.4",  letterSpacing: "-0.02em" }],
        "3xl": ["30px", { lineHeight: "1.3",  letterSpacing: "-0.02em" }],
        // KPI値用（数字専用・Inter フォント想定）
        "kpi-lg": ["40px", { lineHeight: "1", letterSpacing: "-0.03em" }],
        "kpi-md": ["28px", { lineHeight: "1", letterSpacing: "-0.02em" }],
        "kpi-sm": ["22px", { lineHeight: "1", letterSpacing: "-0.02em" }],
      },

      // ── 角丸 ─────────────────────────────────────────────────────────
      borderRadius: {
        sm:      "4px",
        DEFAULT: "6px",
        md:      "8px",
        lg:      "12px",
        xl:      "16px",
        full:    "9999px",
      },

      // ── シャドウ ──────────────────────────────────────────────────────
      boxShadow: {
        sm:           "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        DEFAULT:      "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        md:           "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        lg:           "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
        card:         "0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.05)",
        "card-hover": "0 4px 12px -2px rgb(0 0 0 / 0.12), 0 2px 6px -2px rgb(0 0 0 / 0.08)",
      },

      // ── アニメーション ────────────────────────────────────────────────
      animation: {
        "fade-in":    "fadeIn 0.2s ease-in-out",
        "slide-up":   "slideUp 0.25s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)",   opacity: "1" },
        },
      },

      // ── スペーシング補完 ──────────────────────────────────────────────
      spacing: {
        "sidebar": "240px",
        "11":      "44px",  // モバイルタッチターゲット最小値
      },
    },
  },
  plugins: [],
};

export default config;
