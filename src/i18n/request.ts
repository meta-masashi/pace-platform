/**
 * PACE Platform — next-intl サーバーサイド設定
 *
 * Next.js App Router + next-intl の getRequestConfig を設定する。
 * タイムゾーンは常に Asia/Tokyo を基準とし、
 * DB に保存された UTC 日時を表示時のみ JST へ変換する。
 */

import { getRequestConfig } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { locales } from './config'

export default getRequestConfig(async ({ locale }) => {
  // サポートされていないロケールは 404
  if (!locales.includes(locale as 'ja' | 'en')) notFound()

  return {
    locale: locale as string,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: 'Asia/Tokyo',
    now: new Date(),
  }
})
