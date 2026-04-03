/**
 * hooks/use-push-subscription.ts
 * ============================================================
 * Web Push 通知サブスクリプション管理フック
 *
 * ブラウザの PushManager API を使用してプッシュ通知の
 * 購読・解除を行い、サブスクリプション情報をサーバーに保存する。
 * ============================================================
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface PushState {
  /** Push API がサポートされているか */
  isSupported: boolean;
  /** 現在の購読状態 */
  isSubscribed: boolean;
  /** 処理中フラグ */
  loading: boolean;
}

/**
 * Web Push サブスクリプション管理フック。
 *
 * VAPID 公開鍵は NEXT_PUBLIC_VAPID_PUBLIC_KEY 環境変数から取得する。
 */
export function usePushSubscription() {
  const [state, setState] = useState<PushState>({
    isSupported: false,
    isSubscribed: false,
    loading: false,
  });

  // 初期状態チェック
  useEffect(() => {
    async function check() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return;
      }

      setState((prev) => ({ ...prev, isSupported: true }));

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setState((prev) => ({ ...prev, isSubscribed: !!subscription }));
      } catch {
        // 権限拒否等 — サポートなし扱い
      }
    }

    check();
  }, []);

  // 購読
  const subscribe = useCallback(async (): Promise<boolean> => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      toast.error('プッシュ通知の設定が完了していません。');
      return false;
    }

    setState((prev) => ({ ...prev, loading: true }));

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.warning('通知の許可が必要です。ブラウザの設定を確認してください。');
        setState((prev) => ({ ...prev, loading: false }));
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });

      // サブスクリプションをサーバーに保存
      const json = subscription.toJSON();
      const res = await fetch('/api/notifications/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys?.p256dh ?? '',
            auth: json.keys?.auth ?? '',
          },
        }),
      });

      if (!res.ok) {
        throw new Error('サブスクリプションの保存に失敗しました。');
      }

      setState((prev) => ({ ...prev, isSubscribed: true, loading: false }));
      toast.success('プッシュ通知を有効にしました。');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '通知の登録に失敗しました。';
      toast.error(msg);
      setState((prev) => ({ ...prev, loading: false }));
      return false;
    }
  }, []);

  // 購読解除
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, loading: true }));

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();

        // サーバーからも削除
        await fetch('/api/notifications/push-subscription', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        });
      }

      setState((prev) => ({ ...prev, isSubscribed: false, loading: false }));
      toast.success('プッシュ通知を無効にしました。');
      return true;
    } catch {
      toast.error('通知の解除に失敗しました。');
      setState((prev) => ({ ...prev, loading: false }));
      return false;
    }
  }, []);

  return { ...state, subscribe, unsubscribe };
}

/**
 * VAPID 公開鍵を Uint8Array に変換する。
 * PushManager.subscribe() の applicationServerKey に必要。
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
