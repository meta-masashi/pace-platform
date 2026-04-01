package domain

// ContextFlags represents runtime conditional flags for context overrides.
type ContextFlags struct {
	IsGameDay              bool `json:"is_game_day"`
	IsGameDayMinus1        bool `json:"is_game_day_minus1"`
	IsAcclimatization      bool `json:"is_acclimatization"`
	AcclimatizationDayCount int  `json:"acclimatization_day_count,omitempty"`
	IsWeightMaking         bool `json:"is_weight_making"`
	IsPostVaccination      bool `json:"is_post_vaccination"`
	IsPostFever            bool `json:"is_post_fever"`
	IsMedicationNsaid24h   bool `json:"is_medication_nsaid_24h,omitempty"`
}

// MedicalHistoryEntry represents a single injury/condition record.
type MedicalHistoryEntry struct {
	BodyPart       string  `json:"body_part"`
	Condition      string  `json:"condition"`
	Date           string  `json:"date"`
	Severity       string  `json:"severity"` // "mild" | "moderate" | "severe"
	RiskMultiplier float64 `json:"risk_multiplier"`
}

// LastKnownRecord holds the most recent valid daily record for imputation.
type LastKnownRecord struct {
	Date                string  `json:"date"`
	SleepQuality        float64 `json:"sleep_quality"`
	Fatigue             float64 `json:"fatigue"`
	Mood                float64 `json:"mood"`
	MuscleSoreness      float64 `json:"muscle_soreness"`
	StressLevel         float64 `json:"stress_level"`
	PainNRS             float64 `json:"pain_nrs"`
	SRPE                float64 `json:"srpe"`
	TrainingDurationMin float64 `json:"training_duration_min"`
}

// AthleteContext contains athlete metadata and historical context.
type AthleteContext struct {
	AthleteID       string                    `json:"athlete_id"`
	OrgID           string                    `json:"org_id"`
	TeamID          string                    `json:"team_id"`
	Age             int                       `json:"age"`
	Sport           string                    `json:"sport"`
	IsContactSport  bool                      `json:"is_contact_sport"`
	ValidDataDays   int                       `json:"valid_data_days"`
	BayesianPriors  map[string]float64        `json:"bayesian_priors"`
	RiskMultipliers map[string]float64        `json:"risk_multipliers"`
	MedicalHistory  []MedicalHistoryEntry     `json:"medical_history"`
	TissueHalfLifes map[TissueCategory]float64 `json:"tissue_half_lifes"`
	LastKnownRecord *LastKnownRecord          `json:"last_known_record,omitempty"`
}
