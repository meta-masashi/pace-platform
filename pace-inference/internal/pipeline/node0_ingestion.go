package pipeline

import "context"

// Node0Ingestion normalizes input data and computes risk multipliers from medical history.
func Node0Ingestion(_ context.Context, state *PipelineState) error {
	input := state.Input

	// Clamp subjective scores to [0, 10]
	input.SubjectiveScores.SleepQuality = clamp(input.SubjectiveScores.SleepQuality, 0, 10)
	input.SubjectiveScores.Fatigue = clamp(input.SubjectiveScores.Fatigue, 0, 10)
	input.SubjectiveScores.Mood = clamp(input.SubjectiveScores.Mood, 0, 10)
	input.SubjectiveScores.MuscleSoreness = clamp(input.SubjectiveScores.MuscleSoreness, 0, 10)
	input.SubjectiveScores.StressLevel = clamp(input.SubjectiveScores.StressLevel, 0, 10)
	input.SubjectiveScores.PainNRS = clamp(input.SubjectiveScores.PainNRS, 0, 10)
	input.SRPE = clamp(input.SRPE, 0, 10)
	if input.TrainingDurationMin < 0 {
		input.TrainingDurationMin = 0
	}

	// Recalculate session load
	input.SessionLoad = input.SRPE * input.TrainingDurationMin

	// Compute risk multipliers from medical history (max per body part)
	multipliers := make(map[string]float64)
	for _, entry := range state.Context.MedicalHistory {
		existing, ok := multipliers[entry.BodyPart]
		if !ok || entry.RiskMultiplier > existing {
			multipliers[entry.BodyPart] = entry.RiskMultiplier
		}
	}

	state.NormalizedInput = input
	state.RiskMultipliers = multipliers
	return nil
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
