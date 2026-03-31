import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SoapWizard } from './_components/soap-wizard';

export const metadata: Metadata = {
  title: '新規SOAPノート作成',
};

/**
 * 新規SOAPノート作成ページ（ステップ型ウィザード）
 *
 * クエリパラメータ ?athleteId= でアスリートIDを事前設定可能。
 */
export default function NewSoapNotePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">新規SOAPノート作成</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ステップ形式で記録を作成します。各セクションでAI補助が利用できます。
        </p>
      </div>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        }
      >
        <SoapWizard />
      </Suspense>
    </div>
  );
}
