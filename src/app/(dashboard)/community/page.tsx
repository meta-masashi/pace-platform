"use client";

import { useState, useRef, useEffect } from "react";
import { Hash, Send, Link2, ShieldCheck, CheckCheck, Check, Filter } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { Channel, Message, Staff } from "@/types";
import { createClient } from "@/lib/supabase/client";

const roleColors: Record<string, string> = {
  master: "bg-purple-100 text-purple-700",
  AT: "bg-blue-100 text-blue-700",
  PT: "bg-green-100 text-green-700",
  "S&C": "bg-amber-100 text-amber-700",
};

const roleLabels: Record<string, string> = {
  master: "マスター",
  AT: "AT",
  PT: "PT",
  "S&C": "S&C",
};

const CDS_DISCLAIMER = "\n\n---\n⚠️ 本メッセージはPACE判断支援システム（CDS）による補助情報を含みます。最終判断は必ず有資格者が行ってください。";

const BLANK_SOAP_TEMPLATE = `【S】主訴・自覚症状\n\n【O】客観的所見\n\n【A】評価・解釈\n\n【P】プラン・対応`;

type FilterRole = "all" | "AT" | "PT" | "S&C" | "master";

export default function CommunityPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messageText, setMessageText] = useState("");
  const [cdsEnabled, setCdsEnabled] = useState(false);
  const [roleFilter, setRoleFilter] = useState<FilterRole>("all");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // The id used for "is this my message" checks
  const currentStaffId = currentUserId ?? "";

  // ── Initial bootstrap ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function bootstrap() {
      // 1. Resolve current user (silent fallback if not authenticated)
      try {
        const userRes = await supabase.auth.getUser();
        const user = userRes?.data?.user ?? null;
        if (!cancelled && user) {
          setCurrentUserId(user.id);
        }
      } catch {
        // unauthenticated — use mock staff id
      }

      // 2. Fetch channels
      try {
        const { data, error } = await supabase
          .from("channels")
          .select("*")
          .order("name");

        if (!cancelled && data && data.length > 0 && !error) {
          setChannels(data as Channel[]);
          setActiveChannel(data[0] as Channel);
        }
        // else channels remain empty []
      } catch {
        console.warn("[community] Failed to fetch channels");
      }
    }

    bootstrap();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch messages whenever activeChannel changes ──────────────────────────
  useEffect(() => {
    if (!activeChannel) {
      setLoading(false);
      return;
    }
    const channelId = activeChannel.id;
    let cancelled = false;
    const supabase = createClient();

    async function fetchMessages() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("messages")
          .select("*, staff:staff_id(id, name, role, email, is_leader, is_active, org_id, team_id)")
          .eq("channel_id", channelId)
          .order("created_at", { ascending: true })
          .limit(100);

        if (cancelled) return;

        if (data && data.length > 0 && !error) {
          // Cast the staff join (returned as object) to Staff type
          const mapped: Message[] = data.map((row) => ({
            ...row,
            staff: row.staff as unknown as Staff,
          }));
          setMessages(mapped);
        } else {
          setMessages([]);
        }
      } catch {
        console.warn("[community] Failed to fetch messages");
        if (!cancelled) {
          setMessages([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchMessages();
    return () => { cancelled = true; };
  }, [activeChannel?.id]);

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!activeChannel) return;
    const supabase = createClient();

    const realtimeChannel = supabase
      .channel(`messages:${activeChannel.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${activeChannel.id}`,
        },
        async (payload) => {
          try {
            const { data } = await supabase
              .from("messages")
              .select("*, staff:staff_id(id, name, role, email, is_leader, is_active, org_id, team_id)")
              .eq("id", payload.new.id)
              .single();

            if (data) {
              const mapped: Message = {
                ...data,
                staff: data.staff as unknown as Staff,
              };
              setMessages((prev) => [...prev, mapped]);
            }
          } catch {
            console.warn("[community] Realtime fetch failed for new message");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeChannel);
    };
  }, [activeChannel?.id]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  const channelMessages = messages; // already filtered to activeChannel by fetch
  const filteredMessages = roleFilter === "all"
    ? channelMessages
    : channelMessages.filter((m) => m.staff.role === roleFilter);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filteredMessages.length, activeChannel?.id]);

  // ── Send message ───────────────────────────────────────────────────────────
  async function handleSend() {
    if (!messageText.trim() || !activeChannel || !currentUserId) return;
    const content = cdsEnabled ? messageText + CDS_DISCLAIMER : messageText;

    try {
      const supabase = createClient();
      await supabase.from("messages").insert({
        channel_id: activeChannel.id,
        staff_id: currentUserId,
        content,
      });
      // Do NOT optimistically add — Realtime handles it
    } catch {
      console.warn("[community] Failed to send message");
    }

    setMessageText("");
  }

  async function handleSOAPQuote() {
    setCdsEnabled(true);

    // Attempt to fetch the most recent SOAP note for the current user
    if (currentUserId) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("soap_notes")
          .select("s_text, o_text, a_text, p_text, created_at")
          .eq("staff_id", currentUserId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          const note = data as { s_text: string | null; o_text: string | null; a_text: string | null; p_text: string | null; created_at: string };
          const date = new Date(note.created_at).toLocaleDateString("ja-JP", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          const template = `【S】主訴・自覚症状\n${note.s_text ?? ""}\n\n【O】客観的所見\n${note.o_text ?? ""}\n\n【A】評価・解釈\n${note.a_text ?? ""}\n\n【P】プラン・対応\n${note.p_text ?? ""}\n\n（${date} 記録より）`;
          setMessageText(template);
          return;
        }
      } catch {
        // fall through to blank template
      }
    }

    setMessageText(BLANK_SOAP_TEMPLATE);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Read receipts remain local/mock for now (future task: persist via RPC)
  const unreadCount = (channelId: string) => {
    return messages.filter(
      (m) =>
        m.channel_id === channelId &&
        !m.read_by?.some((r) => r.staff_id === currentStaffId)
    ).length;
  };

  return (
    <div className="space-y-0 -m-6 h-[calc(100vh-0px)]">
      <div className="flex h-full" style={{ height: "calc(100vh - 48px)" }}>
        {/* Sidebar */}
        <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
          <div className="px-4 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">チャンネル</h2>
            <p className="text-xs text-gray-400 mt-0.5">多職種クローズドメッセージ</p>
          </div>
          <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
            {channels.map((channel) => {
              const unread = unreadCount(channel.id);
              return (
                <button
                  key={channel.id}
                  onClick={() => setActiveChannel(channel)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    activeChannel?.id === channel.id
                      ? "bg-green-50 text-green-700 font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Hash className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 text-left truncate">{channel.name}</span>
                  {unread > 0 && (
                    <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                      {unread}
                    </span>
                  )}
                  {unread === 0 && (
                    <span className="text-xs text-gray-400">{channel.member_count}</span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Quick actions */}
          <div className="px-3 py-3 border-t border-gray-100 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">クイックアクション</p>
            <button
              onClick={() => { if (channels[0]) setActiveChannel(channels[0]); void handleSOAPQuote(); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-left bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <Link2 className="w-3.5 h-3.5 flex-shrink-0" />
              SOAPより作成
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5">
              <ShieldCheck className={`w-3.5 h-3.5 ${cdsEnabled ? "text-amber-600" : "text-gray-400"}`} />
              <span className="text-xs text-gray-600 flex-1">CDS免責文言</span>
              <button
                onClick={() => setCdsEnabled((v) => !v)}
                className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${cdsEnabled ? "bg-amber-500" : "bg-gray-200"}`}
              >
                <span className={`block w-4 h-4 bg-white rounded-full shadow-sm transition-transform mx-0.5 ${cdsEnabled ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </div>
          </div>
        </aside>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col">
          {/* Channel header */}
          <div className="px-6 py-3 border-b border-gray-200 bg-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-gray-400" />
                <h1 className="font-semibold text-gray-900">{activeChannel?.name ?? "チャンネルを選択"}</h1>
                <span className="text-xs text-gray-400 ml-1">{activeChannel?.member_count ?? 0}名</span>
              </div>
              {/* Role filter */}
              <div className="flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-gray-400" />
                {(["all", "AT", "PT", "S&C", "master"] as FilterRole[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRoleFilter(r)}
                    className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                      roleFilter === r
                        ? "bg-green-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {r === "all" ? "全員" : roleLabels[r] ?? r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-gray-50">
            {loading ? (
              /* Loading skeleton */
              <div className="space-y-4 pt-2">
                {[1, 2, 3].map((_i) => (
                  <div key={_i} className="flex items-start gap-3 animate-pulse">
                    <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-gray-200 rounded w-32" />
                      <div className="h-10 bg-gray-200 rounded w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="text-center text-sm text-gray-400 pt-12">
                このチャンネルにはまだメッセージがありません
              </div>
            ) : (
              filteredMessages.map((message) => {
                const initials = message.staff.name.split(" ").map((s) => s.charAt(0)).join("");
                const isMine = message.staff.id === currentStaffId;
                const readCount = message.read_by?.length ?? 0;
                return (
                  <div key={message.id} className={`flex items-start gap-3 ${isMine ? "flex-row-reverse" : ""}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isMine ? "bg-green-600" : "bg-green-100"
                    }`}>
                      <span className={`text-xs font-semibold ${isMine ? "text-white" : "text-green-700"}`}>{initials}</span>
                    </div>
                    <div className={`flex-1 min-w-0 ${isMine ? "items-end" : "items-start"} flex flex-col`}>
                      <div className={`flex items-center gap-2 mb-1 ${isMine ? "flex-row-reverse" : ""}`}>
                        <span className="text-sm font-semibold text-gray-900">{message.staff.name}</span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${roleColors[message.staff.role] ?? "bg-gray-100 text-gray-600"}`}>
                          {roleLabels[message.staff.role] ?? message.staff.role}
                        </span>
                        <span className="text-xs text-gray-400">{formatDateTime(message.created_at)}</span>
                      </div>
                      <div className={`rounded-lg border px-3 py-2 max-w-[85%] ${
                        isMine ? "bg-green-50 border-green-200" : "bg-white border-gray-100"
                      }`}>
                        {message.linked_soap_id && (
                          <div className="flex items-center gap-1 text-xs text-blue-600 mb-1.5 pb-1.5 border-b border-blue-100">
                            <Link2 className="w-3 h-3" />
                            <span>SOAPノートより — {message.linked_soap_id}</span>
                          </div>
                        )}
                        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{
                          message.cds_disclaimer
                            ? message.content.replace(CDS_DISCLAIMER, "")
                            : message.content
                        }</p>
                        {message.cds_disclaimer && (
                          <div className="mt-2 pt-2 border-t border-amber-100 flex items-start gap-1.5">
                            <ShieldCheck className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700 leading-relaxed">
                              CDS補助情報を含みます。最終判断は有資格者が行ってください。
                            </p>
                          </div>
                        )}
                      </div>
                      {/* Read receipts */}
                      <div className={`flex items-center gap-1 mt-1 ${isMine ? "flex-row-reverse" : ""}`}>
                        {readCount > 0 ? (
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <CheckCheck className="w-3 h-3 text-blue-400" />
                            <span>既読 {readCount}</span>
                            <span className="text-gray-300">—</span>
                            {message.read_by!.slice(0, 2).map((r) => (
                              <span key={r.staff_id} className="text-gray-400">{r.staff_name.split(" ")[0]}</span>
                            ))}
                            {readCount > 2 && <span>他{readCount - 2}名</span>}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-xs text-gray-300">
                            <Check className="w-3 h-3" />
                            <span>未読</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="px-6 py-3 border-t border-gray-200 bg-white">
            {cdsEnabled && (
              <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-amber-50 rounded text-xs text-amber-700">
                <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
                <span>CDS免責文言が自動付加されます</span>
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                placeholder={`#${activeChannel?.name ?? "チャンネル"} にメッセージを送信`}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={messageText.includes("\n") ? 3 : 1}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
              <button
                onClick={handleSend}
                disabled={!messageText.trim() || !currentUserId}
                className="p-2.5 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Enterで送信 / Shift+Enterで改行 — ログはタイムスタンプ付きで保存されます
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
