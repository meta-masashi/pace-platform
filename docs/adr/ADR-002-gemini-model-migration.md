# ADR-002: Gemini モデル gemini-1.5-flash → gemini-2.0-flash 移行

**ステータス:** 承認済み
**日付:** 2026-03-22
**決定者:** 03-frontend エージェント

---

## 決定

`gemini-1.5-flash` は v1beta API で提供終了のため、全 API ルートのモデルを `gemini-2.0-flash` に更新する。

---

## 状況

`/api/ai/soap-assist`、`/api/ai/rehab-menu`、`/api/team-workout` の 3 ルートで `gemini-1.5-flash` を使用していたが、
Gemini API v1beta において該当モデルが提供終了（404 エラー）となった。

---

## 変更内容

| ファイル | 変更前 | 変更後 |
|---------|-------|-------|
| `src/app/api/ai/soap-assist/route.ts` | `gemini-1.5-flash` | `gemini-2.0-flash` |
| `src/app/api/ai/rehab-menu/route.ts` | `gemini-1.5-flash` | `gemini-2.0-flash` |
| `src/app/api/team-workout/route.ts` | `gemini-1.5-flash` | `gemini-2.0-flash` |

---

## 関連するビルドエラー修正

同時に以下の TypeScript ビルドエラーも修正した：

1. **`src/app/print/soap/[id]/page.tsx`**: Next.js 15 の `params` が `Promise<{id:string}>` 必須となったため `use(params)` パターンに修正
2. **`src/app/print/training/page.tsx`**: `"use client"` 欠如による `onClick` ハンドラーのサーバーコンポーネントエラーを修正
3. **`src/app/(dashboard)/team-training/page.tsx`**: Recharts `Tooltip.formatter` の型を `(v: unknown) => ...` に修正
4. **`tsconfig.json`**: `jest.config.ts` / `jest.setup.ts` を `exclude` に追加し `@types/jest` 解決エラーを回避

---

## 理由

- `gemini-2.0-flash` は `gemini-1.5-flash` の後継モデルであり、同等以上の性能を持つ
- フォールバック機構（`GEMINI_PARSE_EXHAUSTED` 時の安全なフォールバックメニュー返却）は既に実装済みのため、クォータ超過時も安全に動作する
