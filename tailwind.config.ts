import type { Config } from "tailwindcss";

// ─── PACE Platform v6.0 デザイントークン ──────────────────────────────────
// フィロソフィー: "Complexity to Clarity"
// 既存 Emerald ブランド + v6.0 Deep Space カラーシステム統合
// ──────────────────────────────────────────────────────────────────────────

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
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
          950: "#022c22",
        },

        // v6.0: Deep Space ベースカラー
        "deep-space": {
          50:  "#E6E8EB",
          100: "#C0C5CC",
          200: "#8B95A3",
          300: "#56647A",
          400: "#2D3B51",
          500: "#161B22",
          600: "#0D1117",
          700: "#090D12",
          800: "#06080C",
          900: "#030406",
        },

        // v6.0: Pulse Red — 高リスク
        "pulse-red": {
          50:  "#FFF0F0",
          100: "#FFD6D6",
          200: "#FFB3B3",
          300: "#FF8A8A",
          400: "#FF6B6B",
          500: "#FF4B4B",
          600: "#E63E3E",
          700: "#CC3232",
          800: "#B32626",
          900: "#991A1A",
        },

        // v6.0: Amber Caution — デカップリング
        "amber-caution": {
          50:  "#FFF8EB",
          100: "#FFECC7",
          200: "#FFDB94",
          300: "#FFC95C",
          400: "#FFB440",
          500: "#FF9F29",
          600: "#E68C1F",
          700: "#CC7A16",
          800: "#B3680D",
          900: "#995604",
        },

        // v6.0: Cyber Cyan — Bio-Active
        "cyber-cyan": {
          50:  "#E6FEFF",
          100: "#B3FBFF",
          200: "#80F8FF",
          300: "#4DF5FF",
          400: "#26F3FF",
          500: "#00F2FF",
          600: "#00D4E0",
          700: "#00B6C2",
          800: "#0098A3",
          900: "#007A85",
        },

        // セマンティックカラー（WCAG AA 4.5:1 準拠確認済み）
        semantic: {
          critical:          "#dc2626",
          "critical-bg":     "#fef2f2",
          "critical-text":   "#991b1b",
          "critical-border": "#fca5a5",
          watchlist:          "#d97706",
          "watchlist-bg":     "#fffbeb",
          "watchlist-text":   "#92400e",
          "watchlist-border": "#fcd34d",
          normal:          "#059669",
          "normal-bg":     "#ecfdf5",
          "normal-text":   "#065f46",
          "normal-border": "#6ee7b7",
          zone:          "#2563eb",
          "zone-bg":     "#eff6ff",
          "zone-text":   "#1e3a8a",
          "zone-border": "#93c5fd",
          success: "#059669",
          warning: "#d97706",
          error:   "#dc2626",
          info:    "#2563eb",
        },
        // サーフェスカラー
        surface: {
          base:    "#f8fafc",
          card:    "#ffffff",
          sidebar: "#0f172a",
        },
        // 旧互換
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
        "2xs": ["11px", { lineHeight: "1.5",  letterSpacing: "0.02em" }],
        xs:    ["12px", { lineHeight: "1.6",  letterSpacing: "0.01em" }],
        sm:    ["14px", { lineHeight: "1.65", letterSpacing: "0" }],
        base:  ["16px", { lineHeight: "1.75", letterSpacing: "0" }],
        lg:    ["18px", { lineHeight: "1.7",  letterSpacing: "-0.01em" }],
        xl:    ["20px", { lineHeight: "1.5",  letterSpacing: "-0.01em" }],
        "2xl": ["24px", { lineHeight: "1.4",  letterSpacing: "-0.02em" }],
        "3xl": ["30px", { lineHeight: "1.3",  letterSpacing: "-0.02em" }],
        "kpi-lg": ["40px", { lineHeight: "1", letterSpacing: "-0.03em" }],
        "kpi-md": ["28px", { lineHeight: "1", letterSpacing: "-0.02em" }],
        "kpi-sm": ["22px", { lineHeight: "1", letterSpacing: "-0.02em" }],
        "score-hero": ["56px", { lineHeight: "1", letterSpacing: "-0.04em" }],
      },

      // ── 角丸 ─────────────────────────────────────────────────────────
      borderRadius: {
        sm:      "4px",
        DEFAULT: "6px",
        md:      "8px",
        lg:      "12px",
        xl:      "16px",
        "2xl":   "20px",
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
        "glow-green":  "0 0 20px rgba(16, 185, 129, 0.3), 0 0 60px rgba(16, 185, 129, 0.1)",
        "glow-red":    "0 0 20px rgba(255, 75, 75, 0.3), 0 0 60px rgba(255, 75, 75, 0.1)",
        "glow-amber":  "0 0 20px rgba(255, 159, 41, 0.3), 0 0 60px rgba(255, 159, 41, 0.1)",
        "glow-cyan":   "0 0 20px rgba(0, 242, 255, 0.3), 0 0 60px rgba(0, 242, 255, 0.1)",
      },

      // ── アニメーション ────────────────────────────────────────────────
      animation: {
        "fade-in":    "fadeIn 0.2s ease-in-out",
        "slide-up":   "slideUp 0.25s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "core-pulse-healthy": "corePulseHealthy 3s ease-in-out infinite",
        "core-alert": "coreAlert 1.5s ease-in-out infinite",
        "chain-flow": "chainFlow 2s linear infinite",
        "scan-line":  "scanLine 2.5s ease-in-out",
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
        corePulseHealthy: {
          "0%, 100%": {
            boxShadow: "0 0 20px rgba(16, 185, 129, 0.2), 0 0 60px rgba(16, 185, 129, 0.05)",
            transform: "scale(1)",
          },
          "50%": {
            boxShadow: "0 0 40px rgba(16, 185, 129, 0.4), 0 0 100px rgba(16, 185, 129, 0.15)",
            transform: "scale(1.02)",
          },
        },
        coreAlert: {
          "0%, 100%": {
            boxShadow: "0 0 30px rgba(255, 75, 75, 0.3), 0 0 80px rgba(255, 75, 75, 0.1)",
            opacity: "1",
          },
          "50%": {
            boxShadow: "0 0 50px rgba(255, 75, 75, 0.6), 0 0 120px rgba(255, 75, 75, 0.25)",
            opacity: "0.9",
          },
        },
        chainFlow: {
          "0%": { strokeDashoffset: "100%", opacity: "0.3" },
          "50%": { opacity: "1" },
          "100%": { strokeDashoffset: "0%", opacity: "0.3" },
        },
        scanLine: {
          "0%": { top: "0%", opacity: "0" },
          "10%": { opacity: "1" },
          "90%": { opacity: "1" },
          "100%": { top: "100%", opacity: "0" },
        },
      },

      // ── スペーシング補完 ──────────────────────────────────────────────
      spacing: {
        "sidebar": "240px",
        "11":      "44px",
      },
    },
  },
  plugins: [],
};

export default config;
