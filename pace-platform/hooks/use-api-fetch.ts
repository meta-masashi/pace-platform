/**
 * hooks/use-api-fetch.ts
 * ============================================================
 * PACE Platform — API フェッチフック（トースト通知統合）
 *
 * API レスポンスの `success: false` を自動検出し、
 * sonner でエラートーストを表示する。
 * traceId があれば「詳細」として表示（サポート問い合わせ用）。
 *
 * 使用例:
 *   const { apiFetch, loading } = useApiFetch();
 *   const data = await apiFetch('/api/conditioning/123');
 * ============================================================
 */

'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data?: T;
  [key: string]: unknown;
}

export interface ApiErrorResponseShape {
  success: false;
  error: string;
  traceId?: string;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponseShape;

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  /** 自動トースト表示（デフォルト: true） */
  showToast?: boolean;
  /** 成功時のトースト表示（デフォルト: false） */
  showSuccessToast?: boolean;
  /** 成功トーストのメッセージ */
  successMessage?: string;
  /** リクエストボディ（自動 JSON.stringify） */
  body?: unknown;
}

// ---------------------------------------------------------------------------
// エラーメッセージのフォーマット
// ---------------------------------------------------------------------------

function formatErrorMessage(error: string, traceId?: string): string {
  if (traceId) {
    return `${error}\n\n問題が解決しない場合は Trace ID: ${traceId.slice(0, 8)} をサポートにお伝えください。`;
  }
  return error;
}

// ---------------------------------------------------------------------------
// HTTP ステータスに応じたトースト種別
// ---------------------------------------------------------------------------

function toastForStatus(status: number, message: string, traceId?: string): void {
  const desc = traceId ? `Trace: ${traceId.slice(0, 8)}` : undefined;

  if (status === 401 || status === 403) {
    toast.warning(message, { description: desc });
  } else if (status >= 500) {
    toast.error(message, { description: desc, duration: 8000 });
  } else {
    toast.error(message, { description: desc });
  }
}

// ---------------------------------------------------------------------------
// useApiFetch フック
// ---------------------------------------------------------------------------

export function useApiFetch() {
  const [loading, setLoading] = useState(false);

  const apiFetch = useCallback(async <T = unknown>(
    url: string,
    options: ApiFetchOptions = {},
  ): Promise<ApiSuccessResponse<T> | null> => {
    const {
      showToast = true,
      showSuccessToast = false,
      successMessage,
      body,
      ...fetchOptions
    } = options;

    setLoading(true);

    try {
      const res = await fetch(url, {
        ...fetchOptions,
        ...(body !== undefined
          ? {
              body: JSON.stringify(body),
              headers: {
                'Content-Type': 'application/json',
                ...fetchOptions.headers,
              },
            }
          : {}),
      });

      const json: ApiResponse<T> = await res.json();

      if (!json.success) {
        const errResp = json as ApiErrorResponseShape;
        if (showToast) {
          toastForStatus(res.status, errResp.error, errResp.traceId);
        }
        return null;
      }

      if (showSuccessToast && successMessage) {
        toast.success(successMessage);
      }

      return json as ApiSuccessResponse<T>;
    } catch (err) {
      if (showToast) {
        const msg = err instanceof Error ? err.message : 'ネットワークエラーが発生しました。';
        toast.error(msg);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { apiFetch, loading };
}

// ---------------------------------------------------------------------------
// 非フック版（useCallback を使わないシンプル版）
// ---------------------------------------------------------------------------

/**
 * フック外で使える API フェッチ関数。
 * サーバーコンポーネントやユーティリティから使用する。
 */
export async function apiFetchSimple<T = unknown>(
  url: string,
  options: Omit<ApiFetchOptions, 'showToast' | 'showSuccessToast' | 'successMessage'> = {},
): Promise<{ data: T | null; error: string | null; traceId?: string | undefined }> {
  const { body, ...fetchOptions } = options;

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      ...(body !== undefined
        ? {
            body: JSON.stringify(body),
            headers: {
              'Content-Type': 'application/json',
              ...fetchOptions.headers,
            },
          }
        : {}),
    });

    const json: ApiResponse<T> = await res.json();

    if (!json.success) {
      const errResp = json as ApiErrorResponseShape;
      return { data: null, error: errResp.error, traceId: errResp.traceId };
    }

    return { data: (json as ApiSuccessResponse<T>).data ?? null, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'ネットワークエラー',
    };
  }
}
