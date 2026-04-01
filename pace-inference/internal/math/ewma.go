// Package mathutil provides pure mathematical functions for the inference engine.
package mathutil

// CalculateEWMA computes Exponential Weighted Moving Average.
// Formula: S_t = α * x_t + (1 - α) * S_{t-1}, where α = 2 / (span + 1)
func CalculateEWMA(values []float64, span int) float64 {
	if len(values) == 0 || span <= 0 {
		return 0
	}

	alpha := 2.0 / (float64(span) + 1.0)
	ewma := values[0]

	for i := 1; i < len(values); i++ {
		ewma = alpha*values[i] + (1-alpha)*ewma
	}

	return ewma
}

// CalculateACWR computes Acute:Chronic Workload Ratio using EWMA.
// acuteLambda: 0.25 (7-day equivalent), chronicLambda: 0.07 (28-day equivalent)
func CalculateACWR(loads []float64, acuteSpan, chronicSpan int) (acwr, acuteEWMA, chronicEWMA float64) {
	if len(loads) == 0 {
		return 0, 0, 0
	}

	acuteEWMA = CalculateEWMA(loads, acuteSpan)
	chronicEWMA = CalculateEWMA(loads, chronicSpan)

	if chronicEWMA == 0 {
		return 0, acuteEWMA, chronicEWMA
	}

	acwr = acuteEWMA / chronicEWMA
	return acwr, acuteEWMA, chronicEWMA
}

// CompositeReadiness calculates the evidence-based readiness score (0-100).
// ACWR Sweet Spot (0.8-1.3) = 100, penalty for deviation.
// Wellness average Z-Score contributes 40%.
func CompositeReadiness(acwr float64, zScores map[string]float64) float64 {
	// ACWR Score: 100 if in Sweet Spot, else penalty
	var acwrScore float64
	if acwr >= 0.8 && acwr <= 1.3 {
		acwrScore = 100
	} else {
		acwrScore = max(0, 100-abs(acwr-1.05)*100)
	}

	// Wellness Score from average Z
	var zSum float64
	var zCount int
	for _, z := range zScores {
		zSum += z
		zCount++
	}
	var avgZ float64
	if zCount > 0 {
		avgZ = zSum / float64(zCount)
	}
	wellnessScore := clamp(50+avgZ*25, 0, 100)

	// Composite: 40% ACWR + 40% Wellness + 20% baseline
	composite := acwrScore*0.4 + wellnessScore*0.4 + 20
	return clamp(composite, 0, 100)
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

func max(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
