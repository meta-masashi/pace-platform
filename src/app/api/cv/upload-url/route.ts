/**
 * POST /api/cv/upload-url
 * S3 Presigned URL 生成エンドポイント (ADR-007, ADR-015)
 *
 * フロー:
 *   1. クライアント (AT/PT) が athlete_id, file_name, content_type を送信
 *   2. このAPIが S3 Raw Bucket の presigned PUT URL を生成して返す
 *   3. クライアントが S3 に直接アップロード
 *   4. アップロード完了後、クライアントが /api/cv/submit-job を呼び出す
 *
 * セキュリティ:
 *   - Staff (AT/PT/Master) のみアクセス可能
 *   - athlete_id は呼び出し元チームに属していることを検証
 *   - ファイルサイズ制限: 500MB (S3 Content-Length-Range 条件)
 *   - 許可拡張子: .mp4, .mov, .avi, .webm のみ
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuidv4 } from 'uuid'

const ALLOWED_CONTENT_TYPES = [
  'video/mp4',
  'video/quicktime',   // .mov
  'video/x-msvideo',  // .avi
  'video/webm',
]
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024  // 500 MB
const PRESIGNED_URL_EXPIRY_SEC = 3600           // 1 hour

const s3Client = new S3Client({
  region: process.env.AWS_REGION ?? 'ap-northeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  },
})

// ── Request / Response types ──────────────────────────────────────────
interface UploadUrlRequest {
  athlete_id: string
  file_name: string
  content_type: string
  file_size_bytes: number
}

interface UploadUrlResponse {
  upload_url: string
  s3_key: string
  video_upload_id: string
  expires_at: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Auth check
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse body
  let body: UploadUrlRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { athlete_id, file_name, content_type, file_size_bytes } = body

  // 3. Validation
  if (!athlete_id || !file_name || !content_type) {
    return NextResponse.json(
      { error: 'athlete_id, file_name, content_type are required' },
      { status: 400 },
    )
  }
  if (!ALLOWED_CONTENT_TYPES.includes(content_type)) {
    return NextResponse.json(
      {
        error: 'Unsupported video format',
        allowed: ALLOWED_CONTENT_TYPES,
      },
      { status: 422 },
    )
  }
  if (file_size_bytes > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File size ${file_size_bytes} exceeds limit of ${MAX_FILE_SIZE_BYTES} bytes` },
      { status: 422 },
    )
  }

  // 4. Verify caller is staff on athlete's team
  const { data: staffRow } = await supabase
    .from('team_staff')
    .select('role, team_id')
    .eq('user_id', user.id)
    .in('role', ['master', 'athletic_trainer', 'pt'])
    .single()

  if (!staffRow) {
    return NextResponse.json({ error: 'Forbidden: Staff access required' }, { status: 403 })
  }

  const { data: athleteRow } = await supabase
    .from('athletes')
    .select('id, team_id')
    .eq('id', athlete_id)
    .eq('team_id', staffRow.team_id)
    .single()

  if (!athleteRow) {
    return NextResponse.json(
      { error: 'Athlete not found or not in your team' },
      { status: 404 },
    )
  }

  // 5. Generate unique S3 key
  const videoUploadId = uuidv4()
  const ext = file_name.split('.').pop() ?? 'mp4'
  const s3Key = `raw/${athleteRow.team_id}/${athlete_id}/${videoUploadId}/original.${ext}`

  // 6. Create video_uploads record (PENDING)
  const { error: insertError } = await supabase.from('video_uploads').insert({
    id: videoUploadId,
    athlete_id,
    team_id: athleteRow.team_id,
    uploaded_by: user.id,
    original_filename: file_name,
    content_type,
    file_size_bytes,
    raw_s3_key: s3Key,
    status: 'pending_upload',
  })

  if (insertError) {
    console.error('video_uploads insert error:', insertError)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  // 7. Generate S3 presigned PUT URL
  const bucket = process.env.S3_RAW_BUCKET
  if (!bucket) {
    return NextResponse.json({ error: 'S3_RAW_BUCKET not configured' }, { status: 500 })
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ContentType: content_type,
    ContentLength: file_size_bytes,
    Metadata: {
      'video-upload-id': videoUploadId,
      'athlete-id': athlete_id,
      'team-id': athleteRow.team_id,
      'uploaded-by': user.id,
    },
    ServerSideEncryption: 'AES256',
  })

  let uploadUrl: string
  try {
    uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: PRESIGNED_URL_EXPIRY_SEC,
    })
  } catch (err) {
    console.error('S3 presign error:', err)
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 })
  }

  const expiresAt = new Date(Date.now() + PRESIGNED_URL_EXPIRY_SEC * 1000).toISOString()

  const response: UploadUrlResponse = {
    upload_url: uploadUrl,
    s3_key: s3Key,
    video_upload_id: videoUploadId,
    expires_at: expiresAt,
  }

  return NextResponse.json(response, { status: 200 })
}
