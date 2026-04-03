import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // TODO: Next.js の nonce 対応が安定したら 'unsafe-inline' を nonce に置き換える
      // 現時点では Next.js がインラインスクリプトを生成するため unsafe-inline が必要
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com https://api.stripe.com https://*.ingest.sentry.io",
      "frame-src 'self' https://js.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; '),
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: process.env.SUPABASE_PROJECT_HOST ?? '*.supabase.co',
      },
    ],
  },

  // Webpack customization
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  org: 'hachi-w2',
  project: 'pace-platform',

  // ソースマップを Sentry にアップロード（本番ビルド時のみ）
  // SENTRY_AUTH_TOKEN 環境変数が必要
  silent: !process.env.CI,

  // Tree-shaking でバンドルサイズを削減
  disableLogger: true,

  // 自動的な instrumentation を有効化
  automaticVercelMonitors: true,
});
