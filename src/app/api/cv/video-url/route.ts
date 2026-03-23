/**
 * GET /api/cv/video-url?key=xxx
 * マスク済み動画の S3 Presigned GET URL を生成
 * Before/After UI でのストリーミング再生用 (ADR-007)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const s3Client = new S3Client({
  region: process.env.AWS_REGION ?? 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  },
})

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7))
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: staffRow } = await supabase
    .from('team_staff').select('team_id').eq('user_id', user.id).single()
  if (!staffRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const s3Key = req.nextUrl.searchParams.get('key')
  if (!s3Key || !s3Key.startsWith('masked/')) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  }

  const { data: job } = await supabase
    .from('cv_jobs').select('id').eq('masked_video_s3_key', s3Key).eq('team_id', staffRow.team_id).single()
  if (!job) return NextResponse.json({ error: 'Access denied' }, { status: 404 })

  const bucket = process.env.S3_MASKED_BUCKET
  if (!bucket) return NextResponse.json({ error: 'S3_MASKED_BUCKET not configured' }, { status: 500 })

  try {
    const url = await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: bucket, Key: s3Key }), { expiresIn: 3600 })
    return NextResponse.json({ url, expires_in: 3600 })
  } catch {
    return NextResponse.json({ error: 'Failed to generate video URL' }, { status: 500 })
  }
}
