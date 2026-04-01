// Package domain defines core types for the PACE v6 inference engine.
package domain

// InferenceDecision represents the 4-color traffic light decision.
type InferenceDecision string

const (
	DecisionRED    InferenceDecision = "RED"
	DecisionORANGE InferenceDecision = "ORANGE"
	DecisionYELLOW InferenceDecision = "YELLOW"
	DecisionGREEN  InferenceDecision = "GREEN"
)

// InferencePriority represents the P1-P5 priority hierarchy.
type InferencePriority string

const (
	PriorityP1Safety         InferencePriority = "P1_SAFETY"
	PriorityP2MechanicalRisk InferencePriority = "P2_MECHANICAL_RISK"
	PriorityP3Decoupling     InferencePriority = "P3_DECOUPLING"     // 型互換: chronic maladaptation
	PriorityP4GASExhaustion  InferencePriority = "P4_GAS_EXHAUSTION"
	PriorityP5Normal         InferencePriority = "P5_NORMAL"
)

// TissueCategory represents the 4-layer tissue model.
type TissueCategory string

const (
	TissueMetabolic      TissueCategory = "metabolic"
	TissueStructuralSoft TissueCategory = "structural_soft"
	TissueStructuralHard TissueCategory = "structural_hard"
	TissueNeuromotor     TissueCategory = "neuromotor"
)

// ConfidenceLevel indicates the reliability of the pipeline output.
type ConfidenceLevel string

const (
	ConfidenceHigh   ConfidenceLevel = "high"
	ConfidenceMedium ConfidenceLevel = "medium"
	ConfidenceLow    ConfidenceLevel = "low"
)

// MaturationMode indicates the data accumulation phase.
type MaturationMode string

const (
	MaturationSafety   MaturationMode = "safety"   // Day 0-13
	MaturationLearning MaturationMode = "learning"  // Day 14-27
	MaturationFull     MaturationMode = "full"      // Day 28+
)
