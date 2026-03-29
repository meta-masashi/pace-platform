/**
 * GET /api/cv/job-status?job_id=xxx
 * CV ジョブ状態取得 + 結果取得 (ADR-013, ADR-016)
 *
 * 完了時: cv_errors (Top-5 kinematic errors) を返す
 * これが LLM Context Injection (ADR-009/ADR-016) の入力データになる
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Auth
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.slice(7)
  )
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const jobId = req.nextUrl.searchParams.get('job_id')
  if (!jobId) {
    return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
  }

  // Staff check
  const { data: staffRow } = await supabase
    .from('team_staff')
    .select('team_id')
    .eq('user_id', user.id)
    .single()

  if (!staffRow) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch job
  const { data: job } = await supabase
    .from('cv_jobs')
    .select(`
      id,
      athlete_id,
      status,
      rejection_reason,
      masked_video_s3_key,
      processing_duration_sec,
      result_payload,
      created_at,
      completed_at
    `)
    .eq('id', jobId)
    .eq('team_id', staffRow.team_id)
    .single()

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Build response
  const result: any = {
    job_id: job.id,
    athlete_id: job.athlete_id,
    status: job.status,
    rejection_reason: job.rejection_reason ?? null,
    processing_duration_sec: job.processing_duration_sec ?? null,
    created_at: job.created_at,
    completed_at: job.completed_at ?? null,
  }

  // If completed, include cv_errors for LLM context injection
  if (job.status === 'completed' && job.result_payload) {
    const payload = job.result_payload as any
    result.cv_errors = payload.cv_errors ?? []
    result.kinematics_confidence = (payload.kinematics_vector as any)?.confidence_score ?? null

    // Generate masked video presigned URL (1-hour expiry)
    if (job.masked_video_s3_key) {
      // URL generation delegated to client to avoid AWS SDK in edge function
      result.masked_video_s3_key = job.masked_video_s3_key
    }
  }

  return NextResponse.json(result)
}
