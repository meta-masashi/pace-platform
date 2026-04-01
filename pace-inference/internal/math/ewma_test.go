package mathutil

import (
	"math"
	"testing"
)

const epsilon = 1e-9

func floatEqual(a, b float64) bool {
	return math.Abs(a-b) < epsilon
}

func TestCalculateEWMA(t *testing.T) {
	tests := []struct {
		name   string
		values []float64
		span   int
		want   float64
	}{
		{"empty", nil, 7, 0},
		{"single value", []float64{100}, 7, 100},
		{"zero span", []float64{100, 200}, 0, 0},
		{"constant values", []float64{50, 50, 50, 50, 50}, 7, 50},
		{"increasing", []float64{100, 200, 300, 400, 500}, 3, 0}, // will compute
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalculateEWMA(tt.values, tt.span)
			if tt.name == "increasing" {
				// Just verify it's closer to recent values
				if got <= 300 {
					t.Errorf("EWMA of increasing should be > 300, got %f", got)
				}
				return
			}
			if !floatEqual(got, tt.want) {
				t.Errorf("CalculateEWMA() = %f, want %f", got, tt.want)
			}
		})
	}
}

func TestCalculateACWR(t *testing.T) {
	tests := []struct {
		name        string
		loads       []float64
		acuteSpan   int
		chronicSpan int
		wantACWR    float64
	}{
		{"empty", nil, 7, 28, 0},
		{"constant", []float64{100, 100, 100, 100, 100, 100, 100, 100, 100, 100}, 7, 28, 1.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			acwr, _, _ := CalculateACWR(tt.loads, tt.acuteSpan, tt.chronicSpan)
			if !floatEqual(acwr, tt.wantACWR) {
				t.Errorf("ACWR = %f, want %f", acwr, tt.wantACWR)
			}
		})
	}
}

func TestCompositeReadiness(t *testing.T) {
	tests := []struct {
		name    string
		acwr    float64
		zScores map[string]float64
		wantMin float64
		wantMax float64
	}{
		{"sweet spot + neutral z", 1.1, map[string]float64{"sleep": 0, "fatigue": 0}, 50, 80},
		{"high acwr + bad z", 2.0, map[string]float64{"sleep": -2, "fatigue": -2}, 0, 30},
		{"sweet spot + good z", 1.0, map[string]float64{"sleep": 1, "fatigue": 1}, 70, 100},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CompositeReadiness(tt.acwr, tt.zScores)
			if got < tt.wantMin || got > tt.wantMax {
				t.Errorf("CompositeReadiness() = %f, want [%f, %f]", got, tt.wantMin, tt.wantMax)
			}
		})
	}
}
