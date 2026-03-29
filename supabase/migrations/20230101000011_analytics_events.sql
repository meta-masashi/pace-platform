-- ========================================
-- PACE v3.0 — コーポレートサイト用イベントトラッキング
-- 実行手順: Supabase ダッシュボード → SQL エディタ → 実行 → 「実行完了」と返信
-- 注意: このファイルは PACE SaaS テーブルとは独立したコーポレートサイト用
-- ========================================

-- ========================================
-- contact_leads テーブル（お問い合わせリード管理）
-- 用途: PACE デモ申込 / Reboot Work 問合せ / 一般問合せの管理
-- ========================================
CREATE TABLE IF NOT EXISTS public.contact_leads (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_type       TEXT NOT NULL CHECK (lead_type IN ('pace_demo', 'reboot_work', 'general')),
  -- 会社・個人情報
  company_name    TEXT,
  contact_name    TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  message         TEXT,
  -- リードステータス管理
  status          TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'contacted', 'qualified', 'closed')),
  -- GA4 連携用 UTM パラメータ
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_term        TEXT,
  utm_content     TEXT,
  -- セッション・デバイス情報
  referrer_url    TEXT,
  landing_page    TEXT,
  user_agent      TEXT,
  ip_address      INET,
  -- 対応メモ（スタッフ内部用）
  internal_notes  TEXT,
  assigned_to     TEXT,
  -- タイムスタンプ
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  contacted_at    TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS handle_updated_at ON public.contact_leads;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.contact_leads
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ========================================
-- page_events テーブル（匿名アクセス解析）
-- 用途: コーポレートサイトのページビュー・ボタンクリック等を記録
--       GA4 の補完データとして利用
-- ========================================
CREATE TABLE IF NOT EXISTS public.page_events (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type   TEXT NOT NULL CHECK (event_type IN (
                 'page_view',
                 'button_click',
                 'form_start',
                 'form_submit',
                 'scroll_depth',
                 'video_play',
                 'cta_click'
               )),
  page_path    TEXT NOT NULL,
  session_id   TEXT,                              -- クライアント生成の匿名セッション ID
  -- GA4 連携
  ga4_client_id TEXT,                             -- GA4 クライアント ID（_ga Cookie）
  -- UTM パラメータ
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  -- イベント詳細
  event_data   JSONB DEFAULT '{}',                -- ボタン名・スクロール深度 等
  -- デバイス情報
  user_agent   TEXT,
  ip_address   INET,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL
  -- page_events は INSERT ONLY（更新不可）
);

-- ========================================
-- パフォーマンスインデックス
-- ========================================

-- contact_leads: ステータス別・タイプ別集計
CREATE INDEX IF NOT EXISTS idx_contact_leads_status_type
  ON public.contact_leads (status, lead_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_leads_created
  ON public.contact_leads (created_at DESC);

-- UTM ソース別集計（マーケティング分析）
CREATE INDEX IF NOT EXISTS idx_contact_leads_utm
  ON public.contact_leads (utm_source, utm_campaign)
  WHERE utm_source IS NOT NULL;

-- page_events: ページパス別集計（人気ページ分析）
CREATE INDEX IF NOT EXISTS idx_page_events_path_created
  ON public.page_events (page_path, created_at DESC);

-- イベント種別集計
CREATE INDEX IF NOT EXISTS idx_page_events_type_created
  ON public.page_events (event_type, created_at DESC);

-- セッション別行動フロー追跡
CREATE INDEX IF NOT EXISTS idx_page_events_session
  ON public.page_events (session_id, created_at ASC)
  WHERE session_id IS NOT NULL;

-- ========================================
-- RLS の有効化
-- ========================================
ALTER TABLE public.contact_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_events   ENABLE ROW LEVEL SECURITY;

-- contact_leads: 認証済みユーザーのみ閲覧（社内管理用）
-- 匿名ユーザーは INSERT のみ許可（お問い合わせフォーム送信）
DROP POLICY IF EXISTS "contact_leads_insert_anon" ON public.contact_leads;
CREATE POLICY "contact_leads_insert_anon"
  ON public.contact_leads FOR INSERT
  WITH CHECK (true);    -- 匿名アクセス許可（anon key 経由のフォーム送信）

DROP POLICY IF EXISTS "contact_leads_select_authenticated" ON public.contact_leads;
CREATE POLICY "contact_leads_select_authenticated"
  ON public.contact_leads FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "contact_leads_update_authenticated" ON public.contact_leads;
CREATE POLICY "contact_leads_update_authenticated"
  ON public.contact_leads FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- page_events: 匿名 INSERT 許可（GA4 補完データ収集）
DROP POLICY IF EXISTS "page_events_insert_anon" ON public.page_events;
CREATE POLICY "page_events_insert_anon"
  ON public.page_events FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "page_events_select_authenticated" ON public.page_events;
CREATE POLICY "page_events_select_authenticated"
  ON public.page_events FOR SELECT
  USING (auth.uid() IS NOT NULL);
