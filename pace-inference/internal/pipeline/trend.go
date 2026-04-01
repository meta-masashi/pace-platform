package pipeline

import (
	"fmt"

	"github.com/meta-masashi/pace-platform/pace-inference/internal/domain"
)

// TrendConfig defines which metrics to monitor and their thresholds.
type TrendConfig struct {
	Metric    string
	Label     string  // Japanese
	LabelEn   string
	Threshold float64
	Direction string  // "rising" = bad when approaching from below, "falling" = bad when approaching from above
}

var monitoredTrends = []TrendConfig{
	{"acwr", "ACWR", "ACWR", 1.5, "rising"},
	{"monotony", "単調性", "Monotony", 2.0, "rising"},
	{"z_sleep_quality", "睡眠Z-Score", "Sleep Z-Score", -1.5, "falling"},
	{"z_fatigue", "疲労Z-Score", "Fatigue Z-Score", -1.5, "falling"},
}

// DetectTrends analyzes the last 3 data points for each metric.
// If linear extrapolation (3 days forward) crosses a threshold, emit a TrendNotice.
func DetectTrends(state *PipelineState) []domain.TrendNotice {
	notices := make([]domain.TrendNotice, 0)

	if len(state.History) < 3 {
		return notices
	}

	// Extract last 3 days of metric values from history
	recent := state.History[len(state.History)-3:]

	for _, tc := range monitoredTrends {
		values := extractMetricValues(recent, tc.Metric, state)
		if len(values) < 3 {
			continue
		}

		// Simple linear regression: y = a + b*x
		slope := linearSlope(values)
		current := values[len(values)-1]
		projected := current + slope*3 // 3 days forward

		var triggered bool
		if tc.Direction == "rising" {
			triggered = current < tc.Threshold && projected >= tc.Threshold && slope > 0
		} else { // falling
			triggered = current > tc.Threshold && projected <= tc.Threshold && slope < 0
		}

		if triggered {
			notices = append(notices, domain.TrendNotice{
				Metric:       tc.Metric,
				Direction:    tc.Direction,
				CurrentValue: current,
				Threshold:    tc.Threshold,
				Message:      fmt.Sprintf("傾向通知: %sが閾値に接近中（%.2f → %.2f）", tc.Label, current, tc.Threshold),
				MessageEn:    fmt.Sprintf("Trend notice: %s approaching threshold (%.2f → %.2f)", tc.LabelEn, current, tc.Threshold),
			})
		}
	}

	return notices
}

func extractMetricValues(history []domain.DailyInput, metric string, state *PipelineState) []float64 {
	values := make([]float64, 0, len(history))

	for _, h := range history {
		switch metric {
		case "acwr":
			// Use session load as proxy (actual ACWR computed per-day is not stored in history)
			values = append(values, h.SessionLoad)
		case "monotony":
			values = append(values, h.SessionLoad) // proxy
		case "z_sleep_quality":
			values = append(values, h.SubjectiveScores.SleepQuality)
		case "z_fatigue":
			values = append(values, h.SubjectiveScores.Fatigue)
		}
	}

	// For ACWR and monotony, use the actual computed values if available
	if metric == "acwr" && state.FeatureVector.ACWR > 0 {
		// Replace last value with actual computed ACWR
		if len(values) > 0 {
			values[len(values)-1] = state.FeatureVector.ACWR
		}
	}

	return values
}

// linearSlope computes the slope of a simple linear regression.
func linearSlope(values []float64) float64 {
	n := float64(len(values))
	if n < 2 {
		return 0
	}

	var sumX, sumY, sumXY, sumX2 float64
	for i, v := range values {
		x := float64(i)
		sumX += x
		sumY += v
		sumXY += x * v
		sumX2 += x * x
	}

	denominator := n*sumX2 - sumX*sumX
	if denominator == 0 {
		return 0
	}

	return (n*sumXY - sumX*sumY) / denominator
}
