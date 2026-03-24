/**
 * PACE Platform -- アスリートホーム画面
 *
 * コンディショニングスコアリング、AI インサイト、
 * ブレークダウンカード（フィットネス蓄積・疲労負荷・ACWR）を表示。
 *
 * データは /api/conditioning/[athleteId] から取得。
 */

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AthleteHomeContent } from "./_components/athlete-home-content";

export const metadata: Metadata = {
  title: "ホーム",
};

export default async function AthleteHomePage() {
  // サーバーサイドで認証ユーザーのアスリートIDを取得
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // ユーザーに紐づくアスリートレコードを取得
  const { data: athlete } = await supabase
    .from("athletes")
    .select("id, display_name")
    .eq("user_id", user.id)
    .single();

  if (!athlete) {
    // アスリートレコードが無い場合（スタッフユーザーなど）
    redirect("/login");
  }

  return (
    <AthleteHomeContent
      athleteId={athlete.id as string}
      displayName={(athlete.display_name as string) ?? ""}
    />
  );
}
