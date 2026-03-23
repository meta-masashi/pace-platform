'use client'

/**
 * PoseOverlay Component
 * Canvas 2D でスティックフィギュア（MediaPipe キーポイント）を描画
 * Phase 3: 2D stick figure / Phase 4: Three.js 3D mesh (SMPLify-X)
 * ADR-004 準拠
 */

import { useEffect, useRef } from 'react'

// MediaPipe Pose 33 keypoint connections (stick figure edges)
const POSE_CONNECTIONS: [number, number][] = [
  // Face
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Left arm
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  // Right arm
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22],
  // Left leg
  [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  // Right leg
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],
]

// Keypoint color groups
const LANDMARK_COLORS: Record<number, string> = {
  // Head/face: blue
  0: '#3B82F6', 1: '#3B82F6', 2: '#3B82F6', 3: '#3B82F6',
  4: '#3B82F6', 5: '#3B82F6', 6: '#3B82F6', 7: '#3B82F6', 8: '#3B82F6',
  // Arms: green (left) / orange (right)
  11: '#22C55E', 13: '#22C55E', 15: '#22C55E', 17: '#22C55E', 19: '#22C55E', 21: '#22C55E',
  12: '#F97316', 14: '#F97316', 16: '#F97316', 18: '#F97316', 20: '#F97316', 22: '#F97316',
  // Core: purple
  23: '#A855F7', 24: '#A855F7',
  // Legs: cyan (left) / pink (right)
  25: '#06B6D4', 27: '#06B6D4', 29: '#06B6D4', 31: '#06B6D4',
  26: '#EC4899', 28: '#EC4899', 30: '#EC4899', 32: '#EC4899',
}

export interface PoseLandmark {
  x: number  // normalized [0, 1]
  y: number  // normalized [0, 1]
  z: number
  visibility: number
}

export interface FrameKeypoints {
  frame_index: number
  timestamp_ms: number
  landmarks: PoseLandmark[]
  pose_detected: boolean
}

interface PoseOverlayProps {
  /** Video element to overlay the canvas on */
  videoRef: React.RefObject<HTMLVideoElement>
  /** Keypoints from CV engine for current frame (or closest frame) */
  keypoints: FrameKeypoints | null
  /** Show confidence (visibility) threshold — hide landmarks below this */
  visibilityThreshold?: number
  /** Overlay opacity */
  alpha?: number
  className?: string
}

export function PoseOverlay({
  videoRef,
  keypoints,
  visibilityThreshold = 0.5,
  alpha = 0.85,
  className = '',
}: PoseOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Match canvas size to video display size
    const updateSize = () => {
      canvas.width = video.clientWidth
      canvas.height = video.clientHeight
    }
    updateSize()
    window.addEventListener('resize', updateSize)

    // Draw overlay
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!keypoints || !keypoints.pose_detected || keypoints.landmarks.length < 33) {
      return () => window.removeEventListener('resize', updateSize)
    }

    const { landmarks } = keypoints
    const w = canvas.width
    const h = canvas.height

    ctx.globalAlpha = alpha

    // Draw connections (skeleton)
    for (const [i, j] of POSE_CONNECTIONS) {
      const lmA = landmarks[i]
      const lmB = landmarks[j]
      if (!lmA || !lmB) continue
      if (lmA.visibility < visibilityThreshold || lmB.visibility < visibilityThreshold) continue

      ctx.beginPath()
      ctx.moveTo(lmA.x * w, lmA.y * h)
      ctx.lineTo(lmB.x * w, lmB.y * h)
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Draw keypoints
    for (let idx = 0; idx < landmarks.length; idx++) {
      const lm = landmarks[idx]
      if (!lm || lm.visibility < visibilityThreshold) continue

      const x = lm.x * w
      const y = lm.y * h
      const color = LANDMARK_COLORS[idx] ?? '#FFFFFF'

      ctx.beginPath()
      ctx.arc(x, y, 5, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    ctx.globalAlpha = 1.0
    return () => window.removeEventListener('resize', updateSize)
  }, [keypoints, videoRef, visibilityThreshold, alpha])

  return (
    <canvas
      ref={canvasRef}
      className={[
        'absolute inset-0 pointer-events-none',
        className,
      ].join(' ')}
      style={{ mixBlendMode: 'screen' }}
    />
  )
}
