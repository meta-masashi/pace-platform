/**
 * POST /api/cv/submit-job
 * S3 アップロード完了後に CV 解析ジョブを SQS に投入 (ADR-015)
 *
 * フロー:
 *   1. クライアントが S3 アップロード完了後にこのAPIを呼び出す
 *   2. video_uploads レコードを uploaded に更新
 *   3. cv_jobs レコードを作成 (pending)
 *   4. pace-cv-engine に POST /api/v1/jobs/submit でジョブを投入
 *   5. cv_jobs.id (job_id) をクライアントに返す
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'

interface SubmitJobRequest {
  video_upload_id: string
  athlete_id: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // 1. Auth
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

  // 2. Parse
  let body: SubmitJobRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { video_upload_id, athlete_id } = body
  if (!video_upload_id || !athlete_id) {
    return NextResponse.json(
      { error: 'video_upload_id and athlete_id are required' },
      { status: 400 },
    )
  }

  // 3. Verify video_upload belongs to caller's team
  const { data: staffRow } = await supabase
    .from('team_staff')
    .select('team_id')
    .eq('user_id', user.id)
    .single()

  if (!staffRow) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: upload } = await supabase
    .from('video_uploads')
    .select('id, athlete_id, team_id, raw_s3_key, status')
    .eq('id', video_upload_id)
    .eq('team_id', staffRow.team_id)
    .single()

  if (!upload) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
  }
  if (upload.status !== 'pending_upload') {
    return NextResponse.json(
      { error: `Upload already processed: ${upload.status}` },
      { status: 409 },
    )
  }

  // 4. Update video_uploads → uploaded
  await supabase
    .from('video_uploads')
    .update({ status: 'uploaded', uploaded_at: new Date().toISOString() })
    .eq('id', video_upload_id)

  // 5. Create cv_jobs record
  const jobId = uuidv4()
  const { error: jobInsertError } = await supabase.from('cv_jobs').insert({
    id: jobId,
    athlete_id,
    team_id: staffRow.team_id,
    video_upload_id,
    raw_video_s3_key: upload.raw_s3_key,
    status: 'pending',
    submitted_by: user.id,
  })

  if (jobInsertError) {
    console.error('cv_jobs insert error:', jobInsertError)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  // 6. Submit to CV Engine (SQS via pace-cv-engine API)
  const cvEngineUrl = process.env.CV_ENGINE_URL
  if (cvEngineUrl) {
    try {
      const cvResp = await fetch(`${cvEngineUrl}/api/v1/jobs/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': process.env.CV_INTERNAL_TOKEN ?? '',
        },
        body: JSON.stringify({
          job_id: jobId,
          athlete_id,
          team_id: staffRow.team_id,
          video_upload_id,
          raw_video_s3_key: upload.raw_s3_key,
        }),
      })

      if (!cvResp.ok) {
        console.error('CV Engine submit failed:', cvResp.status, await cvResp.text())
        // Non-fatal: mark job for retry
        await supabase
          .from('cv_jobs')
          .update({ status: 'pending', error_message: 'CV Engine unavailable, will retry' })
          .eq('id', jobId)
      }
    } catch (err) {
      console.error('CV Engine unreachable:', err)
      // Non-fatal: SQS consumer will pick up from DB
    }
  }

  return NextResponse.json({
    job_id: jobId,
    status: 'queued',
    message: 'CV analysis job submitted successfully',
  })
}
