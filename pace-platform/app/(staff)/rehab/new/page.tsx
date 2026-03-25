import type { Metadata } from 'next';
import { NewProgramForm } from './_components/new-program-form';

export const metadata: Metadata = {
  title: '新規リハビリプログラム作成',
};

/**
 * 新規リハビリプログラム作成ページ
 */
export default function NewProgramPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-bold tracking-tight">新規リハビリプログラム作成</h1>
      <NewProgramForm />
    </div>
  );
}
