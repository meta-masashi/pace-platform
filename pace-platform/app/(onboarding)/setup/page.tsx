import type { Metadata } from 'next';
import { SetupWizard } from './_components/setup-wizard';

export const metadata: Metadata = {
  title: '初期セットアップ',
};

export default function SetupPage() {
  return <SetupWizard />;
}
