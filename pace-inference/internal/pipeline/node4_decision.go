package pipeline

import (
	"context"
	"fmt"
	"math"

	"github.com/meta-masashi/pace-platform/pace-inference/internal/config"
	"github.com/meta-masashi/pace-platform/pace-inference/internal/domain"
)

// Node4Decision implements the P1-P5 priority cascade with context overrides.
func Node4Decision(_ context.Context, state *PipelineState) error {
	input := state.CleanedInput
	fv := state.FeatureVector
	flags := input.ContextFlags
	cfg := state.Config.Thresholds
	ctx := state.Context

	overrides := make([]string, 0)
	if flags.IsGameDay {
		overrides = append(overrides, "game_day")
	}
	if flags.IsAcclimatization {
		overrides = append(overrides, "acclimatization")
	}
	if flags.IsWeightMaking {
		overrides = append(overrides, "weight_making")
	}

	// ── P1: Safety ──
	reasons, reasonsEn := checkP1Safety(input, fv, flags, cfg, ctx)
	if len(reasons) > 0 {
		state.Decision = buildDecision(domain.DecisionRED, domain.PriorityP1Safety, reasons, reasonsEn, overrides,
			[]domain.RecommendedAction{
				{ActionType: "rest", Description: "トレーニングを即座に中止し、メディカルスタッフに相談してください。", Priority: "critical", RequiresApproval: true},
				{ActionType: "medical_review", Description: "メディカルスタッフによる評価を受けてください。", Priority: "critical", RequiresApproval: true},
			})
		return nil
	}

	// ── P2: Mechanical Risk (compound condition) ──
	reasons, reasonsEn, isRed := checkP2Compound(fv, cfg, ctx)
	if len(reasons) > 0 {
		decision := domain.DecisionORANGE
		if isRed {
			decision = domain.DecisionRED
		}
		state.Decision = buildDecision(decision, domain.PriorityP2MechanicalRisk, reasons, reasonsEn, overrides,
			[]domain.RecommendedAction{
				{ActionType: "reduce_intensity", Description: "負荷を30-50%軽減し、段階的な調整を行ってください。", Priority: "high", RequiresApproval: true},
			})
		return nil
	}

	// ── P3: Chronic Maladaptation ──
	reasons, reasonsEn = checkP3ChronicMaladaptation(fv)
	if len(reasons) > 0 {
		state.Decision = buildDecision(domain.DecisionYELLOW, domain.PriorityP3Decoupling, reasons, reasonsEn, overrides,
			[]domain.RecommendedAction{
				{ActionType: "monitor", Description: "生活環境・メンタルストレスの確認と、リカバリーセッションの導入を検討してください。", Priority: "medium"},
			})
		return nil
	}

	// ── P4: GAS Exhaustion ──
	reasons, reasonsEn = checkP4GAS(fv, flags, cfg)
	if len(reasons) > 0 {
		state.Decision = buildDecision(domain.DecisionYELLOW, domain.PriorityP4GASExhaustion, reasons, reasonsEn, overrides,
			[]domain.RecommendedAction{
				{ActionType: "reduce_intensity", Description: "リカバリーセッションを導入してください。", Priority: "medium"},
			})
		return nil
	}

	// ── P4b: Allostatic Load ──
	reasons, reasonsEn = checkP4bAllostatic(input, fv)
	if len(reasons) > 0 {
		state.Decision = buildDecision(domain.DecisionYELLOW, domain.PriorityP4GASExhaustion, reasons, reasonsEn, overrides,
			[]domain.RecommendedAction{
				{ActionType: "monitor", Description: "グラウンド外のストレス要因を確認してください。", Priority: "medium"},
			})
		return nil
	}

	// ── P5: Normal ──
	reason := "コンディション良好です。計画通りのトレーニングを継続してください。"
	reasonEn := "Condition is good. Continue with planned training."
	if fv.Preparedness <= 0 {
		reason = "プレパレッドネスが低下傾向にあります。負荷と回復のバランスに注意してください。"
		reasonEn = "Preparedness is declining. Monitor load-recovery balance."
	}

	state.Decision = buildDecision(domain.DecisionGREEN, domain.PriorityP5Normal, []string{reason}, []string{reasonEn}, overrides,
		[]domain.RecommendedAction{
			{ActionType: "continue", Description: "計画通りのトレーニングを継続してください。", Priority: "low"},
		})
	return nil
}

// ── P1 Safety Checks ──

func checkP1Safety(input domain.DailyInput, fv domain.FeatureVector, flags domain.ContextFlags, cfg Thresholds, ctx domain.AthleteContext) ([]string, []string) {
	var reasons, reasonsEn []string
	scores := input.SubjectiveScores

	// Pain NRS (masked by NSAID, relaxed for contact+traumatic)
	if !flags.IsMedicationNsaid24h {
		painThreshold := cfg.PainRedFlag
		if ctx.IsContactSport && input.PainType == "traumatic" {
			painThreshold = math.Ceil(cfg.PainRedFlag / 0.7)
		}
		if scores.PainNRS >= painThreshold {
			reasons = append(reasons, fmt.Sprintf("痛みNRSが%.0fで安全閾値（%.0f）以上です。", scores.PainNRS, painThreshold))
			reasonsEn = append(reasonsEn, fmt.Sprintf("Pain NRS %.0f exceeds threshold %.0f.", scores.PainNRS, painThreshold))
		}
	}

	// HR spike (muted during acclimatization)
	if scores.RestingHeartRate != nil && !flags.IsAcclimatization {
		if z, ok := fv.ZScores["resting_heart_rate"]; ok && z > 2.0 {
			reasons = append(reasons, fmt.Sprintf("安静時心拍数が通常値から大幅に上昇しています（Z-Score: %.2f）。", z))
			reasonsEn = append(reasonsEn, fmt.Sprintf("Resting HR significantly elevated (Z=%.2f).", z))
		}
	}

	// Post-fever
	if flags.IsPostFever {
		reasons = append(reasons, "発熱後7日以内のため、段階的な復帰プロトコルに従ってください。")
		reasonsEn = append(reasonsEn, "Within 7 days post-fever.")
	}

	// Post-vaccination
	if flags.IsPostVaccination {
		reasons = append(reasons, "ワクチン接種後7日以内のため、強度を控えた活動を推奨します。")
		reasonsEn = append(reasonsEn, "Within 7 days post-vaccination.")
	}

	// Sleep + Fatigue compound
	if scores.SleepQuality <= 2 && scores.Fatigue >= 8 {
		reasons = append(reasons, fmt.Sprintf("睡眠の質が著しく低下（%.0f）し、疲労度が高水準（%.0f）です。", scores.SleepQuality, scores.Fatigue))
		reasonsEn = append(reasonsEn, fmt.Sprintf("Sleep quality severely impaired (%.0f) with high fatigue (%.0f).", scores.SleepQuality, scores.Fatigue))
	}

	return reasons, reasonsEn
}

// Thresholds type alias for readability.
type Thresholds = config.Thresholds

// ── P2 Compound Condition ──

func checkP2Compound(fv domain.FeatureVector, cfg Thresholds, ctx domain.AthleteContext) ([]string, []string, bool) {
	var reasons, reasonsEn []string

	// PHV age adjustment
	threshold := cfg.ACWRRedLine
	if ctx.Age >= 13 && ctx.Age <= 17 {
		threshold *= 0.867
	}

	isACWRHigh := fv.ACWR > threshold

	// Wellness decline count (Z <= -1.0)
	declinedItems := 0
	for _, z := range fv.ZScores {
		if z <= -1.0 {
			declinedItems++
		}
	}

	if isACWRHigh && declinedItems >= 2 {
		// RED: compound
		reasons = append(reasons, fmt.Sprintf("急性負荷比（ACWR=%.2f）が安全域（%.2f）を超過し、主観的コンディション%d項目が悪化しています。", fv.ACWR, threshold, declinedItems))
		reasonsEn = append(reasonsEn, fmt.Sprintf("ACWR %.2f exceeds safe zone with %d wellness items declining.", fv.ACWR, declinedItems))
		return reasons, reasonsEn, true
	}

	if isACWRHigh {
		// ORANGE: ACWR only
		reasons = append(reasons, fmt.Sprintf("急性負荷比（ACWR=%.2f）が上昇しています。負荷管理に注意してください。", fv.ACWR))
		reasonsEn = append(reasonsEn, fmt.Sprintf("ACWR %.2f elevated. Load management advised.", fv.ACWR))
		return reasons, reasonsEn, false
	}

	return nil, nil, false
}

// ── P3 Chronic Maladaptation ──

func checkP3ChronicMaladaptation(fv domain.FeatureVector) ([]string, []string) {
	isNormal := fv.ACWR >= 0.8 && fv.ACWR <= 1.3
	severeDecline := 0
	for _, z := range fv.ZScores {
		if z <= -1.5 {
			severeDecline++
		}
	}

	if isNormal && severeDecline >= 3 {
		return []string{"練習負荷は適正範囲ですが、主観的コンディションの複数項目が大幅に悪化しています。調整メニューへの切り替えを検討してください。"},
			[]string{fmt.Sprintf("Workload normal (ACWR=%.2f) but %d wellness indicators show severe decline.", fv.ACWR, severeDecline)}
	}
	return nil, nil
}

// ── P4 GAS Exhaustion ──

func checkP4GAS(fv domain.FeatureVector, flags domain.ContextFlags, cfg Thresholds) ([]string, []string) {
	zThreshold := cfg.ZScoreExhaustion
	requiredCount := cfg.ZScoreMultipleCount

	if flags.IsGameDay {
		zThreshold -= 0.5
		requiredCount++
	}
	if flags.IsAcclimatization {
		zThreshold -= 0.5
	}
	if flags.IsWeightMaking {
		requiredCount++
	}

	exhaustionCount := 0
	for _, z := range fv.ZScores {
		if z <= zThreshold {
			exhaustionCount++
		}
	}

	acwrNormal := fv.ACWR <= cfg.ACWRRedLine
	monotonyNormal := fv.MonotonyIndex <= cfg.MonotonyRedLine

	if exhaustionCount >= requiredCount && acwrNormal && monotonyNormal {
		return []string{"複数の主観指標で疲憊傾向が検出されました。リカバリーセッションの導入を推奨します。"},
			[]string{fmt.Sprintf("GAS exhaustion detected: %d subjective metrics below threshold.", exhaustionCount)}
	}
	return nil, nil
}

// ── P4b Allostatic Load ──

func checkP4bAllostatic(input domain.DailyInput, fv domain.FeatureVector) ([]string, []string) {
	sleepZ, hasSleep := fv.ZScores["sleep_quality"]
	fatigueZ, hasFatigue := fv.ZScores["fatigue"]

	if input.SRPE < 4 && hasSleep && sleepZ <= -1.5 && hasFatigue && fatigueZ >= 1.5 {
		return []string{"グラウンド外のストレッサーにより回復力が低下している兆候が検出されました。"},
			[]string{"Non-training stress detected: low sRPE with deteriorated sleep and elevated fatigue."}
	}
	return nil, nil
}

// ── Helper ──

func buildDecision(decision domain.InferenceDecision, priority domain.InferencePriority, reasons, reasonsEn, overrides []string, actions []domain.RecommendedAction) domain.DecisionOutput {
	reason := ""
	for i, r := range reasons {
		if i > 0 {
			reason += "\n"
		}
		reason += r
	}
	reasonEn := ""
	for i, r := range reasonsEn {
		if i > 0 {
			reasonEn += " "
		}
		reasonEn += r
	}

	return domain.DecisionOutput{
		Decision:           decision,
		Priority:           priority,
		Reason:             reason,
		ReasonEn:           reasonEn,
		OverridesApplied:   overrides,
		RecommendedActions: actions,
		ConfidenceLevel:    domain.ConfidenceHigh, // Updated by quality gate later
	}
}
