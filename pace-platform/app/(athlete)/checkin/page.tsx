/**
 * PACE Platform -- 日次チェックインページ
 *
 * アスリートが日次コンディションデータを入力するフォーム。
 * POST /api/checkin に送信し、算出されたスコアを表示。
 */

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CheckinForm } from "./_components/checkin-form";

export const metadata: Metadata = {
  title: "チェックイン",
};

export default async function CheckinPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: athlete } = await supabase
    .from("athletes")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!athlete) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">
          デイリーチェックイン
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          今日のコンディションを記録しましょう
        </p>
      </div>

      <CheckinForm athleteId={athlete.id as string} />
    </div>
  );
}
