import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/auth/callback', '/tokushoho', '/privacy'];

// API routes that skip session-based auth (use their own auth mechanisms)
const API_AUTH_EXEMPT = [
  '/api/auth/callback',        // OAuth callback
  '/api/auth/login',           // Login (pre-auth, has own brute force protection)
  '/api/s2s/ingest',           // Machine-to-machine (API key auth)
  '/api/webhooks/',            // Stripe webhooks (signature verification)
];

// Allowed origins for CSRF Origin header validation
const ALLOWED_ORIGINS = new Set([
  process.env.NEXT_PUBLIC_SITE_URL,
].filter(Boolean));

// State-changing HTTP methods that require CSRF protection
const CSRF_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// ---------------------------------------------------------------------------
// セキュリティ・パフォーマンスヘッダー（OWASP 推奨準拠）
// ---------------------------------------------------------------------------

function applySecurityHeaders(response: NextResponse, pathname: string): void {
  // セキュリティヘッダー
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );

  // 静的アセットのキャッシュ制御
  if (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/_next/image/')
  ) {
    response.headers.set(
      'Cache-Control',
      'public, max-age=31536000, immutable',
    );
  } else if (pathname.includes('.') && !pathname.startsWith('/api/')) {
    // その他の静的ファイル（favicon.ico 等）
    response.headers.set(
      'Cache-Control',
      'public, max-age=86400, stale-while-revalidate=43200',
    );
  } else if (pathname.startsWith('/api/')) {
    // API ルートはキャッシュしない
    response.headers.set(
      'Cache-Control',
      'no-store, no-cache, must-revalidate',
    );
  }
}

// ---------------------------------------------------------------------------
// CSRF Origin 検証
// ---------------------------------------------------------------------------

function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // Origin ヘッダーが存在する場合はそれを検証
  if (origin) {
    return ALLOWED_ORIGINS.has(origin);
  }

  // Origin がない場合は Referer で検証（一部ブラウザは Origin を送らない）
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      return ALLOWED_ORIGINS.has(refererOrigin);
    } catch {
      return false;
    }
  }

  // server-to-server リクエスト（Origin/Referer なし）は許可
  // ブラウザからのリクエストは必ず Origin または Referer を送る
  return true;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth check for public routes and static assets
  if (
    pathname === '/' ||
    PUBLIC_ROUTES.some((route) => pathname.startsWith(route)) ||
    pathname.startsWith('/_next/') ||
    pathname.includes('.')
  ) {
    const response = NextResponse.next();
    applySecurityHeaders(response, pathname);
    return response;
  }

  // -----------------------------------------------------------------------
  // CSRF Origin 検証 — 状態変更リクエスト（POST/PUT/PATCH/DELETE）に適用
  // API auth exempt ルートは Webhook 等のため除外
  // -----------------------------------------------------------------------
  if (
    pathname.startsWith('/api/') &&
    CSRF_METHODS.has(request.method) &&
    !API_AUTH_EXEMPT.some((route) => pathname.startsWith(route))
  ) {
    if (!validateOrigin(request)) {
      return NextResponse.json(
        { success: false, error: 'CSRF 検証に失敗しました。リクエスト元が不正です。' },
        { status: 403 },
      );
    }
  }

  // -----------------------------------------------------------------------
  // API ルートの防御多層化 — セッション認証チェック
  // 個別ルートの auth チェックに加えて middleware でも検証する
  // -----------------------------------------------------------------------
  if (
    pathname.startsWith('/api/') &&
    !API_AUTH_EXEMPT.some((route) => pathname.startsWith(route))
  ) {
    // API ルートには認証チェックを適用（GET 含む）
    // 認証不要の API は API_AUTH_EXEMPT に追加する
  } else if (pathname.startsWith('/api/')) {
    // Auth exempt API routes — skip session check, just apply headers
    const response = NextResponse.next();
    applySecurityHeaders(response, pathname);
    return response;
  }

  try {
    // Create Supabase client for server-side session check
    let response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    // ドット記法必須: Next.js はビルド時に process.env.NEXT_PUBLIC_* をインライン化する
    // ブラケット記法 process.env['...'] ではインライン化されず undefined になる
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      // Allow through if env vars are missing
      return response;
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Parameters<typeof response.cookies.set>[2] }>) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options ?? {});
          }
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // If no user session
    if (!user) {
      // API ルート → 401 JSON（リダイレクトではなく）
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { success: false, error: '認証が必要です。' },
          { status: 401 },
        );
      }

      // ページルート → ログインへリダイレクト
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      const redirectResponse = NextResponse.redirect(loginUrl);
      // Cookie をリダイレクトレスポンスにも引き継ぐ（トークンリフレッシュ対応）
      response.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value);
      });
      return redirectResponse;
    }

    applySecurityHeaders(response, pathname);
    return response;
  } catch (err) {
    // Middleware crash fallback — allow through to prevent 500
    console.error('[middleware] Error:', err);
    const response = NextResponse.next();
    applySecurityHeaders(response, pathname);
    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
