'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChannelList } from './channel-list';
import { MessageArea } from './message-area';
import { MessageInput } from './message-input';

interface Channel {
  id: string;
  name: string;
  type: string;
  team_id: string | null;
  created_at: string;
}

interface StaffInfo {
  id: string;
  name: string;
  role: string;
}

interface Message {
  id: string;
  content: string;
  attachments_json: unknown[];
  created_at: string;
  staff_id: string;
  staff: StaffInfo | null;
}

interface Props {
  initialChannels: Channel[];
  canCreate: boolean;
  currentStaffId: string;
}

const POLL_INTERVAL = 5000; // 5秒ごとにポーリング

export function CommunityContent({ initialChannels, canCreate, currentStaffId }: Props) {
  const [channels, setChannels] = useState<Channel[]>(initialChannels);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(
    initialChannels.length > 0 ? initialChannels[0]!.id : null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeChannel = channels.find((ch) => ch.id === activeChannelId);

  // メッセージ取得
  const fetchMessages = useCallback(async (channelId: string) => {
    try {
      const res = await fetch(`/api/community/messages?channelId=${channelId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setMessages(json.data);
      }
    } catch (err) {
      console.error('メッセージ取得エラー:', err);
    }
  }, []);

  // チャンネル選択時
  const handleSelectChannel = useCallback(
    async (channelId: string) => {
      setActiveChannelId(channelId);
      setLoading(true);
      setMessages([]);
      await fetchMessages(channelId);
      setLoading(false);
    },
    [fetchMessages]
  );

  // 初回ロード
  useEffect(() => {
    if (activeChannelId) {
      setLoading(true);
      fetchMessages(activeChannelId).then(() => setLoading(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ポーリング (5秒間隔)
  useEffect(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }

    if (activeChannelId) {
      pollTimerRef.current = setInterval(() => {
        fetchMessages(activeChannelId);
      }, POLL_INTERVAL);
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [activeChannelId, fetchMessages]);

  // メッセージ送信後にリフレッシュ
  const handleMessageSent = useCallback(() => {
    if (activeChannelId) {
      fetchMessages(activeChannelId);
    }
  }, [activeChannelId, fetchMessages]);

  // チャンネル作成後
  const handleChannelCreated = useCallback(
    (channel: Channel) => {
      setChannels((prev) => [...prev, channel]);
      handleSelectChannel(channel.id);
    },
    [handleSelectChannel]
  );

  return (
    <div className="flex h-full w-full">
      {/* チャンネルリスト */}
      <ChannelList
        channels={channels}
        activeChannelId={activeChannelId}
        onSelectChannel={handleSelectChannel}
        onChannelCreated={handleChannelCreated}
        canCreate={canCreate}
      />

      {/* メッセージエリア */}
      <div className="flex flex-1 flex-col">
        {activeChannel ? (
          <>
            {/* チャンネルヘッダー */}
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <span className="text-lg font-medium text-muted-foreground">#</span>
              <h2 className="text-sm font-semibold">{activeChannel.name}</h2>
            </div>

            <MessageArea
              messages={messages}
              channelName={activeChannel.name}
              loading={loading}
            />

            <MessageInput
              channelId={activeChannel.id}
              onMessageSent={handleMessageSent}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg">チャンネルを選択してください</p>
              {channels.length === 0 && canCreate && (
                <p className="mt-2 text-sm">
                  左のパネルから新しいチャンネルを作成できます
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
