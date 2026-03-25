/**
 * PACE v6.0 — 法的免責条項コンポーネント
 *
 * すべての推奨表示に付加する法的免責条項。
 * 本システムが医療診断を代替しないことを明示する。
 */

export function LegalDisclaimer() {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
      <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">
        本システムは意思決定支援ツールであり、医療診断を代替するものではありません。最終的なトレーニング実行の可否は、現場の医療スタッフおよび指導者が判断してください。
      </p>
    </div>
  );
}
