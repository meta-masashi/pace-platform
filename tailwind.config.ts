import type { Config } from "tailwindcss";

// ─── PACE Platform v6.0 デザイントークン ──────────────────────────────────
// フィロソフィー: "Complexity to Clarity"
// Strava-inspired Orange Accent + Deep Space ダークテーマ統合
// Brand: Strava Orange #FC4C02 / Dark: Charcoal #242428
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
        // ブランドカラー: Strava Orange (#FC4C02)
        brand: {
          50:  "#FFF7F0",
          100: "#FFEAD9",
          200: "#FFD2B0",
          300: "#FFB380",
          400: "#FF8840",
          500: "#FC4C02",  // Strava primary
          600: "#CC4200",  // Strava Grenadier
          700: "#A33500",
          800: "#7A2800",
          900: "#521B00",
          950: "#2E0F00",
        },

        // v6.0: Deep Space ベースカラー (Strava Charcoal-aligned)
        "deep-space": {
          50:  "#EAEAEB",
          100: "#CDCDCF",
          200: "#9A9A9E",
          300: "#6B6B71",
          400: "#42424A",
          500: "#242428",  // Strava charcoal
          600: "#1A1A1E",
          700: "#121215",
          800: "#0A0A0C",
          900: "#050506",
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

        // v6.0: Amber Caution — デカップリング (Strava-warm amber)
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

        // v6.0: Strava Teal — Safe/Bio-Active (replaces Cyber Cyan)
        "strava-teal": {
          50:  "#EDFCF9",
          100: "#D2F7F0",
          200: "#A8EFE2",
          300: "#72E3CF",
          400: "#3ED1B8",
          500: "#1DB597",
          600: "#139179",
          700: "#0F735F",
          800: "#0B584A",
          900: "#074035",
        },

        // セマンティックカラー（WCAG AA 4.5:1 準拠確認済み）
        semantic: {
          critical:          "#dc2626",
          "critical-bg":     "#fef2f2",
          "critical-text":   "#991b1b",
          "critical-border": "#fca5a5",
          watchlist:          "#FC4C02",
          "watchlist-bg":     "#FFF7F0",
          "watchlist-text":   "#7A2800",
          "watchlist-border": "#FFB380",
          normal:          "#1DB597",
          "normal-bg":     "#EDFCF9",
          "normal-text":   "#074035",
          "normal-border": "#72E3CF",
          zone:          "#2563eb",
          "zone-bg":     "#eff6ff",
          "zone-text":   "#1e3a8a",
          "zone-border": "#93c5fd",
          success: "#1DB597",
          warning: "#FC4C02",
          error:   "#dc2626",
          info:    "#2563eb",
        },
        // サーフェスカラー (Strava-aligned)
        surface: {
          base:    "#f8f8f8",
          card:    "#ffffff",
          sidebar: "#1A1A1E",
        },
        // 旧互換
        critical: "#dc2626",
        watchlist: "#FC4C02",
        normal: "#1DB597",
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
        "glow-brand":  "0 0 20px rgba(252, 76, 2, 0.3), 0 0 60px rgba(252, 76, 2, 0.1)",
        "glow-green":  "0 0 20px rgba(29, 181, 151, 0.3), 0 0 60px rgba(29, 181, 151, 0.1)",
        "glow-red":    "0 0 20px rgba(255, 75, 75, 0.3), 0 0 60px rgba(255, 75, 75, 0.1)",
        "glow-amber":  "0 0 20px rgba(252, 76, 2, 0.25), 0 0 60px rgba(252, 76, 2, 0.08)",
        "glow-cyan":   "0 0 20px rgba(29, 181, 151, 0.3), 0 0 60px rgba(29, 181, 151, 0.1)",
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
            boxShadow: "0 0 20px rgba(252, 76, 2, 0.2), 0 0 60px rgba(252, 76, 2, 0.05)",
            transform: "scale(1)",
          },
          "50%": {
            boxShadow: "0 0 40px rgba(252, 76, 2, 0.4), 0 0 100px rgba(252, 76, 2, 0.15)",
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
