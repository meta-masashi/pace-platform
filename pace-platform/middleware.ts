import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/auth/callback', '/tokushoho', '/privacy'];

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth check for public routes and static assets
  if (
    pathname === '/' ||
    PUBLIC_ROUTES.some((route) => pathname.startsWith(route)) ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname.includes('.')
  ) {
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

    const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
    const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

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

    // If no user session, redirect to login
    if (!user) {
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
