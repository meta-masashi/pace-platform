package pipeline

import (
	"context"
	"fmt"

	"github.com/meta-masashi/pace-platform/pace-inference/internal/domain"
)

const legalDisclaimer = "本レポートはPACEコンディショニング判定支援システムによる参考情報であり、医学的診断を構成するものではありません。" +
	"トレーニングの最終判断は、資格を有するメディカルスタッフまたはコーチングスタッフが行ってください。"

var decisionLabels = map[domain.InferenceDecision]string{
	domain.DecisionRED:    "停止",
	domain.DecisionORANGE: "警戒",
	domain.DecisionYELLOW: "注意",
	domain.DecisionGREEN:  "良好",
}

var priorityLabels = map[domain.InferencePriority]string{
	domain.PriorityP1Safety:         "安全性（P1）",
	domain.PriorityP2MechanicalRisk: "力学的リスク（P2）",
	domain.PriorityP3Decoupling:     "慢性的不適応（P3）",
	domain.PriorityP4GASExhaustion:  "GAS 疲憊期（P4）",
	domain.PriorityP5Normal:         "正常適応（P5）",
}

// FIFA 11+ recommendations (Level 1a evidence).
var fifa11Recommendations = map[domain.InferenceDecision][]string{
	domain.DecisionGREEN: {
		"ウォーミングアップにFIFA 11+プログラムの実施を推奨します（傷害予防効果: 足関節33%減, 腰部63%減）。",
	},
	domain.DecisionYELLOW: {
		"FIFA 11+ Level 2（中級）のバランス・固有受容覚トレーニングを重点的に実施してください。",
		"練習強度を下げ、神経筋コントロールの質を重視したメニューに切り替えることを推奨します。",
	},
	domain.DecisionORANGE: {
		"FIFA 11+ Level 1（基礎）の神経筋トレーニングに限定してください。",
		"高速走行・方向転換を含むメニューの大幅な制限を推奨します。",
	},
	domain.DecisionRED: {
		"トレーニング参加を見送り、医療スタッフの評価を受けてください。",
		"復帰時にはFIFA 11+ Level 1から段階的に負荷を戻すプロトコルを推奨します。",
	},
}

// Node5Presentation assembles the final output with NLG summary and FIFA 11+ recommendations.
func Node5Presentation(_ context.Context, state *PipelineState) error {
	decision := state.Decision

	// Set confidence level from data quality
	decision.ConfidenceLevel = state.DataQuality.ConfidenceLevel

	// Append FIFA 11+ recommendations
	if recs, ok := fifa11Recommendations[decision.Decision]; ok {
		for _, rec := range recs {
			decision.RecommendedActions = append(decision.RecommendedActions, domain.RecommendedAction{
				ActionType:  "fifa11_plus",
				Description: rec,
				Priority:    "medium",
			})
		}
	}

	state.Decision = decision

	// Generate NLG summary (template-based, deterministic)
	_ = generateNLGSummary(state)

	return nil
}

func generateNLGSummary(state *PipelineState) string {
	d := state.Decision
	fv := state.FeatureVector
	dq := state.DataQuality

	colorLabel := decisionLabels[d.Decision]
	priorityLabel := priorityLabels[d.Priority]
	qualityPercent := int(dq.QualityScore * 100)

	summary := fmt.Sprintf("コンディション判定: %s\n判定根拠: %s\n\n%s\n\n---\nデータ品質: %d%% | モード: %s\nACWR: %.2f | 単調性: %.2f | プレパレッドネス: %.0f",
		colorLabel, priorityLabel, d.Reason,
		qualityPercent, string(dq.MaturationMode),
		fv.ACWR, fv.MonotonyIndex, fv.Preparedness)

	if len(d.OverridesApplied) > 0 {
		summary += "\nオーバーライド: "
		for i, o := range d.OverridesApplied {
			if i > 0 {
				summary += ", "
			}
			summary += o
		}
	}

	summary += "\n---\n" + legalDisclaimer
	return summary
}
