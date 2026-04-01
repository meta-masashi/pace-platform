package domain

// RecommendedAction represents a suggested action from the decision engine.
type RecommendedAction struct {
	ActionType       string `json:"action_type"` // rest, reduce_intensity, modify_menu, medical_review, monitor, continue
	Description      string `json:"description"`
	Priority         string `json:"priority"` // critical, high, medium, low
	RequiresApproval bool   `json:"requires_approval"`
}

// TrendNotice represents a detected trend toward a threshold.
type TrendNotice struct {
	Metric       string  `json:"metric"`
	Direction    string  `json:"direction"` // "rising" | "falling"
	CurrentValue float64 `json:"current_value"`
	Threshold    float64 `json:"threshold"`
	Message      string  `json:"message"` // Japanese
	MessageEn    string  `json:"message_en"`
}

// DecisionOutput holds the final decision with reasoning.
type DecisionOutput struct {
	Decision           InferenceDecision   `json:"decision"`
	Priority           InferencePriority   `json:"priority"`
	Reason             string              `json:"reason"`
	ReasonEn           string              `json:"reason_en"`
	OverridesApplied   []string            `json:"overrides_applied"`
	RecommendedActions []RecommendedAction `json:"recommended_actions"`
	ConfidenceLevel    ConfidenceLevel     `json:"confidence_level"`
}

// FeatureVector holds computed features from Node 2.
type FeatureVector struct {
	ACWR         float64                    `json:"acwr"`
	MonotonyIndex float64                   `json:"monotony_index"`
	Preparedness float64                    `json:"preparedness"`
	TissueDamage map[TissueCategory]float64 `json:"tissue_damage"`
	ZScores      map[string]float64         `json:"z_scores"`
}

// InferenceOutput holds risk scores from Node 3.
type InferenceOutput struct {
	RiskScores              map[string]float64      `json:"risk_scores"`
	PosteriorProbabilities  map[string]float64      `json:"posterior_probabilities"`
	ConfidenceIntervals     map[string][2]float64   `json:"confidence_intervals"`
}

// DataQualityReport describes input data quality.
type DataQualityReport struct {
	QualityScore      float64        `json:"quality_score"`
	TotalFields       int            `json:"total_fields"`
	ValidFields       int            `json:"valid_fields"`
	ImputedFields     []string       `json:"imputed_fields"`
	OutlierFields     []string       `json:"outlier_fields"`
	MaturationMode    MaturationMode `json:"maturation_mode"`
	ImputationMethod  string         `json:"imputation_method,omitempty"`
	GapDays           *int           `json:"gap_days,omitempty"`
	ConfidenceLevel   ConfidenceLevel `json:"confidence_level"`
}

// NodeResult holds the result of a single pipeline node execution.
type NodeResult struct {
	NodeID          string  `json:"node_id"`
	Success         bool    `json:"success"`
	ExecutionTimeMs float64 `json:"execution_time_ms"`
	Warnings        []string `json:"warnings"`
	Error           string  `json:"error,omitempty"`
}

// PipelineOutput is the complete output returned to the caller.
type PipelineOutput struct {
	TraceID              string            `json:"trace_id"`
	AthleteID            string            `json:"athlete_id"`
	Timestamp            string            `json:"timestamp"`
	Decision             DecisionOutput    `json:"decision"`
	FeatureVector        FeatureVector     `json:"feature_vector"`
	Inference            InferenceOutput   `json:"inference"`
	DataQuality          DataQualityReport `json:"data_quality"`
	PipelineVersion      string            `json:"pipeline_version"`
	Engine               string            `json:"engine"` // "go" | "typescript"
	TrendNotices         []TrendNotice     `json:"trend_notices"`
	ExpertReviewRequired bool              `json:"expert_review_required"`
}

// InferRequest is the JSON body received by POST /v6/infer.
type InferRequest struct {
	AthleteContext  AthleteContext  `json:"athlete_context"`
	DailyInput      DailyInput      `json:"daily_input"`
	History         []DailyInput    `json:"history"`
	ConfigOverrides map[string]any  `json:"config_overrides,omitempty"`
}
