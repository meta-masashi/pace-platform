/**
 * PACE Platform — Service Worker
 *
 * オフライン対応・キャッシュ管理のための Service Worker。
 * - 静的アセット: Cache-first 戦略
 * - API コール: Network-first 戦略（オフライン時はキャッシュフォールバック）
 */

const CACHE_VERSION = 'pace-v1';

/** キャッシュ対象の静的アセットパターン */
const STATIC_PATTERNS = [
  /^\/_next\/static\//,
  /^\/icons\//,
  /^\/manifest\.json$/,
];

/** API パスパターン */
const API_PATTERN = /^\/api\//;

// ---------------------------------------------------------------------------
// Install: 初期キャッシュ
// ---------------------------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll([
        '/manifest.json',
        '/icons/icon.svg',
      ]);
    })
  );
  // 即座にアクティブ化
  self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Activate: 古いキャッシュの削除
// ---------------------------------------------------------------------------

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      );
    })
  );
  // 全クライアントを即座に制御
  self.clients.claim();
});

// ---------------------------------------------------------------------------
// Fetch: リクエストインターセプト
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 同一オリジン以外は無視
  if (url.origin !== self.location.origin) {
    return;
  }

  const pathname = url.pathname;

  // ----- 静的アセット: Cache-first -----
  if (STATIC_PATTERNS.some((pattern) => pattern.test(pathname))) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // ----- API: Network-first -----
  if (API_PATTERN.test(pathname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }
});

// ---------------------------------------------------------------------------
// キャッシュ戦略
// ---------------------------------------------------------------------------

/**
 * Cache-first: キャッシュにあればそれを返し、なければネットワークから取得してキャッシュ。
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('オフラインです。接続を確認してください。', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/**
 * Network-first: ネットワークから取得を試み、失敗時はキャッシュにフォールバック。
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    return new Response(
      JSON.stringify({ success: false, error: 'オフラインです。接続を確認してください。' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    );
  }
}
