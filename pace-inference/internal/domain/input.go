package domain

// SubjectiveScores holds the 6 daily subjective metrics (0-10 scale).
type SubjectiveScores struct {
	SleepQuality     float64  `json:"sleep_quality"`
	Fatigue          float64  `json:"fatigue"`
	Mood             float64  `json:"mood"`
	MuscleSoreness   float64  `json:"muscle_soreness"`
	StressLevel      float64  `json:"stress_level"`
	PainNRS          float64  `json:"pain_nrs"`
	RestingHeartRate *float64 `json:"resting_heart_rate,omitempty"`
}

// GPSExternalLoad holds GPS-derived external load metrics.
type GPSExternalLoad struct {
	TotalDistanceKm   float64  `json:"total_distance_km"`
	HighSpeedRunningM float64  `json:"high_speed_running_m"`
	SprintDistanceM   float64  `json:"sprint_distance_m"`
	AccelerationCount int      `json:"acceleration_count"`
	DecelerationCount int      `json:"deceleration_count"`
	PlayerLoad        *float64 `json:"player_load,omitempty"`
}

// ObjectiveLoad holds device-measured objective load data.
type ObjectiveLoad struct {
	DistanceKm  *float64 `json:"distance_km,omitempty"`
	PlayerLoad  *float64 `json:"player_load,omitempty"`
	ImpactG     *float64 `json:"impact_g,omitempty"`
	SprintCount *int     `json:"sprint_count,omitempty"`
	HSRM        *float64 `json:"hsr_m,omitempty"`
	DeviceKappa float64  `json:"device_kappa"`
}

// DailyInput represents a single day's check-in data.
type DailyInput struct {
	Date                string           `json:"date"`
	SRPE                float64          `json:"srpe"`
	TrainingDurationMin float64          `json:"training_duration_min"`
	SessionLoad         float64          `json:"session_load"`
	SubjectiveScores    SubjectiveScores `json:"subjective_scores"`
	PainType            string           `json:"pain_type,omitempty"` // "traumatic" | "overuse"
	GPSLoad             *GPSExternalLoad `json:"gps_load,omitempty"`
	ObjectiveLoad       *ObjectiveLoad   `json:"objective_load,omitempty"`
	ContextFlags        ContextFlags     `json:"context_flags"`
	LocalTimezone       string           `json:"local_timezone"`
	ResponseLatencyMs   *float64         `json:"response_latency_ms,omitempty"`
}
