"use client";

import { useState, useRef, useEffect } from "react";
import { Hash, Send, Link2, ShieldCheck, CheckCheck, Check, Filter } from "lucide-react";
import { mockChannels, mockMessages, mockStaff } from "@/lib/mock-data";
import { formatDateTime } from "@/lib/utils";
import type { Channel, Message } from "@/types";

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

const SOAP_TEMPLATE = `【SOAPより】田中 健太 — 2026/03/21
S: 「足首が痛くて体重をかけられない。昨日より少し楽」
O: ROM背屈5°。腫脹2+。荷重時NRS 7→5に改善
A: 足関節可動域制限パターンA 継続。Stage1クリア基準（ROM15°）未達
P: 荷重テスト明日実施。アイシング継続。Hard Lock延長`;

type FilterRole = "all" | "AT" | "PT" | "S&C" | "master";

const currentStaffId = "staff-2"; // logged in as AT (鈴木 花子)

export default function CommunityPage() {
  const [activeChannel, setActiveChannel] = useState<Channel>(mockChannels[0]);
  const [messageText, setMessageText] = useState("");
  const [cdsEnabled, setCdsEnabled] = useState(false);
  const [roleFilter, setRoleFilter] = useState<FilterRole>("all");
  const [messages, setMessages] = useState<Message[]>(mockMessages);
  const bottomRef = useRef<HTMLDivElement>(null);

  const channelMessages = messages.filter((m) => m.channel_id === activeChannel.id);
  const filteredMessages = roleFilter === "all"
    ? channelMessages
    : channelMessages.filter(m => m.staff.role === roleFilter);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filteredMessages.length, activeChannel.id]);

  function handleSend() {
    if (!messageText.trim()) return;
    const staff = mockStaff.find(s => s.id === currentStaffId) ?? mockStaff[1];
    const content = cdsEnabled ? messageText + CDS_DISCLAIMER : messageText;
    const newMsg: Message = {
      id: `msg-${Date.now()}`,
      channel_id: activeChannel.id,
      staff,
      content,
      created_at: new Date().toISOString(),
      cds_disclaimer: cdsEnabled,
      read_by: [],
    };
    setMessages(prev => [...prev, newMsg]);
    setMessageText("");
  }

  function handleSOAPQuote() {
    setMessageText(SOAP_TEMPLATE);
    setCdsEnabled(true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const unreadCount = (channelId: string) => {
    return messages.filter(m =>
      m.channel_id === channelId &&
      !m.read_by?.some(r => r.staff_id === currentStaffId)
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
            {mockChannels.map((channel) => {
              const unread = unreadCount(channel.id);
              return (
                <button
                  key={channel.id}
                  onClick={() => setActiveChannel(channel)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    activeChannel.id === channel.id
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
              onClick={() => { setActiveChannel(mockChannels[0]); handleSOAPQuote(); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-left bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <Link2 className="w-3.5 h-3.5 flex-shrink-0" />
              SOAPより作成
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5">
              <ShieldCheck className={`w-3.5 h-3.5 ${cdsEnabled ? "text-amber-600" : "text-gray-400"}`} />
              <span className="text-xs text-gray-600 flex-1">CDS免責文言</span>
              <button
                onClick={() => setCdsEnabled(v => !v)}
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
                <h1 className="font-semibold text-gray-900">{activeChannel.name}</h1>
                <span className="text-xs text-gray-400 ml-1">{activeChannel.member_count}名</span>
              </div>
              {/* Role filter */}
              <div className="flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-gray-400" />
                {(["all", "AT", "PT", "S&C", "master"] as FilterRole[]).map(r => (
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
            {filteredMessages.length === 0 ? (
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
                            {message.read_by!.slice(0, 2).map(r => (
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
                placeholder={`#${activeChannel.name} にメッセージを送信`}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={messageText.includes("\n") ? 3 : 1}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
              <button
                onClick={handleSend}
                disabled={!messageText.trim()}
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
