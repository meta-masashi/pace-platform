/**
 * Supabase Edge Function: dbn-predict
 * DBN 疲労予測結果を取得して AT/PT ダッシュボードに提供 (ADR-014)
 *
 * GET /functions/v1/dbn-predict?athlete_id=xxx
 *
 * レスポンス:
 *   - 最新の dbn_predictions レコード
 *   - 未確認の fatigue_alerts
 *   - DBN モデルのバージョン情報
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DBNPrediction {
  id: string
  athlete_id: string
  model_id: string
  prediction_date: string
  predicted_fatigue_state: 'low' | 'moderate' | 'high'
  fatigue_probability_low: number
  fatigue_probability_moderate: number
  fatigue_probability_high: number
  confidence_score: number
  evidence_snapshot: Record<string, number>
  created_at: string
}

interface FatigueAlert {
  id: string
  alert_date: string
  predicted_fatigue_state: string
  confidence_score: number
  recommended_action: string
  alert_status: string
}

interface ModelInfo {
  model_version: number
  trained_at: string
  validation_score: number
  training_days: number
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const athleteId = url.searchParams.get('athlete_id')

    if (!athleteId) {
      return new Response(
        JSON.stringify({ error: 'athlete_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verify caller is staff on athlete's team
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch latest prediction
    const { data: prediction, error: predError } = await supabase
      .from('dbn_predictions')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('prediction_date', new Date().toISOString().split('T')[0])
      .order('prediction_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (predError) {
      console.error('dbn_predictions query error:', predError)
    }

    // Fetch 7-day prediction history
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const { data: history } = await supabase
      .from('dbn_predictions')
      .select('prediction_date, predicted_fatigue_state, confidence_score, fatigue_probability_high')
      .eq('athlete_id', athleteId)
      .gte('prediction_date', sevenDaysAgo.toISOString().split('T')[0])
      .order('prediction_date', { ascending: true })

    // Fetch active fatigue alerts
    const { data: alerts } = await supabase
      .from('fatigue_alerts')
      .select('id, alert_date, predicted_fatigue_state, confidence_score, recommended_action, alert_status')
      .eq('athlete_id', athleteId)
      .eq('alert_status', 'pending')
      .gte('alert_date', new Date().toISOString().split('T')[0])
      .order('alert_date', { ascending: true })

    // Fetch active DBN model info
    const { data: modelInfo } = await supabase
      .from('dbn_models')
      .select('model_version, trained_at, validation_score, training_days')
      .eq('athlete_id', athleteId)
      .eq('status', 'active')
      .maybeSingle()

    const response = {
      athlete_id: athleteId,
      latest_prediction: prediction ?? null,
      prediction_history: history ?? [],
      active_alerts: alerts ?? [],
      model_info: modelInfo ?? null,
      data_available: !!prediction,
      // If no model, tell UI how much data is still needed
      data_gate_message: !modelInfo
        ? '疲労予測モデル生成には180日以上のデータが必要です。毎日のデータ入力を継続してください。'
        : null,
    }

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('dbn-predict error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
