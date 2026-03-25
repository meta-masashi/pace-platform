'use client';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface ExerciseItem {
  name: string;
  sets: number;
  reps: string;
  load_note: string;
  contraindication_tags?: string[];
}

interface MenuCardProps {
  exercise: ExerciseItem;
  index: number;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function MenuCard({ exercise, index }: MenuCardProps) {
  const hasContraindications =
    exercise.contraindication_tags && exercise.contraindication_tags.length > 0;

  return (
    <div
      className={`rounded-md border p-3 ${
        hasContraindications
          ? 'border-red-200 bg-red-50/50'
          : 'border-border bg-card'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-xs font-medium text-muted-foreground">
            {index + 1}
          </span>
          <span className="text-sm font-medium">{exercise.name}</span>
        </div>

        {hasContraindications && (
          <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
            禁忌あり
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>
          <strong className="font-medium text-foreground">{exercise.sets}</strong>{' '}
          セット
        </span>
        <span>
          <strong className="font-medium text-foreground">{exercise.reps}</strong>{' '}
          レップ
        </span>
        {exercise.load_note && (
          <span className="text-muted-foreground">{exercise.load_note}</span>
        )}
      </div>

      {hasContraindications && (
        <div className="mt-2 flex flex-wrap gap-1">
          {exercise.contraindication_tags!.map((tag) => (
            <span
              key={tag}
              className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
