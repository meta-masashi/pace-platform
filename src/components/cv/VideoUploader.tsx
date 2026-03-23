'use client'

/**
 * VideoUploader Component
 * S3 Presigned URL による直接アップロード + CV ジョブ投入 (ADR-007, ADR-015)
 * Phase 3 Sprint 2 実装
 */

import { useCallback, useRef, useState } from 'react'
import { useSupabase } from '@/hooks/useSupabase'

interface VideoUploaderProps {
  athleteId: string
  onUploadComplete?: (jobId: string) => void
  onError?: (error: string) => void
  className?: string
}

type UploadState =
  | { phase: 'idle' }
  | { phase: 'validating' }
  | { phase: 'requesting_url' }
  | { phase: 'uploading'; progress: number }
  | { phase: 'submitting_job' }
  | { phase: 'queued'; jobId: string }
  | { phase: 'error'; message: string }

const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm']
const MAX_SIZE_MB = 500

export function VideoUploader({
  athleteId,
  onUploadComplete,
  onError,
  className = '',
}: VideoUploaderProps) {
  const [state, setState] = useState<UploadState>({ phase: 'idle' })
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { supabase, session } = useSupabase()

  const handleFile = useCallback(
    async (file: File) => {
      // Validate file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        const msg = `非対応形式: ${file.type}。MP4, MOV, AVI, WebM のみ対応。`
        setState({ phase: 'error', message: msg })
        onError?.(msg)
        return
      }

      // Validate file size
      const sizeMB = file.size / (1024 * 1024)
      if (sizeMB > MAX_SIZE_MB) {
        const msg = `ファイルサイズが上限を超えています (${sizeMB.toFixed(1)} MB > ${MAX_SIZE_MB} MB)`
        setState({ phase: 'error', message: msg })
        onError?.(msg)
        return
      }

      if (!session?.access_token) {
        const msg = 'セッションが切れています。再ログインしてください。'
        setState({ phase: 'error', message: msg })
        onError?.(msg)
        return
      }

      try {
        // Step 1: Get presigned URL
        setState({ phase: 'requesting_url' })
        const urlResp = await fetch('/api/cv/upload-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            athlete_id: athleteId,
            file_name: file.name,
            content_type: file.type,
            file_size_bytes: file.size,
          }),
        })

        if (!urlResp.ok) {
          const err = await urlResp.json()
          throw new Error(err.error ?? 'アップロードURL取得失敗')
        }

        const { upload_url, video_upload_id } = await urlResp.json()

        // Step 2: Upload directly to S3
        setState({ phase: 'uploading', progress: 0 })

        await uploadWithProgress(file, upload_url, (progress) => {
          setState({ phase: 'uploading', progress })
        })

        // Step 3: Submit CV job
        setState({ phase: 'submitting_job' })
        const jobResp = await fetch('/api/cv/submit-job', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            video_upload_id,
            athlete_id: athleteId,
          }),
        })

        if (!jobResp.ok) {
          const err = await jobResp.json()
          throw new Error(err.error ?? 'ジョブ投入失敗')
        }

        const { job_id } = await jobResp.json()
        setState({ phase: 'queued', jobId: job_id })
        onUploadComplete?.(job_id)
      } catch (err) {
        const message = err instanceof Error ? err.message : '予期せぬエラーが発生しました'
        setState({ phase: 'error', message })
        onError?.(message)
      }
    },
    [athleteId, session, onUploadComplete, onError],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  return (
    <div className={className}>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => state.phase === 'idle' && fileInputRef.current?.click()}
        className={[
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400',
          state.phase !== 'idle' && state.phase !== 'error' && state.phase !== 'queued'
            ? 'cursor-not-allowed opacity-60'
            : '',
        ].join(' ')}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/x-msvideo,video/webm"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />

        <UploadStateDisplay state={state} />
      </div>

      {state.phase === 'error' && (
        <button
          onClick={() => setState({ phase: 'idle' })}
          className="mt-2 text-sm text-blue-600 underline"
        >
          再試行
        </button>
      )}
    </div>
  )
}

function UploadStateDisplay({ state }: { state: UploadState }) {
  switch (state.phase) {
    case 'idle':
      return (
        <>
          <div className="text-4xl mb-3">🎬</div>
          <p className="text-gray-600 font-medium">動画をドラッグ&ドロップ</p>
          <p className="text-gray-400 text-sm mt-1">または クリックして選択</p>
          <p className="text-gray-400 text-xs mt-2">MP4, MOV, AVI, WebM / 最大 500MB</p>
        </>
      )
    case 'validating':
    case 'requesting_url':
      return (
        <>
          <Spinner />
          <p className="text-gray-600 mt-2">準備中...</p>
        </>
      )
    case 'uploading':
      return (
        <>
          <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
            <div
              className="bg-blue-500 h-3 rounded-full transition-all duration-200"
              style={{ width: `${state.progress}%` }}
            />
          </div>
          <p className="text-gray-600 text-sm">アップロード中... {state.progress}%</p>
        </>
      )
    case 'submitting_job':
      return (
        <>
          <Spinner />
          <p className="text-gray-600 mt-2">CV解析ジョブを投入中...</p>
        </>
      )
    case 'queued':
      return (
        <>
          <div className="text-4xl mb-2">✅</div>
          <p className="text-green-600 font-medium">解析キューに追加されました</p>
          <p className="text-gray-400 text-xs mt-1">Job ID: {state.jobId.slice(0, 8)}...</p>
          <p className="text-gray-500 text-sm mt-1">完了まで最大90秒かかります</p>
        </>
      )
    case 'error':
      return (
        <>
          <div className="text-4xl mb-2">⚠️</div>
          <p className="text-red-600 font-medium">エラー</p>
          <p className="text-red-500 text-sm mt-1">{state.message}</p>
        </>
      )
  }
}

function Spinner() {
  return (
    <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto" />
  )
}

async function uploadWithProgress(
  file: File,
  url: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        resolve()
      } else {
        reject(new Error(`S3 upload failed: ${xhr.status}`))
      }
    })
    xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.send(file)
  })
}
