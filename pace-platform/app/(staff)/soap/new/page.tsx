import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SoapForm } from './_components/soap-form';

export const metadata: Metadata = {
  title: '新規SOAPノート作成',
};

/**
 * 新規SOAPノート作成ページ
 *
 * クエリパラメータ ?athleteId= でアスリートIDを事前設定可能。
 */
export default function NewSoapNotePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">新規SOAPノート作成</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          アスリートの評価記録を作成します。AI補助で各セクションを生成できます。
        </p>
      </div>
      <Suspense
        fallback={
          <div className="space-y-4">
            <div className="h-12 animate-pulse rounded-lg bg-muted" />
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
            <div className="h-32 animate-pulse rounded-lg bg-muted" />
            <div className="h-32 animate-pulse rounded-lg bg-muted" />
            <div className="h-32 animate-pulse rounded-lg bg-muted" />
            <div className="h-32 animate-pulse rounded-lg bg-muted" />
          </div>
        }
      >
        <SoapForm />
      </Suspense>
    </div>
  );
}
