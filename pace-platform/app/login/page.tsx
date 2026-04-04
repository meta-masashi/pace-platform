'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 旧 /login → /auth/login へのリダイレクト（後方互換性）
 */
export default function LegacyLoginRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/auth/login');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-gray-500">リダイレクト中...</p>
    </div>
  );
}
