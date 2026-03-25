import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TrainingMenuContent } from './_components/training-menu-content';

export const metadata: Metadata = {
  title: 'チームトレーニング',
};

export default function TrainingPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        </div>
      }
    >
      <TrainingMenuContent />
    </Suspense>
  );
}
