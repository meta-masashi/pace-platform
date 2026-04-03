import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerRegister } from './_components/sw-register';
import { PwaInstallPrompt } from './_components/pwa-install-prompt';
import { PaceToaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: {
    default: 'PACE Platform',
    template: '%s | PACE Platform',
  },
  description: 'スポーツ医療チーム向けアスリートコンディション管理・傷害予防プラットフォーム',
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#059669',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-sans">
        {children}
        <PaceToaster />
        <ServiceWorkerRegister />
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
