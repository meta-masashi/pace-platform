'use client'

/**
 * CVAnalysisPanel Component
 * CV 解析パネル — アスリート詳細ページに表示
 *
 * 機能:
 *   - 動画アップロード (VideoUploader)
 *   - CV ジョブ状態ポーリング (30秒ごと)
 *   - Before/After 動画比較 (マスク済み動画再生)
 *   - PoseOverlay スティックフィギュア表示
 *   - Top-5 CV エラー表示 (LLM SOAP 連携用)
 * Phase 3 Sprint 4
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { VideoUploader } from './VideoUploader'
import { PoseOverlay, type FrameKeypoints } from './PoseOverlay'
import { useSupabase } from '@/hooks/useSupabase'

interface CVError {
  error_type: string
  severity: number
  affected_frames: number
  description: string
  recommendation: string
}

interface CVJob {
  job_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'rejected'
  rejection_reason?: string
  processing_duration_sec?: number
  cv_errors?: CVError[]
  kinematics_confidence?: number
  masked_video_s3_key?: string
  completed_at?: string
}

interface CVAnalysisPanelProps {
  athleteId: string
  athleteName: string
  /** Existing latest job (pre-fetched from server) */
  initialJob?: CVJob | null
}

export function CVAnalysisPanel({
  athleteId,
  athleteName,
  initialJob = null,
}: CVAnalysisPanelProps) {
  const [currentJob, setCurrentJob] = useState<CVJob | null>(initialJob)
  const [maskedVideoUrl, setMaskedVideoUrl] = useState<string | null>(null)
  const [currentKeypoints, setCurrentKeypoints] = useState<FrameKeypoints | null>(null)
  const [showOverlay, setShowOverlay] = useState(true)
  const [pollingActive, setPollingActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const { session } = useSupabase()
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll job status when processing
  const pollJobStatus = useCallback(
    async (jobId: string) => {
      if (!session?.access_token) return
      try {
        const resp = await fetch(`/api/cv/job-status?job_id=${jobId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!resp.ok) return

        const job: CVJob = await resp.json()
        setCurrentJob(job)

        if (job.status === 'completed' || job.status === 'failed' || job.status === 'rejected') {
          setPollingActive(false)
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }

          // Fetch masked video presigned URL
          if (job.status === 'completed' && job.masked_video_s3_key) {
            // In production, fetch presigned URL from a dedicated endpoint
            // For now, use the s3 key as placeholder
            setMaskedVideoUrl(`/api/cv/video-url?key=${encodeURIComponent(job.masked_video_s3_key)}`)
          }
        }
      } catch (err) {
        console.error('Job status poll error:', err)
      }
    },
    [session],
  )

  useEffect(() => {
    if (currentJob && (currentJob.status === 'pending' || currentJob.status === 'processing')) {
      setPollingActive(true)
      pollingRef.current = setInterval(() => {
        pollJobStatus(currentJob.job_id)
      }, 10_000) // Poll every 10 seconds
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [currentJob?.job_id, currentJob?.status, pollJobStatus])

  const handleUploadComplete = useCallback(
    (jobId: string) => {
      setCurrentJob({ job_id: jobId, status: 'pending' })
    },
    [],
  )

  const getStatusLabel = (status: CVJob['status']) => {
    const labels: Record<string, string> = {
      pending: '⏳ 解析待機中',
      processing: '🔄 解析中...',
      completed: '✅ 解析完了',
      failed: '❌ 解析失敗',
      rejected: '⚠️ 動画不適格',
    }
    return labels[status] ?? status
  }

  const getSeverityColor = (severity: number) => {
    if (severity >= 0.7) return 'text-red-600 bg-red-50 border-red-200'
    if (severity >= 0.4) return 'text-orange-600 bg-orange-50 border-orange-200'
    return 'text-yellow-600 bg-yellow-50 border-yellow-200'
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">CV動作解析</h3>
          <p className="text-sm text-gray-500">{athleteName} の動作評価</p>
        </div>
        {currentJob?.status === 'completed' && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">姿勢オーバーレイ</span>
            <button
              onClick={() => setShowOverlay(!showOverlay)}
              className={[
                'relative w-10 h-6 rounded-full transition-colors',
                showOverlay ? 'bg-blue-500' : 'bg-gray-200',
              ].join(' ')}
            >
              <span
                className={[
                  'absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform',
                  showOverlay ? 'translate-x-4' : 'translate-x-0',
                ].join(' ')}
              />
            </button>
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Video section */}
        {currentJob?.status === 'completed' && maskedVideoUrl ? (
          <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
            <video
              ref={videoRef}
              src={maskedVideoUrl}
              controls
              className="w-full h-full object-contain"
            />
            {showOverlay && (
              <PoseOverlay
                videoRef={videoRef as React.RefObject<HTMLVideoElement>}
                keypoints={currentKeypoints}
              />
            )}
          </div>
        ) : !currentJob ? (
          <VideoUploader
            athleteId={athleteId}
            onUploadComplete={handleUploadComplete}
            onError={(err) => console.error('Upload error:', err)}
          />
        ) : null}

        {/* Job status */}
        {currentJob && (
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium">
              {getStatusLabel(currentJob.status)}
            </span>
            {currentJob.processing_duration_sec && (
              <span className="text-xs text-gray-500">
                処理時間: {currentJob.processing_duration_sec.toFixed(1)}s
              </span>
            )}
            {currentJob.status === 'rejected' && currentJob.rejection_reason && (
              <span className="text-xs text-red-500">{currentJob.rejection_reason}</span>
            )}
          </div>
        )}

        {/* CV Errors (Top-5) */}
        {currentJob?.status === 'completed' && currentJob.cv_errors && currentJob.cv_errors.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">
              動作エラー Top-{currentJob.cv_errors.length}
              {currentJob.kinematics_confidence && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  (解析信頼度: {(currentJob.kinematics_confidence * 100).toFixed(0)}%)
                </span>
              )}
            </h4>
            <div className="space-y-2">
              {currentJob.cv_errors.map((err, i) => (
                <div
                  key={i}
                  className={[
                    'border rounded-lg p-3',
                    getSeverityColor(err.severity),
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{err.description}</p>
                      <p className="text-xs mt-1 opacity-80">{err.recommendation}</p>
                    </div>
                    <div className="flex-shrink-0">
                      <div className="text-xs font-bold">
                        {(err.severity * 100).toFixed(0)}%
                      </div>
                      <div className="w-12 h-1.5 bg-gray-200 rounded-full mt-1">
                        <div
                          className="h-1.5 rounded-full bg-current"
                          style={{ width: `${err.severity * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Re-upload button */}
        {currentJob?.status === 'completed' && (
          <button
            onClick={() => {
              setCurrentJob(null)
              setMaskedVideoUrl(null)
            }}
            className="w-full py-2 px-4 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            新しい動画で再解析
          </button>
        )}
      </div>
    </div>
  )
}
