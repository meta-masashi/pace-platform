import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NewAssessmentForm } from './_components/new-assessment-form';

export const metadata: Metadata = {
  title: '新規アセスメント',
};

export default function NewAssessmentPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-bold tracking-tight">新規アセスメント</h1>
      <Suspense
        fallback={
          <div className="space-y-4">
            <div className="h-12 animate-pulse rounded-lg bg-muted" />
            <div className="h-12 animate-pulse rounded-lg bg-muted" />
            <div className="h-10 w-32 animate-pulse rounded-lg bg-muted" />
          </div>
        }
      >
        <NewAssessmentForm />
      </Suspense>
    </div>
  );
}
