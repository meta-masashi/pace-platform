package pipeline

import (
	"fmt"

	"github.com/meta-masashi/pace-platform/pace-inference/internal/domain"
)

// ApplyQualityGate overrides GREEN to YELLOW when data quality is insufficient.
// RED and ORANGE are never overridden downward (more severe decisions take priority).
// Sets ExpertReviewRequired flag when confidence is low.
func ApplyQualityGate(state *PipelineState) {
	quality := state.DataQuality
	decision := state.Decision

	// Rule 1: Low quality + GREEN → YELLOW with expert review
	if quality.QualityScore < state.Config.Thresholds.QualityGateMinScore &&
		decision.Decision == domain.DecisionGREEN {

		state.Decision.Decision = domain.DecisionYELLOW
		state.Decision.Reason += "\n\nデータ品質が不十分です（" +
			formatPercent(quality.QualityScore) +
			"）。専門家の確認を推奨します。"
		state.Decision.ReasonEn += " Data quality insufficient (" +
			formatPercent(quality.QualityScore) +
			"). Expert review recommended."
		state.Decision.RecommendedActions = append(state.Decision.RecommendedActions,
			domain.RecommendedAction{
				ActionType:       "expert_review",
				Description:      "データ品質が低いため、自動判定を抑制しました。専門家による確認を推奨します。",
				Priority:         "high",
				RequiresApproval: true,
			})
		state.AddWarning("quality_gate: GREEN overridden to YELLOW due to low quality score")
	}

	// Rule 2: Low confidence + GREEN → Expert delegation
	if quality.ConfidenceLevel == domain.ConfidenceLow &&
		state.Decision.Decision == domain.DecisionGREEN {

		state.Decision.Decision = domain.DecisionYELLOW
		state.Decision.Reason += "\n\n要確認: データ蓄積不足のため自動判定を抑制しました。専門家の確認を推奨します。"
		state.Decision.ReasonEn += " Expert delegation: Automated decision suppressed due to insufficient data."
		state.AddWarning("expert_delegation: GREEN overridden to YELLOW due to low confidence")
	}

	// Set confidence on decision
	state.Decision.ConfidenceLevel = quality.ConfidenceLevel
}

func formatPercent(v float64) string {
	return fmt.Sprintf("%.0f%%", v*100)
}
