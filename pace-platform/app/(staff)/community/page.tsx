/**
 * PACE Platform — コミュニティページ（Slack風チャット）
 *
 * 認証チェックは (staff)/layout.tsx に委譲。
 */

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CommunityContent } from './_components/community-content';

interface Channel {
  id: string;
  name: string;
  type: string;
  team_id: string | null;
  created_at: string;
}

export default function CommunityPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [staffId, setStaffId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/community/channels');
        if (res.ok) {
          const json = await res.json();
          setChannels(json.channels ?? []);
          setCanCreate(json.canCreate ?? false);
          setStaffId(json.staffId ?? '');
        }
      } catch (err) { void err; // silently handled
        // エラー時は空表示
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="-m-6 flex items-center justify-center h-[calc(100vh-3.5rem)]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="-m-6 flex flex-col h-[calc(100vh-3.5rem)]">
      {/* ヘッダー: 戻るボタン + タイトル */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5 shrink-0">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          ダッシュボードに戻る
        </Link>
        <span className="text-sm font-semibold text-foreground">コミュニティ</span>
      </div>

      {/* チャットコンテンツ */}
      <div className="flex flex-1 min-h-0">
        <CommunityContent
          initialChannels={channels}
          canCreate={canCreate}
          currentStaffId={staffId}
        />
      </div>
    </div>
  );
}
