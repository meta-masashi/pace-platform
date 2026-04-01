package mathutil

import (
	"math"
	"testing"
)

func TestLambdaFromHalfLife(t *testing.T) {
	tests := []struct {
		name     string
		halfLife float64
		want     float64
	}{
		{"14 days", 14, math.Ln2 / 14},
		{"7 days", 7, math.Ln2 / 7},
		{"zero", 0, 0},
		{"negative", -5, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := LambdaFromHalfLife(tt.halfLife)
			if !floatEqual(got, tt.want) {
				t.Errorf("LambdaFromHalfLife(%f) = %f, want %f", tt.halfLife, got, tt.want)
			}
		})
	}
}

func TestCalculateDecayedRisk(t *testing.T) {
	lambda := LambdaFromHalfLife(14)

	tests := []struct {
		name     string
		initial  float64
		lambda   float64
		days     float64
		modifier float64
		wantMin  float64
		wantMax  float64
	}{
		{"no decay", 0.8, lambda, 0, 1.0, 0.799, 0.801},
		{"half life", 0.8, lambda, 14, 1.0, 0.399, 0.401},
		{"full decay", 0.8, lambda, 100, 1.0, 0.0, 0.01},
		{"chronic modifier", 0.5, lambda, 7, 1.5, 0.5, 0.6},
		{"negative days", 0.8, lambda, -5, 1.0, 0.799, 0.801},
		{"zero lambda", 0.8, 0, 10, 1.0, 0.799, 0.801},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalculateDecayedRisk(tt.initial, tt.lambda, tt.days, tt.modifier)
			if got < tt.wantMin || got > tt.wantMax {
				t.Errorf("CalculateDecayedRisk() = %f, want [%f, %f]", got, tt.wantMin, tt.wantMax)
			}
		})
	}
}

func TestDaysUntilThreshold(t *testing.T) {
	lambda := LambdaFromHalfLife(14)

	tests := []struct {
		name      string
		initial   float64
		lambda    float64
		threshold float64
		want      int
	}{
		{"already below", 0.03, lambda, 0.05, 0},
		{"standard", 0.8, lambda, 0.05, 56}, // ~4 half-lives
		{"zero lambda", 0.8, 0, 0.05, math.MaxInt32},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := DaysUntilThreshold(tt.initial, tt.lambda, tt.threshold)
			if got != tt.want {
				t.Errorf("DaysUntilThreshold() = %d, want %d", got, tt.want)
			}
		})
	}
}
