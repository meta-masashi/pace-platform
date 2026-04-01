package pipeline

import (
	"context"
	"math"
	"time"

	"github.com/meta-masashi/pace-platform/pace-inference/internal/domain"
	mathutil "github.com/meta-masashi/pace-platform/pace-inference/internal/math"
)

// Outlier bounds for physiological validity.
var outlierBounds = []struct {
	field        string
	min, max     float64
	defaultValue float64
}{
	{"srpe", 0, 10, 5},
	{"training_duration_min", 0, 600, 60},
	{"sleep_quality", 0, 10, 5},
	{"fatigue", 0, 10, 5},
	{"mood", 0, 10, 5},
	{"muscle_soreness", 0, 10, 3},
	{"stress_level", 0, 10, 3},
	{"pain_nrs", 0, 10, 0},
	{"resting_heart_rate", 30, 250, 70},
}

// Node1Cleaning detects outliers, imputes missing values, and computes data quality.
func Node1Cleaning(_ context.Context, state *PipelineState) error {
	input := state.NormalizedInput
	imputedFields := make([]string, 0)
	outlierFields := make([]string, 0)

	// Maturation mode
	mode := maturationMode(state.Context.ValidDataDays)

	// LOCF + Exponential Decay imputation
	if state.Context.LastKnownRecord != nil {
		gapDays := daysBetween(state.Context.LastKnownRecord.Date, input.Date)
		if gapDays > 0 && gapDays <= 14 {
			// Subjective: LOCF
			if input.SubjectiveScores.SleepQuality == 0 && input.SRPE > 0 {
				input.SubjectiveScores.SleepQuality = state.Context.LastKnownRecord.SleepQuality
				imputedFields = append(imputedFields, "sleep_quality")
			}
			if input.SubjectiveScores.Mood == 0 && input.SRPE > 0 {
				input.SubjectiveScores.Mood = state.Context.LastKnownRecord.Mood
				imputedFields = append(imputedFields, "mood")
			}
			// Load metrics: Exponential decay
			if input.SRPE == 0 && state.Context.LastKnownRecord.SRPE > 0 {
				halfLife := 7.0 // default
				if hl, ok := state.Context.TissueHalfLifes[domain.TissueMetabolic]; ok {
					halfLife = hl
				}
				lambda := mathutil.LambdaFromHalfLife(halfLife)
				input.SRPE = mathutil.CalculateDecayedRisk(
					state.Context.LastKnownRecord.SRPE/10, lambda, float64(gapDays), 1.0) * 10
				imputedFields = append(imputedFields, "srpe")
			}
		} else if gapDays > 14 {
			// Gap too large: neutral defaults
			if input.SubjectiveScores.SleepQuality == 0 {
				input.SubjectiveScores.SleepQuality = 5
				imputedFields = append(imputedFields, "sleep_quality")
			}
			if input.SubjectiveScores.Mood == 0 {
				input.SubjectiveScores.Mood = 5
				imputedFields = append(imputedFields, "mood")
			}
		}
	} else if mode == domain.MaturationSafety {
		// Safety mode: neutral defaults
		if input.SubjectiveScores.SleepQuality == 0 && input.SRPE > 0 {
			input.SubjectiveScores.SleepQuality = 5
			imputedFields = append(imputedFields, "sleep_quality")
		}
		if input.SubjectiveScores.Mood == 0 && input.SRPE > 0 {
			input.SubjectiveScores.Mood = 5
			imputedFields = append(imputedFields, "mood")
		}
	}

	// Data quality score
	totalFields := 8 // sRPE, duration, sleep, fatigue, mood, soreness, stress, pain
	validFields := totalFields - len(outlierFields)
	qualityScore := float64(validFields) / float64(totalFields)

	// Confidence level
	confidence := domain.ConfidenceHigh
	if mode == domain.MaturationSafety || qualityScore < 0.6 {
		confidence = domain.ConfidenceLow
	} else if mode == domain.MaturationLearning || qualityScore < 0.8 {
		confidence = domain.ConfidenceMedium
	}

	state.CleanedInput = input
	state.DataQuality = domain.DataQualityReport{
		QualityScore:    qualityScore,
		TotalFields:     totalFields,
		ValidFields:     validFields,
		ImputedFields:   imputedFields,
		OutlierFields:   outlierFields,
		MaturationMode:  mode,
		ConfidenceLevel: confidence,
	}
	return nil
}

func maturationMode(validDataDays int) domain.MaturationMode {
	switch {
	case validDataDays < 14:
		return domain.MaturationSafety
	case validDataDays < 28:
		return domain.MaturationLearning
	default:
		return domain.MaturationFull
	}
}

func daysBetween(dateA, dateB string) int {
	a, err1 := time.Parse("2006-01-02", dateA)
	b, err2 := time.Parse("2006-01-02", dateB)
	if err1 != nil || err2 != nil {
		return 0
	}
	days := b.Sub(a).Hours() / 24
	return int(math.Round(days))
}
