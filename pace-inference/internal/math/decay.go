package mathutil

import "math"

// LambdaFromHalfLife converts half-life (days) to decay constant λ.
// λ = ln(2) / halfLifeDays
func LambdaFromHalfLife(halfLifeDays float64) float64 {
	if halfLifeDays <= 0 {
		return 0
	}
	return math.Ln2 / halfLifeDays
}

// HalfLifeFromLambda converts decay constant λ to half-life (days).
func HalfLifeFromLambda(lambda float64) float64 {
	if lambda <= 0 {
		return math.Inf(1)
	}
	return math.Ln2 / lambda
}

// CalculateDecayedRisk computes exponential decay: Risk(t) = Risk(0) × e^(-λ×t) × modifier.
// Result is clamped to [0, 1].
func CalculateDecayedRisk(initialRisk, lambda, daysSinceDetection, chronicModifier float64) float64 {
	if daysSinceDetection < 0 {
		return clamp(initialRisk, 0, 1)
	}
	if lambda <= 0 {
		return clamp(initialRisk*chronicModifier, 0, 1)
	}

	decayed := initialRisk * math.Exp(-lambda*daysSinceDetection)
	result := decayed * chronicModifier
	return clamp(result, 0, 1)
}

// DaysUntilThreshold calculates how many days until risk drops below threshold.
// Returns ceiling of the calculated days.
func DaysUntilThreshold(initialRisk, lambda, threshold float64) int {
	if initialRisk <= threshold {
		return 0
	}
	if lambda <= 0 || threshold <= 0 {
		return math.MaxInt32
	}

	days := -math.Log(threshold/initialRisk) / lambda
	return int(math.Ceil(days))
}
