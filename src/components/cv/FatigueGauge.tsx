'use client'

/**
 * FatigueGauge Component
 * DBN 予測疲労レベルをビジュアル表示 (ADR-014)
 *
 * 表示データ: dbn_predictions テーブルから取得
 * - predicted_fatigue_state: low / moderate / high
 * - confidence_score: 0.0 – 1.0
 * - 確率分布バー (low / moderate / high の確率)
 */

interface DbnPrediction {
  prediction_date: string
  predicted_fatigue_state: 'low' | 'moderate' | 'high'
  fatigue_probability_low: number
  fatigue_probability_moderate: number
  fatigue_probability_high: number
  confidence_score: number
}

interface FatigueGaugeProps {
  prediction: DbnPrediction | null
  /** Loading state */
  loading?: boolean
  /** Show probability distribution bars */
  showDistribution?: boolean
}

const STATE_CONFIG = {
  low: {
    label: '低疲労',
    color: 'text-green-600',
    bg: 'bg-green-500',
    lightBg: 'bg-green-50',
    border: 'border-green-200',
    emoji: '🟢',
    advice: 'コンディション良好。通常メニューで進めてください。',
  },
  moderate: {
    label: '中程度疲労',
    color: 'text-orange-600',
    bg: 'bg-orange-500',
    lightBg: 'bg-orange-50',
    border: 'border-orange-200',
    emoji: '🟡',
    advice: '疲労蓄積に注意。回復ワークを組み込むことを推奨します。',
  },
  high: {
    label: '高疲労',
    color: 'text-red-600',
    bg: 'bg-red-500',
    lightBg: 'bg-red-50',
    border: 'border-red-200',
    emoji: '🔴',
    advice: '⚠️ 高疲労リスク。翌日の練習強度を50%以下に調整することを推奨します。',
  },
} as const

export function FatigueGauge({
  prediction,
  loading = false,
  showDistribution = true,
}: FatigueGaugeProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="h-12 bg-gray-100 rounded mb-3" />
        <div className="h-3 bg-gray-100 rounded w-2/3" />
      </div>
    )
  }

  if (!prediction) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-700 mb-2">疲労予測 (DBN)</h3>
        <p className="text-gray-400 text-sm">
          疲労予測データがありません。<br />
          180日以上のデータ蓄積後に自動生成されます。
        </p>
      </div>
    )
  }

  const config = STATE_CONFIG[prediction.predicted_fatigue_state]
  const predDate = new Date(prediction.prediction_date).toLocaleDateString('ja-JP', {
    month: 'long', day: 'numeric', weekday: 'short',
  })

  return (
    <div className={['bg-white rounded-xl border p-6', config.border].join(' ')}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-700">疲労予測 (DBN)</h3>
        <span className="text-xs text-gray-400">{predDate}</span>
      </div>

      {/* Main state indicator */}
      <div className={['rounded-lg p-4 mb-4', config.lightBg].join(' ')}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{config.emoji}</span>
          <div>
            <p className={['text-xl font-bold', config.color].join(' ')}>
              {config.label}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              信頼度: {(prediction.confidence_score * 100).toFixed(0)}%
            </p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mt-3">{config.advice}</p>
      </div>

      {/* Probability distribution */}
      {showDistribution && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">確率分布</p>
          {[
            { key: 'low' as const, label: '低疲労', prob: prediction.fatigue_probability_low },
            { key: 'moderate' as const, label: '中程度', prob: prediction.fatigue_probability_moderate },
            { key: 'high' as const, label: '高疲労', prob: prediction.fatigue_probability_high },
          ].map(({ key, label, prob }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-12 text-right">{label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-2">
                <div
                  className={['h-2 rounded-full transition-all duration-500', STATE_CONFIG[key].bg].join(' ')}
                  style={{ width: `${prob * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 w-8">
                {(prob * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
