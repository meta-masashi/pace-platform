package pipeline

import (
	"context"
	"testing"

	"github.com/meta-masashi/pace-platform/pace-inference/internal/config"
	"github.com/meta-masashi/pace-platform/pace-inference/internal/domain"
)

func makeDefaultInput() domain.DailyInput {
	return domain.DailyInput{
		Date:                "2026-04-01",
		SRPE:                5,
		TrainingDurationMin: 60,
		SessionLoad:         300,
		SubjectiveScores: domain.SubjectiveScores{
			SleepQuality:   7,
			Fatigue:        3,
			Mood:           7,
			MuscleSoreness: 3,
			StressLevel:    3,
			PainNRS:        0,
		},
		ContextFlags:  domain.ContextFlags{},
		LocalTimezone: "Asia/Tokyo",
	}
}

func makeDefaultContext() domain.AthleteContext {
	return domain.AthleteContext{
		AthleteID:      "test-001",
		OrgID:          "org-001",
		TeamID:         "team-001",
		Age:            25,
		Sport:          "soccer",
		IsContactSport: true,
		ValidDataDays:  30,
		BayesianPriors: map[string]float64{},
		RiskMultipliers: map[string]float64{},
		MedicalHistory: nil,
		TissueHalfLifes: map[domain.TissueCategory]float64{
			domain.TissueMetabolic:      2,
			domain.TissueStructuralSoft: 7,
			domain.TissueStructuralHard: 21,
			domain.TissueNeuromotor:     3,
		},
	}
}

func TestPipelineGreenPath(t *testing.T) {
	p := New(config.DefaultConfig())
	output, err := p.Execute(context.Background(), makeDefaultInput(), makeDefaultContext(), nil)
	if err != nil {
		t.Fatalf("pipeline error: %v", err)
	}
	if output.Decision.Decision != domain.DecisionGREEN {
		t.Errorf("expected GREEN, got %s", output.Decision.Decision)
	}
	if output.Decision.Priority != domain.PriorityP5Normal {
		t.Errorf("expected P5_NORMAL, got %s", output.Decision.Priority)
	}
	if output.Engine != "go" {
		t.Errorf("expected engine=go, got %s", output.Engine)
	}
}

func TestPipelineP1PainRed(t *testing.T) {
	input := makeDefaultInput()
	input.SubjectiveScores.PainNRS = 9

	p := New(config.DefaultConfig())
	output, err := p.Execute(context.Background(), input, makeDefaultContext(), nil)
	if err != nil {
		t.Fatalf("pipeline error: %v", err)
	}
	if output.Decision.Decision != domain.DecisionRED {
		t.Errorf("expected RED, got %s", output.Decision.Decision)
	}
	if output.Decision.Priority != domain.PriorityP1Safety {
		t.Errorf("expected P1_SAFETY, got %s", output.Decision.Priority)
	}
}

func TestPipelineP1SleepFatigue(t *testing.T) {
	input := makeDefaultInput()
	input.SubjectiveScores.SleepQuality = 1
	input.SubjectiveScores.Fatigue = 9

	p := New(config.DefaultConfig())
	output, err := p.Execute(context.Background(), input, makeDefaultContext(), nil)
	if err != nil {
		t.Fatalf("pipeline error: %v", err)
	}
	if output.Decision.Decision != domain.DecisionRED {
		t.Errorf("expected RED, got %s", output.Decision.Decision)
	}
	if output.Decision.Priority != domain.PriorityP1Safety {
		t.Errorf("expected P1_SAFETY, got %s", output.Decision.Priority)
	}
}

func TestPipelineP1NSAIDMasking(t *testing.T) {
	input := makeDefaultInput()
	input.SubjectiveScores.PainNRS = 10
	input.ContextFlags.IsMedicationNsaid24h = true

	p := New(config.DefaultConfig())
	output, err := p.Execute(context.Background(), input, makeDefaultContext(), nil)
	if err != nil {
		t.Fatalf("pipeline error: %v", err)
	}
	// Pain P1 should be masked by NSAID
	if output.Decision.Priority == domain.PriorityP1Safety {
		t.Errorf("P1 should not fire when NSAID is active")
	}
}

func TestPipelinePHVAgeAdjustment(t *testing.T) {
	input := makeDefaultInput()
	ctx := makeDefaultContext()
	ctx.Age = 15

	// Build history with low loads to get ACWR between 1.3 and 1.5
	history := make([]domain.DailyInput, 28)
	for i := range history {
		history[i] = domain.DailyInput{
			Date:                "2026-03-01",
			SessionLoad:         200,
			SubjectiveScores:    domain.SubjectiveScores{SleepQuality: 7, Fatigue: 3, Mood: 7},
		}
	}
	input.SessionLoad = 400 // Higher acute to push ACWR up

	p := New(config.DefaultConfig())
	output, err := p.Execute(context.Background(), input, ctx, history)
	if err != nil {
		t.Fatalf("pipeline error: %v", err)
	}
	// With youth adjustment, threshold is 1.3 instead of 1.5
	// If ACWR > 1.3, should trigger P2
	t.Logf("Youth (age 15) ACWR=%.2f, decision=%s, priority=%s",
		output.FeatureVector.ACWR, output.Decision.Decision, output.Decision.Priority)
}

func TestPipelinePostFever(t *testing.T) {
	input := makeDefaultInput()
	input.ContextFlags.IsPostFever = true

	p := New(config.DefaultConfig())
	output, err := p.Execute(context.Background(), input, makeDefaultContext(), nil)
	if err != nil {
		t.Fatalf("pipeline error: %v", err)
	}
	if output.Decision.Decision != domain.DecisionRED {
		t.Errorf("expected RED for post-fever, got %s", output.Decision.Decision)
	}
}

func TestPipelineVersion(t *testing.T) {
	p := New(config.DefaultConfig())
	output, err := p.Execute(context.Background(), makeDefaultInput(), makeDefaultContext(), nil)
	if err != nil {
		t.Fatalf("pipeline error: %v", err)
	}
	if output.PipelineVersion != "v6.0-go" {
		t.Errorf("expected v6.0-go, got %s", output.PipelineVersion)
	}
}
