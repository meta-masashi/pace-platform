// Package config holds pipeline configuration with default values.
package config

// Thresholds defines decision trigger thresholds.
type Thresholds struct {
	PainRedFlag          float64 `json:"pain_red_flag" yaml:"pain_red_flag"`
	RestingHRSpikePercent float64 `json:"resting_hr_spike_percent" yaml:"resting_hr_spike_percent"`
	ACWRRedLine          float64 `json:"acwr_red_line" yaml:"acwr_red_line"`
	MonotonyRedLine      float64 `json:"monotony_red_line" yaml:"monotony_red_line"`
	DecouplingThreshold  float64 `json:"decoupling_threshold" yaml:"decoupling_threshold"`
	ZScoreExhaustion     float64 `json:"z_score_exhaustion" yaml:"z_score_exhaustion"`
	ZScoreMultipleCount  int     `json:"z_score_multiple_count" yaml:"z_score_multiple_count"`
	QualityGateMinScore  float64 `json:"quality_gate_min_score" yaml:"quality_gate_min_score"`
}

// EWMAConfig holds EWMA lambda parameters.
type EWMAConfig struct {
	AcuteSpan   int `json:"acute_span" yaml:"acute_span"`
	ChronicSpan int `json:"chronic_span" yaml:"chronic_span"`
}

// PreparednessConfig holds readiness weights.
type PreparednessConfig struct {
	W1 float64 `json:"w1" yaml:"w1"`
	W2 float64 `json:"w2" yaml:"w2"`
}

// TissueParams holds per-tissue default parameters.
type TissueParams struct {
	HalfLifeDays float64 `json:"half_life_days" yaml:"half_life_days"`
	Alpha        float64 `json:"alpha" yaml:"alpha"`
	Beta         float64 `json:"beta" yaml:"beta"`
	Tau          float64 `json:"tau" yaml:"tau"`
	M            float64 `json:"m" yaml:"m"`
}

// FeatureWeights defines evidence-based feature weights for Node 3.
type FeatureWeights struct {
	ACWRExcess      float64 `json:"acwr_excess" yaml:"acwr_excess"`
	WellnessDecline float64 `json:"wellness_decline" yaml:"wellness_decline"`
	InjuryHistory   float64 `json:"injury_history" yaml:"injury_history"`
	MonotonyInfo    float64 `json:"monotony_info" yaml:"monotony_info"`
}

// PipelineConfig is the complete configuration for the v6 inference pipeline.
type PipelineConfig struct {
	Version        string                    `json:"version" yaml:"version"`
	Thresholds     Thresholds                `json:"thresholds" yaml:"thresholds"`
	EWMA           EWMAConfig                `json:"ewma" yaml:"ewma"`
	Preparedness   PreparednessConfig        `json:"preparedness" yaml:"preparedness"`
	TissueDefaults map[string]TissueParams   `json:"tissue_defaults" yaml:"tissue_defaults"`
	FeatureWeights FeatureWeights            `json:"feature_weights" yaml:"feature_weights"`
}

// ConfigForSport returns a PipelineConfig customized for the given sport.
// Falls back to "other" profile if the sport is not recognized.
// The returned config merges sport-specific overrides onto DefaultConfig().
func ConfigForSport(sport string) PipelineConfig {
	profile := GetSportProfile(sport)

	cfg := DefaultConfig()
	cfg.Version = "v6.2-go"
	cfg.Thresholds.ACWRRedLine = profile.ACWRRedLine
	cfg.Thresholds.MonotonyRedLine = profile.MonotonyRedLine
	cfg.EWMA = profile.EWMA
	cfg.FeatureWeights = profile.Weights
	cfg.TissueDefaults = profile.Tissue
	return cfg
}

// DefaultConfig returns the production default configuration.
// All thresholds match the TypeScript config.ts values exactly.
func DefaultConfig() PipelineConfig {
	return PipelineConfig{
		Version: "v6.0-go",
		Thresholds: Thresholds{
			PainRedFlag:          8,
			RestingHRSpikePercent: 30,
			ACWRRedLine:          1.5,
			MonotonyRedLine:      2.0,
			DecouplingThreshold:  1.5,
			ZScoreExhaustion:     -1.5,
			ZScoreMultipleCount:  2,
			QualityGateMinScore:  0.6,
		},
		EWMA: EWMAConfig{
			AcuteSpan:   7,
			ChronicSpan: 28,
		},
		Preparedness: PreparednessConfig{
			W1: 1.0,
			W2: 2.0,
		},
		TissueDefaults: map[string]TissueParams{
			"metabolic":       {HalfLifeDays: 2, Alpha: 0.5, Beta: 0.3, Tau: 0.5, M: 1.5},
			"structural_soft": {HalfLifeDays: 7, Alpha: 0.3, Beta: 0.1, Tau: 0.8, M: 2.0},
			"structural_hard": {HalfLifeDays: 21, Alpha: 0.1, Beta: 0.05, Tau: 1.2, M: 2.5},
			"neuromotor":      {HalfLifeDays: 3, Alpha: 0.4, Beta: 0.2, Tau: 0.6, M: 1.8},
		},
		FeatureWeights: FeatureWeights{
			ACWRExcess:      2.5,
			WellnessDecline: 2.0,
			InjuryHistory:   1.5,
			MonotonyInfo:    0.3,
		},
	}
}
