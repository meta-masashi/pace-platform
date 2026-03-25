/**
 * PACE Platform -- 日次チェックインページ
 *
 * アスリートが日次コンディションデータを入力するフォーム。
 * POST /api/checkin に送信し、算出されたスコアを表示。
 */

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BioSwipeWrapper } from "./_components/bio-swipe-wrapper";

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

  return <BioSwipeWrapper athleteId={athlete.id as string} />;
}
