import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'アセスメント',
};

export default function AssessmentIndexPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">アセスメント</h1>
        <Link
          href="/assessment/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          新規アセスメント
        </Link>
      </div>

      {/* Placeholder for assessment history list */}
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          過去のアセスメント一覧がここに表示されます。
          新規アセスメントを開始するには上のボタンをクリックしてください。
        </p>
      </div>
    </div>
  );
}
