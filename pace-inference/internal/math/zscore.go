package mathutil

import "math"

const (
	// ZScoreMinDays is the minimum data days for Z-Score calculation.
	ZScoreMinDays = 14
	// ZScoreWindowDays is the rolling window size for Z-Score.
	ZScoreWindowDays = 28
	// SigmaEpsilon prevents division by near-zero sigma.
	SigmaEpsilon = 1e-6
)

// GraduatedZScoreWeight returns the weight applied to Z-Scores based on data days.
// Days 0-13: 0.0 (no Z-Score)
// Days 14-21: 0.5 (learning early)
// Days 22-27: 0.75 (learning late)
// Days 28+: 1.0 (full mode)
func GraduatedZScoreWeight(validDataDays int) float64 {
	switch {
	case validDataDays < ZScoreMinDays:
		return 0.0
	case validDataDays < 22:
		return 0.5
	case validDataDays < ZScoreWindowDays:
		return 0.75
	default:
		return 1.0
	}
}

// CalculateZScores computes Z-Scores for each subjective metric over a 28-day window.
// Returns empty map if validDataDays < 14.
// Applies graduated weighting to smooth the Day 14 cliff.
func CalculateZScores(todayScores map[string]float64, history []map[string]float64, validDataDays int) map[string]float64 {
	zScores := make(map[string]float64)

	weight := GraduatedZScoreWeight(validDataDays)
	if weight == 0 {
		return zScores
	}

	// Use last 28 days of history
	windowStart := 0
	if len(history) > ZScoreWindowDays {
		windowStart = len(history) - ZScoreWindowDays
	}
	window := history[windowStart:]

	if len(window) < ZScoreMinDays {
		return zScores
	}

	metrics := []string{"sleep_quality", "fatigue", "mood", "muscle_soreness", "stress_level", "pain_nrs"}

	for _, metric := range metrics {
		values := make([]float64, 0, len(window))
		for _, day := range window {
			if v, ok := day[metric]; ok {
				values = append(values, v)
			}
		}

		n := len(values)
		if n == 0 {
			continue
		}

		// Mean
		var sum float64
		for _, v := range values {
			sum += v
		}
		mean := sum / float64(n)

		// Variance
		var variance float64
		for _, v := range values {
			variance += (v - mean) * (v - mean)
		}
		variance /= float64(n)
		sigma := math.Sqrt(variance)

		if sigma < SigmaEpsilon {
			zScores[metric] = 0 // No variation = no signal
			continue
		}

		todayValue, ok := todayScores[metric]
		if !ok {
			continue
		}

		// Apply graduated weight
		rawZ := (todayValue - mean) / sigma
		zScores[metric] = rawZ * weight
	}

	return zScores
}
