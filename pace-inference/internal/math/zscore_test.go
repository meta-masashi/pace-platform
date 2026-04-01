package mathutil

import "testing"

func TestGraduatedZScoreWeight(t *testing.T) {
	tests := []struct {
		name string
		days int
		want float64
	}{
		{"day 0", 0, 0.0},
		{"day 13", 13, 0.0},
		{"day 14", 14, 0.5},
		{"day 21", 21, 0.5},
		{"day 22", 22, 0.75},
		{"day 27", 27, 0.75},
		{"day 28", 28, 1.0},
		{"day 100", 100, 1.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GraduatedZScoreWeight(tt.days)
			if got != tt.want {
				t.Errorf("GraduatedZScoreWeight(%d) = %f, want %f", tt.days, got, tt.want)
			}
		})
	}
}

func TestCalculateZScores(t *testing.T) {
	// Build 28 days of constant history (sleep=7, fatigue=3)
	history := make([]map[string]float64, 28)
	for i := range history {
		history[i] = map[string]float64{
			"sleep_quality": 7,
			"fatigue":       3,
		}
	}

	t.Run("insufficient data days", func(t *testing.T) {
		today := map[string]float64{"sleep_quality": 5, "fatigue": 5}
		zs := CalculateZScores(today, history, 10) // < 14 days
		if len(zs) != 0 {
			t.Errorf("expected empty Z-scores for day 10, got %d", len(zs))
		}
	})

	t.Run("constant history zero z-score", func(t *testing.T) {
		today := map[string]float64{"sleep_quality": 7, "fatigue": 3}
		zs := CalculateZScores(today, history, 28)
		// Constant history → sigma ≈ 0 → Z = 0
		if z, ok := zs["sleep_quality"]; ok && z != 0 {
			t.Errorf("expected Z=0 for constant history, got %f", z)
		}
	})

	t.Run("graduated weight at day 14", func(t *testing.T) {
		// Add variation to history
		varHistory := make([]map[string]float64, 20)
		for i := range varHistory {
			varHistory[i] = map[string]float64{
				"sleep_quality": float64(5 + i%5),
			}
		}
		today := map[string]float64{"sleep_quality": 10}

		zsFull := CalculateZScores(today, varHistory, 28) // weight=1.0
		zsHalf := CalculateZScores(today, varHistory, 14) // weight=0.5

		zFull := zsFull["sleep_quality"]
		zHalf := zsHalf["sleep_quality"]

		// Half weight should be approximately half of full weight
		if zFull == 0 {
			t.Skip("zero Z-score, cannot test ratio")
		}
		ratio := zHalf / zFull
		if ratio < 0.4 || ratio > 0.6 {
			t.Errorf("graduated weight ratio = %f, want ~0.5", ratio)
		}
	})
}
