import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '特定商取引法に基づく表記',
};

// ---------------------------------------------------------------------------
// 特定商取引法に基づく表記ページ
// ---------------------------------------------------------------------------

export default function TokushohoPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
        特定商取引法に基づく表記
      </h1>

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-200">
            <Row label="事業者名" value="【事業者名を記入】" />
            <Row label="代表者名" value="【代表者名を記入】" />
            <Row
              label="所在地"
              value="【所在地を記入（例: 東京都渋谷区〇〇 1-2-3）】"
            />
            <Row
              label="連絡先"
              value={
                <>
                  <p>メール: 【メールアドレスを記入】</p>
                  <p className="mt-1">電話: 【電話番号を記入】</p>
                  <p className="mt-1 text-xs text-gray-400">
                    ※お問い合わせはメールにて承ります
                  </p>
                </>
              }
            />
            <Row
              label="販売価格"
              value={
                <>
                  <p>Starter プラン: 月額 29,800円（税込）</p>
                  <p className="mt-1">Pro プラン: 月額 79,800円（税込）</p>
                  <p className="mt-1 text-xs text-gray-400">
                    ※価格は予告なく変更される場合があります
                  </p>
                </>
              }
            />
            <Row
              label="販売価格以外の必要料金"
              value="インターネット接続料金、通信料金等はお客様のご負担となります。"
            />
            <Row
              label="支払方法"
              value="クレジットカード決済（Visa, Mastercard, JCB, American Express）"
            />
            <Row
              label="支払時期"
              value="ご利用開始時および毎月の更新日に自動決済されます。"
            />
            <Row
              label="サービス提供時期"
              value="お申し込み完了後、直ちにご利用いただけます。"
            />
            <Row
              label="返品・キャンセルについて"
              value={
                <>
                  <p>
                    デジタルコンテンツの性質上、サービス提供開始後の返品・返金はいたしかねます。
                  </p>
                  <p className="mt-1">
                    無料トライアル期間中のキャンセルについては、料金は発生しません。
                  </p>
                  <p className="mt-1">
                    月額プランの解約は、次回更新日の前日までにアカウント設定画面から行ってください。
                  </p>
                </>
              }
            />
            <Row
              label="動作環境"
              value={
                <>
                  <p>
                    推奨ブラウザ: Google Chrome（最新版）、Safari（最新版）、Firefox（最新版）、Microsoft Edge（最新版）
                  </p>
                  <p className="mt-1">
                    安定したインターネット接続環境が必要です。
                  </p>
                </>
              }
            />
            <Row
              label="特別な販売条件"
              value="本サービスは法人・団体向けの SaaS サービスです。個人のお客様もご利用いただけます。"
            />
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        最終更新日: 2024年4月1日
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// テーブル行コンポーネント
// ---------------------------------------------------------------------------

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <tr>
      <th className="w-40 whitespace-nowrap bg-gray-50 px-4 py-3 text-left font-medium text-gray-700 sm:w-52">
        {label}
      </th>
      <td className="px-4 py-3 text-gray-600">{value}</td>
    </tr>
  );
}
