package pipeline

import (
	"context"
	"math"

	"github.com/meta-masashi/pace-platform/pace-inference/internal/domain"
	mathutil "github.com/meta-masashi/pace-platform/pace-inference/internal/math"
)

// Default body parts for risk score calculation.
var defaultBodyParts = []string{
	"knee", "ankle", "hip", "shoulder", "lower_back",
	"hamstring", "quadriceps", "calf", "general",
}

// Tissue-to-body-part mapping.
var tissueToBodyParts = map[domain.TissueCategory][]string{
	domain.TissueMetabolic:      {"general"},
	domain.TissueStructuralSoft: {"hamstring", "quadriceps", "calf"},
	domain.TissueStructuralHard: {"knee", "ankle", "hip", "lower_back"},
	domain.TissueNeuromotor:     {"shoulder", "general"},
}

// Node3Inference computes risk scores, Bayesian posteriors, and confidence intervals.
func Node3Inference(_ context.Context, state *PipelineState) error {
	fv := state.FeatureVector
	w := state.Config.FeatureWeights

	// ACWR excess
	acwrExcess := math.Max(0, fv.ACWR-1.3)

	// Wellness decline (Z <= -1.0)
	var wellnessDecline float64
	for _, z := range fv.ZScores {
		if z <= -1.0 {
			wellnessDecline += math.Abs(z)
		}
	}

	// Monotony excess
	monotonyExcess := math.Max(0, fv.MonotonyIndex-1.5)

	// Risk scores per body part
	bodyParts := make(map[string]bool)
	for _, bp := range defaultBodyParts {
		bodyParts[bp] = true
	}
	for bp := range state.Context.RiskMultipliers {
		bodyParts[bp] = true
	}

	riskScores := make(map[string]float64)
	for bp := range bodyParts {
		// Tissue contribution
		var tissueContrib float64
		for cat, parts := range tissueToBodyParts {
			for _, p := range parts {
				if p == bp {
					damage := fv.TissueDamage[cat]
					if damage > 0.5 {
						tissueContrib += damage - 0.5
					}
				}
			}
		}

		multiplier := 1.0
		if m, ok := state.Context.RiskMultipliers[bp]; ok {
			multiplier = m
		}

		weightedSum := w.ACWRExcess*acwrExcess +
			w.WellnessDecline*wellnessDecline*0.2 +
			w.InjuryHistory*tissueContrib +
			w.MonotonyInfo*monotonyExcess

		rawRisk := mathutil.Sigmoid(weightedSum - 3.0)
		riskScores[bp] = math.Min(1.0, rawRisk*multiplier)
	}

	// Bayesian posteriors
	posteriors := make(map[string]float64)
	var totalPosterior float64
	for bp, risk := range riskScores {
		prior := 0.05 // default
		if p, ok := state.Context.BayesianPriors[bp]; ok {
			prior = p
		}
		likelihood := 1.0 + risk*5.0
		raw := prior * likelihood
		posteriors[bp] = raw
		totalPosterior += raw
	}
	if totalPosterior > 0 {
		for bp := range posteriors {
			posteriors[bp] /= totalPosterior
		}
	}

	// Wilson score intervals
	intervals := make(map[string][2]float64)
	for bp, p := range posteriors {
		intervals[bp] = mathutil.WilsonScoreInterval(p, state.Context.ValidDataDays)
	}

	// Scale monotony warning
	if len(fv.ZScores) >= 6 {
		var zSum, zSumSq float64
		for _, z := range fv.ZScores {
			zSum += z
			zSumSq += z * z
		}
		n := float64(len(fv.ZScores))
		variance := zSumSq/n - (zSum/n)*(zSum/n)
		if math.Sqrt(variance) < 0.5 {
			state.AddWarning("SCALE_MONOTONY_WARNING: 主観スコアのバリエーションが極めて小さいです。キャリブレーションを推奨します。")
		}
	}

	state.Inference = domain.InferenceOutput{
		RiskScores:             riskScores,
		PosteriorProbabilities: posteriors,
		ConfidenceIntervals:    intervals,
	}
	return nil
}
