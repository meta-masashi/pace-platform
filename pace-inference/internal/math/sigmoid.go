package mathutil

import "math"

// Sigmoid computes the logistic function: 1 / (1 + e^(-x)).
func Sigmoid(x float64) float64 {
	return 1.0 / (1.0 + math.Exp(-x))
}

// WilsonScoreInterval computes the 95% Wilson score confidence interval.
// p: probability (0-1), n: sample size (validDataDays)
// Returns [lower, upper] bounds.
func WilsonScoreInterval(p float64, n int) [2]float64 {
	if n <= 0 {
		return [2]float64{0, 1}
	}

	z := 1.96 // 95% CI
	nf := float64(n)
	z2 := z * z

	denominator := 1.0 + z2/nf
	center := p + z2/(2.0*nf)
	spread := z * math.Sqrt((p*(1-p)+z2/(4.0*nf))/nf)

	lower := (center - spread) / denominator
	upper := (center + spread) / denominator

	return [2]float64{
		clamp(lower, 0, 1),
		clamp(upper, 0, 1),
	}
}
