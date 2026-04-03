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
  '/api/health',               // Health check endpoint (infrastructure monitoring)
];

// Allowed origins for CSRF Origin header validation
const ALLOWED_ORIGINS = new Set([
  process.env.NEXT_PUBLIC_SITE_URL,
].filter(Boolean));

// State-changing HTTP methods that require CSRF protection
const CSRF_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// 静的ファイル拡張子（auth スキップ対象）
// pathname.includes('.') の代わりに明示的な拡張子リストを使用
const STATIC_EXTENSIONS = new Set([
  '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif',
  '.css', '.js', '.map', '.woff', '.woff2', '.ttf', '.eot',
  '.json', '.xml', '.txt', '.robots', '.webmanifest',
]);

function hasStaticExtension(pathname: string): boolean {
  const lastDot = pathname.lastIndexOf('.');
  if (lastDot === -1) return false;
  const ext = pathname.slice(lastDot).toLowerCase();
  return STATIC_EXTENSIONS.has(ext);
}

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
  } else if (hasStaticExtension(pathname) && !pathname.startsWith('/api/')) {
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
  // NEXT_PUBLIC_SITE_URL が未設定の場合は CSRF チェックを厳格化
  // （空の許可リストでは Origin 付きリクエストを全拒否してしまうため）
  if (ALLOWED_ORIGINS.size === 0) {
    console.warn('[middleware] NEXT_PUBLIC_SITE_URL が未設定です。CSRF Origin チェックをスキップします。');
    return true;
  }

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

  // Origin/Referer 両方なし:
  // NEXT_PUBLIC_SITE_URL 設定済みの場合は厳格化（ブラウザは通常どちらかを送る）
  // Sec-Fetch-Site ヘッダーがある場合はブラウザリクエストと判断
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite) {
    // ブラウザからのリクエストで Origin/Referer がない → 拒否
    console.warn('[middleware] CSRF: ブラウザリクエストに Origin/Referer がありません');
    return false;
  }

  // server-to-server リクエスト（Sec-Fetch-Site なし）は許可
  return true;
}

// ---------------------------------------------------------------------------
// 廃止 URL ネームスペース（Sprint 7: 410 Gone を返す）
// ---------------------------------------------------------------------------

const DEPRECATED_PREFIXES = ['/api/telehealth', '/api/insurance'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // -----------------------------------------------------------------------
  // 廃止 API ガード — 410 Gone
  // テレヘルス・保険請求は実装変更指示書（2026-03-25）により廃止
  // -----------------------------------------------------------------------
  if (DEPRECATED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.json(
      { success: false, error: 'このエンドポイントは廃止されました。' },
      { status: 410 },
    );
  }

  // Skip auth check for public routes and static assets
  if (
    pathname === '/' ||
    PUBLIC_ROUTES.some((route) => pathname.startsWith(route)) ||
    pathname.startsWith('/_next/') ||
    hasStaticExtension(pathname)
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
  // Content-Type バリデーション — API POST/PUT/PATCH に application/json を強制
  // -----------------------------------------------------------------------
  if (
    pathname.startsWith('/api/') &&
    ['POST', 'PUT', 'PATCH'].includes(request.method) &&
    !API_AUTH_EXEMPT.some((route) => pathname.startsWith(route))
  ) {
    const contentType = request.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');
    const isMultipart = contentType.includes('multipart/form-data');
    if (!isJson && !isMultipart) {
      return NextResponse.json(
        { success: false, error: 'Content-Type は application/json または multipart/form-data である必要があります。' },
        { status: 415 },
      );
    }
  }

  // -----------------------------------------------------------------------
  // API ルートの防御多層化 — セッション認証チェック
  // 個別ルートの auth チェックに加えて middleware でも検証する
  // -----------------------------------------------------------------------
  // Auth exempt API ルート — セッションチェックをスキップ、ヘッダーのみ適用
  if (
    pathname.startsWith('/api/') &&
    API_AUTH_EXEMPT.some((route) => pathname.startsWith(route))
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

    // 検証済みユーザー ID をヘッダーに設定（ルートハンドラーで getUser() の再呼出しを省略可能）
    response.headers.set('x-authenticated-user-id', user.id);

    applySecurityHeaders(response, pathname);
    return response;
  } catch (err) {
    // Middleware crash fallback — 認証基盤障害は 503 Service Unavailable
    // ユーザーの資格情報が有効でも検証不能なため 401 は不適切
    console.error('[middleware] Supabase auth service failure:', { error: err, pathname, method: request.method });

    // API ルートは認証基盤障害時に 503 を返す
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: '認証サービスが一時的に利用できません。しばらく後に再試行してください。' },
        { status: 503 },
      );
    }

    // ページルートは通過させる（500 防止）
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
