package pipeline

import (
	"testing"

	"github.com/meta-masashi/pace-platform/pace-inference/internal/config"
	"github.com/meta-masashi/pace-platform/pace-inference/internal/domain"
)

func TestDetectTrendsRisingACWR(t *testing.T) {
	state := &PipelineState{
		Config: config.DefaultConfig(),
		History: []domain.DailyInput{
			{SessionLoad: 300, SubjectiveScores: domain.SubjectiveScores{SleepQuality: 7}},
			{SessionLoad: 400, SubjectiveScores: domain.SubjectiveScores{SleepQuality: 7}},
			{SessionLoad: 500, SubjectiveScores: domain.SubjectiveScores{SleepQuality: 7}},
		},
		FeatureVector: domain.FeatureVector{
			ACWR: 1.4, // Current ACWR approaching 1.5
		},
	}

	notices := DetectTrends(state)
	// With rising load trend, ACWR trend should be detected
	t.Logf("Trend notices: %d", len(notices))
	for _, n := range notices {
		t.Logf("  %s: %s (current=%.2f, threshold=%.2f)", n.Metric, n.Direction, n.CurrentValue, n.Threshold)
	}
}

func TestDetectTrendsNoTrendWithStableData(t *testing.T) {
	state := &PipelineState{
		Config: config.DefaultConfig(),
		History: []domain.DailyInput{
			{SessionLoad: 300, SubjectiveScores: domain.SubjectiveScores{SleepQuality: 7}},
			{SessionLoad: 300, SubjectiveScores: domain.SubjectiveScores{SleepQuality: 7}},
			{SessionLoad: 300, SubjectiveScores: domain.SubjectiveScores{SleepQuality: 7}},
		},
		FeatureVector: domain.FeatureVector{
			ACWR: 1.0,
		},
	}

	notices := DetectTrends(state)
	if len(notices) != 0 {
		t.Errorf("expected 0 trend notices for stable data, got %d", len(notices))
	}
}

func TestDetectTrendsInsufficientHistory(t *testing.T) {
	state := &PipelineState{
		Config: config.DefaultConfig(),
		History: []domain.DailyInput{
			{SessionLoad: 300},
		},
		FeatureVector: domain.FeatureVector{ACWR: 1.0},
	}

	notices := DetectTrends(state)
	if len(notices) != 0 {
		t.Errorf("expected 0 trend notices with < 3 history, got %d", len(notices))
	}
}

func TestLinearSlope(t *testing.T) {
	tests := []struct {
		name   string
		values []float64
		want   float64 // approximate
	}{
		{"flat", []float64{5, 5, 5}, 0},
		{"rising", []float64{1, 2, 3}, 1.0},
		{"falling", []float64{3, 2, 1}, -1.0},
		{"single", []float64{5}, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := linearSlope(tt.values)
			diff := got - tt.want
			if diff < -0.01 || diff > 0.01 {
				t.Errorf("linearSlope() = %f, want %f", got, tt.want)
			}
		})
	}
}
