package pipeline

import (
	"context"
	"testing"

	"github.com/meta-masashi/pace-platform/pace-inference/internal/config"
	"github.com/meta-masashi/pace-platform/pace-inference/internal/domain"
)

func TestQualityGateLowQualityOverridesGreen(t *testing.T) {
	// Simulate low quality data with all normal scores
	input := makeDefaultInput()
	ctx := makeDefaultContext()
	ctx.ValidDataDays = 5 // Safety mode → low confidence

	p := New(config.DefaultConfig())
	output, err := p.Execute(context.Background(), input, ctx, nil)
	if err != nil {
		t.Fatalf("pipeline error: %v", err)
	}

	// Should be YELLOW (not GREEN) due to expert delegation
	if output.Decision.Decision != domain.DecisionYELLOW {
		t.Errorf("expected YELLOW (expert delegation), got %s", output.Decision.Decision)
	}
	if output.Decision.ConfidenceLevel != domain.ConfidenceLow {
		t.Errorf("expected confidence=low, got %s", output.Decision.ConfidenceLevel)
	}
	if !output.ExpertReviewRequired {
		t.Error("expected ExpertReviewRequired=true")
	}
}

func TestQualityGateDoesNotOverrideRed(t *testing.T) {
	// P1 trigger (pain) + low data quality
	input := makeDefaultInput()
	input.SubjectiveScores.PainNRS = 9
	ctx := makeDefaultContext()
	ctx.ValidDataDays = 5

	p := New(config.DefaultConfig())
	output, err := p.Execute(context.Background(), input, ctx, nil)
	if err != nil {
		t.Fatalf("pipeline error: %v", err)
	}

	// RED should NOT be overridden to YELLOW
	if output.Decision.Decision != domain.DecisionRED {
		t.Errorf("expected RED (not overridden), got %s", output.Decision.Decision)
	}
	if output.Decision.Priority != domain.PriorityP1Safety {
		t.Errorf("expected P1_SAFETY, got %s", output.Decision.Priority)
	}
}

func TestQualityGateHighQualityStaysGreen(t *testing.T) {
	input := makeDefaultInput()
	ctx := makeDefaultContext()
	ctx.ValidDataDays = 30 // Full mode → high confidence

	p := New(config.DefaultConfig())
	output, err := p.Execute(context.Background(), input, ctx, nil)
	if err != nil {
		t.Fatalf("pipeline error: %v", err)
	}

	if output.Decision.Decision != domain.DecisionGREEN {
		t.Errorf("expected GREEN with high quality, got %s", output.Decision.Decision)
	}
	if output.ExpertReviewRequired {
		t.Error("expected ExpertReviewRequired=false")
	}
}
