import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'プライバシーポリシー',
};

// ---------------------------------------------------------------------------
// プライバシーポリシーページ
// ---------------------------------------------------------------------------

export default function PrivacyPolicyPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
        プライバシーポリシー
      </h1>

      <p className="text-sm leading-relaxed text-gray-600">
        【事業者名を記入】（以下「当社」といいます）は、PACE Platform（以下「本サービス」といいます）の提供にあたり、
        お客様の個人情報の保護を重要な責務と認識し、以下のとおりプライバシーポリシーを定めます。
      </p>

      <Section title="1. 個人情報の取得">
        <p>当社は、本サービスの提供にあたり、以下の個人情報を取得します。</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>氏名、メールアドレス等の本人確認に必要な情報</li>
          <li>所属チーム・組織に関する情報</li>
          <li>サービス利用履歴、アクセスログ</li>
          <li>
            選手のコンディショニングデータ（心拍数、HRV、GPS データ、トレーニング負荷等）
          </li>
          <li>アセスメント・リハビリプログラムに関する医療関連情報</li>
          <li>お問い合わせ内容</li>
        </ul>
      </Section>

      <Section title="2. 利用目的">
        <p>取得した個人情報は、以下の目的で利用します。</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>本サービスの提供・運営・維持・改善</li>
          <li>ユーザーアカウントの管理</li>
          <li>コンディショニングスコアの算出および予測分析</li>
          <li>朝のアジェンダ通知等の配信</li>
          <li>お問い合わせへの対応</li>
          <li>利用規約に違反する行為への対応</li>
          <li>サービスの品質向上のための統計データ作成（個人を特定しない形式）</li>
        </ul>
      </Section>

      <Section title="3. 第三者提供">
        <p>
          当社は、以下の場合を除き、お客様の個人情報を第三者に提供することはありません。
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>お客様の同意がある場合</li>
          <li>法令に基づく場合</li>
          <li>
            人の生命、身体または財産の保護のために必要がある場合であって、お客様の同意を得ることが困難である場合
          </li>
          <li>
            業務委託先に対して、利用目的の達成に必要な範囲で個人情報の取り扱いを委託する場合
          </li>
        </ul>
      </Section>

      <Section title="4. 安全管理措置">
        <p>
          当社は、個人情報の漏洩、滅失、毀損の防止のために、以下の安全管理措置を講じています。
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            通信の暗号化（TLS/SSL）によるデータ転送時の保護
          </li>
          <li>データベースの暗号化による保管時の保護</li>
          <li>アクセス権限の管理および認証機能の実装</li>
          <li>行レベルセキュリティ（RLS）による組織間のデータ分離</li>
          <li>定期的なセキュリティ監査の実施</li>
          <li>従業員に対する個人情報保護に関する教育の実施</li>
        </ul>
      </Section>

      <Section title="5. 個人情報の開示・訂正・削除">
        <p>
          お客様は、当社が保有する個人情報について、開示・訂正・追加・削除・利用停止を
          請求することができます。ご請求の際は、本人確認を行ったうえで、合理的な期間内に
          対応いたします。
        </p>
        <p className="mt-2">
          お問い合わせ先: 【メールアドレスを記入】
        </p>
      </Section>

      <Section title="6. Cookie およびアクセス解析">
        <p>
          本サービスでは、サービスの品質向上およびユーザー体験の改善のために
          Cookie を使用する場合があります。Cookie の使用を希望しない場合は、
          ブラウザの設定により Cookie を無効にすることができます。
          ただし、一部の機能が正常に動作しなくなる場合があります。
        </p>
      </Section>

      <Section title="7. プライバシーポリシーの変更">
        <p>
          当社は、必要に応じて本プライバシーポリシーを変更することがあります。
          変更後のプライバシーポリシーは、本ページに掲載した時点から効力を生じるものとします。
          重要な変更がある場合は、本サービス上で通知いたします。
        </p>
      </Section>

      <Section title="8. お問い合わせ">
        <p>
          個人情報の取り扱いに関するお問い合わせは、以下までご連絡ください。
        </p>
        <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p>【事業者名を記入】</p>
          <p className="mt-1">個人情報保護管理者: 【担当者名を記入】</p>
          <p className="mt-1">メール: 【メールアドレスを記入】</p>
          <p className="mt-1">所在地: 【所在地を記入】</p>
        </div>
      </Section>

      <p className="text-xs text-gray-400">
        制定日: 2024年4月1日
        <br />
        最終更新日: 2024年4月1日
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// セクションコンポーネント
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <div className="text-sm leading-relaxed text-gray-600">{children}</div>
    </section>
  );
}
