package pipeline

import (
	"context"

	"github.com/meta-masashi/pace-platform/pace-inference/internal/domain"
	mathutil "github.com/meta-masashi/pace-platform/pace-inference/internal/math"
)

// Node2Feature computes ACWR, monotony, Z-scores, and composite readiness.
func Node2Feature(_ context.Context, state *PipelineState) error {
	cleaned := state.CleanedInput
	history := state.History

	// Build full load history (history + today)
	loads := make([]float64, 0, len(history)+1)
	for _, h := range history {
		loads = append(loads, h.SessionLoad)
	}
	loads = append(loads, cleaned.SessionLoad)

	// ACWR
	acwr, _, _ := mathutil.CalculateACWR(loads, state.Config.EWMA.AcuteSpan, state.Config.EWMA.ChronicSpan)

	// Monotony
	monotony := mathutil.CalculateMonotonyIndex(loads)

	// Z-Scores (graduated)
	historyScores := make([]map[string]float64, 0, len(history))
	for _, h := range history {
		historyScores = append(historyScores, map[string]float64{
			"sleep_quality":  h.SubjectiveScores.SleepQuality,
			"fatigue":        h.SubjectiveScores.Fatigue,
			"mood":           h.SubjectiveScores.Mood,
			"muscle_soreness": h.SubjectiveScores.MuscleSoreness,
			"stress_level":   h.SubjectiveScores.StressLevel,
			"pain_nrs":       h.SubjectiveScores.PainNRS,
		})
	}
	todayScores := map[string]float64{
		"sleep_quality":  cleaned.SubjectiveScores.SleepQuality,
		"fatigue":        cleaned.SubjectiveScores.Fatigue,
		"mood":           cleaned.SubjectiveScores.Mood,
		"muscle_soreness": cleaned.SubjectiveScores.MuscleSoreness,
		"stress_level":   cleaned.SubjectiveScores.StressLevel,
		"pain_nrs":       cleaned.SubjectiveScores.PainNRS,
	}
	zScores := mathutil.CalculateZScores(todayScores, historyScores, state.Context.ValidDataDays)

	if len(zScores) == 0 && state.Context.ValidDataDays < mathutil.ZScoreMinDays {
		state.AddWarning("データ蓄積日数が14日未満のためZ-Scoreは未計算")
	}

	// Composite Readiness
	preparedness := mathutil.CompositeReadiness(acwr, zScores)

	// Tissue damage: all zeros (ODE removed per evidence audit)
	tissueDamage := map[domain.TissueCategory]float64{
		domain.TissueMetabolic:      0,
		domain.TissueStructuralSoft: 0,
		domain.TissueStructuralHard: 0,
		domain.TissueNeuromotor:     0,
	}

	state.FeatureVector = domain.FeatureVector{
		ACWR:          acwr,
		MonotonyIndex: monotony,
		Preparedness:  preparedness,
		TissueDamage:  tissueDamage,
		ZScores:       zScores,
	}
	return nil
}
