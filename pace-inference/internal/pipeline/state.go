// Package pipeline implements the PACE v6 inference pipeline.
package pipeline

import (
	"github.com/meta-masashi/pace-platform/pace-inference/internal/config"
	"github.com/meta-masashi/pace-platform/pace-inference/internal/domain"
)

// PipelineState holds all intermediate and final data for a single inference run.
type PipelineState struct {
	// Inputs (set once)
	Input      domain.DailyInput
	Context    domain.AthleteContext
	History    []domain.DailyInput
	Config     config.PipelineConfig

	// Node 0 output
	NormalizedInput domain.DailyInput
	RiskMultipliers map[string]float64

	// Node 1 output
	CleanedInput domain.DailyInput
	DataQuality  domain.DataQualityReport

	// Node 2 output
	FeatureVector domain.FeatureVector

	// Node 3 output
	Inference domain.InferenceOutput

	// Node 4 output
	Decision domain.DecisionOutput

	// Trace metadata
	TraceID     string
	Warnings    []string
	NodeResults map[string]domain.NodeResult
}

// AddWarning appends a warning message.
func (s *PipelineState) AddWarning(msg string) {
	s.Warnings = append(s.Warnings, msg)
}
