package mathutil

import "math"

const (
	// MonotonyWindowDays is the rolling window for monotony calculation.
	MonotonyWindowDays = 7
	// MonotonyHighFallback is returned when sigma ≈ 0 (all days identical load).
	MonotonyHighFallback = 3.0
)

// CalculateMonotonyIndex computes Monotony = mean(7d loads) / sigma(7d loads).
// Returns MonotonyHighFallback if sigma ≈ 0.
func CalculateMonotonyIndex(loads []float64) float64 {
	if len(loads) == 0 {
		return 0
	}

	// Use last 7 days
	start := 0
	if len(loads) > MonotonyWindowDays {
		start = len(loads) - MonotonyWindowDays
	}
	recent := loads[start:]

	n := float64(len(recent))
	var sum float64
	for _, v := range recent {
		sum += v
	}
	mean := sum / n

	var variance float64
	for _, v := range recent {
		variance += (v - mean) * (v - mean)
	}
	variance /= n
	sigma := math.Sqrt(variance)

	if sigma < SigmaEpsilon {
		return MonotonyHighFallback
	}

	return mean / sigma
}
