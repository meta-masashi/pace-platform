package pipeline

import (
	"context"
	"crypto/rand"
	"fmt"
	"time"

	"github.com/meta-masashi/pace-platform/pace-inference/internal/config"
	"github.com/meta-masashi/pace-platform/pace-inference/internal/domain"
)

// NodeFunc is a pipeline node execution function.
type NodeFunc func(ctx context.Context, state *PipelineState) error

// Pipeline orchestrates the 6-node inference pipeline.
type Pipeline struct {
	config config.PipelineConfig
	nodes  []namedNode
}

type namedNode struct {
	id string
	fn NodeFunc
}

// New creates a pipeline with the default node sequence.
func New(cfg config.PipelineConfig) *Pipeline {
	p := &Pipeline{config: cfg}
	p.nodes = []namedNode{
		{"node0_ingestion", Node0Ingestion},
		{"node1_cleaning", Node1Cleaning},
		{"node2_feature", Node2Feature},
		{"node3_inference", Node3Inference},
		{"node4_decision", Node4Decision},
		{"node5_presentation", Node5Presentation},
	}
	return p
}

// Execute runs all 6 nodes sequentially, returning the complete pipeline output.
// Each node failure is caught and logged; the pipeline continues with fallback values.
func (p *Pipeline) Execute(ctx context.Context, input domain.DailyInput, athleteCtx domain.AthleteContext, history []domain.DailyInput) (*domain.PipelineOutput, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	state := &PipelineState{
		Input:       input,
		Context:     athleteCtx,
		History:     history,
		Config:      p.config,
		TraceID:     generateUUID(),
		Warnings:    make([]string, 0),
		NodeResults: make(map[string]domain.NodeResult),
		RiskMultipliers: make(map[string]float64),
		FeatureVector: domain.FeatureVector{
			TissueDamage: map[domain.TissueCategory]float64{
				domain.TissueMetabolic:      0,
				domain.TissueStructuralSoft: 0,
				domain.TissueStructuralHard: 0,
				domain.TissueNeuromotor:     0,
			},
			ZScores: make(map[string]float64),
		},
		Inference: domain.InferenceOutput{
			RiskScores:             make(map[string]float64),
			PosteriorProbabilities: make(map[string]float64),
			ConfidenceIntervals:    make(map[string][2]float64),
		},
		Decision: domain.DecisionOutput{
			Decision:           domain.DecisionGREEN,
			Priority:           domain.PriorityP5Normal,
			Reason:             "パイプライン初期化中",
			ReasonEn:           "Pipeline initializing",
			OverridesApplied:   make([]string, 0),
			RecommendedActions: make([]domain.RecommendedAction, 0),
			ConfidenceLevel:    domain.ConfidenceLow,
		},
	}

	for _, node := range p.nodes {
		select {
		case <-ctx.Done():
			state.AddWarning(fmt.Sprintf("pipeline timeout at %s", node.id))
			break
		default:
		}

		start := time.Now()
		err := func() (retErr error) {
			defer func() {
				if r := recover(); r != nil {
					retErr = fmt.Errorf("panic in %s: %v", node.id, r)
				}
			}()
			return node.fn(ctx, state)
		}()

		elapsed := time.Since(start).Seconds() * 1000 // ms

		result := domain.NodeResult{
			NodeID:          node.id,
			Success:         err == nil,
			ExecutionTimeMs: elapsed,
			Warnings:        make([]string, 0),
		}
		if err != nil {
			result.Error = err.Error()
			state.AddWarning(fmt.Sprintf("%s failed: %s", node.id, err.Error()))
		}
		state.NodeResults[node.id] = result
	}

	// Assemble output
	output := &domain.PipelineOutput{
		TraceID:         state.TraceID,
		AthleteID:       athleteCtx.AthleteID,
		Timestamp:       time.Now().UTC().Format(time.RFC3339),
		Decision:        state.Decision,
		FeatureVector:   state.FeatureVector,
		Inference:       state.Inference,
		DataQuality:     state.DataQuality,
		PipelineVersion: p.config.Version,
		Engine:          "go",
		TrendNotices:    make([]domain.TrendNotice, 0),
	}

	return output, nil
}

func generateUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant 2
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
