package config

// SportProfile defines sport-specific inference parameters.
// Each profile adjusts thresholds, EWMA windows, feature weights,
// tissue defaults, and recommended actions for a given sport.
//
// Evidence references:
//   - Soccer: Qin 2025, Thorpe 2017 (ACWR 1.5, Level 2a)
//   - Baseball: Fleisig 2022, Wilk 2009 (pitcher shoulder/elbow overuse)
//   - Basketball: Svilar 2018 (jump/landing load, conservative ACWR)
//   - Rugby: Gabbett 2016 (high-impact contact, tissue recovery)
type SportProfile struct {
	SportID             string                    `json:"sport_id"`
	IsContactSport      bool                      `json:"is_contact_sport"`
	ACWRRedLine         float64                   `json:"acwr_red_line"`
	ACWRYouthFactor     float64                   `json:"acwr_youth_factor"`
	MonotonyRedLine     float64                   `json:"monotony_red_line"`
	PainThresholdAdjust float64                   `json:"pain_threshold_adjust"`
	EWMA                EWMAConfig                `json:"ewma"`
	Weights             FeatureWeights            `json:"weights"`
	Tissue              map[string]TissueParams   `json:"tissue"`
	RecommendedActions  map[string][]string       `json:"recommended_actions"`
}

// SportProfiles maps sport ID strings to their corresponding profiles.
var SportProfiles = map[string]SportProfile{
	"soccer":     soccerProfile(),
	"baseball":   baseballProfile(),
	"basketball": basketballProfile(),
	"rugby":      rugbyProfile(),
	"other":      otherProfile(),
}

// GetSportProfile returns the SportProfile for the given sport string.
// Falls back to "other" if the sport is not recognized.
func GetSportProfile(sport string) SportProfile {
	if p, ok := SportProfiles[sport]; ok {
		return p
	}
	return SportProfiles["other"]
}

// --- Soccer (default / baseline) ---

func soccerProfile() SportProfile {
	return SportProfile{
		SportID:             "soccer",
		IsContactSport:      true,
		ACWRRedLine:         1.5,
		ACWRYouthFactor:     0.867, // PHV 13-17 adjustment
		MonotonyRedLine:     2.0,
		PainThresholdAdjust: 1.2, // contact sport: traumatic pain threshold raised
		EWMA: EWMAConfig{
			AcuteSpan:   7,
			ChronicSpan: 28,
		},
		Weights: FeatureWeights{
			ACWRExcess:      2.5,
			WellnessDecline: 2.0,
			InjuryHistory:   1.5,
			MonotonyInfo:    0.3,
		},
		Tissue: map[string]TissueParams{
			"metabolic":       {HalfLifeDays: 2, Alpha: 0.5, Beta: 0.3, Tau: 0.5, M: 1.5},
			"structural_soft": {HalfLifeDays: 7, Alpha: 0.3, Beta: 0.1, Tau: 0.8, M: 2.0},
			"structural_hard": {HalfLifeDays: 21, Alpha: 0.1, Beta: 0.05, Tau: 1.2, M: 2.5},
			"neuromotor":      {HalfLifeDays: 3, Alpha: 0.4, Beta: 0.2, Tau: 0.6, M: 1.8},
		},
		RecommendedActions: map[string][]string{
			"RED": {
				"トレーニング中止、医療スタッフによる評価を実施してください",
				"FIFA 11+ 傷害予防プログラムの段階的再開を検討",
			},
			"ORANGE": {
				"高強度トレーニングを30-50%削減してください",
				"接触練習からの一時的除外を検討",
			},
			"YELLOW": {
				"リカバリーセッションを推奨します",
				"FIFA 11+ ウォームアッププロトコルを実施",
			},
			"GREEN": {
				"通常通りトレーニング継続可能です",
				"FIFA 11+ 傷害予防プログラムを日常的に実施",
			},
		},
	}
}

// --- Baseball ---
// Evidence: Fleisig 2022, Olsen 2006, Wilk 2009, Pitch Smart (MLB)
// Key: ACWRRedLine=1.3 (conservative for pitcher shoulder/elbow),
//      ChronicSpan=21 (pitcher recovery cycle), InjuryHistory weight=2.0 (high recurrence)

func baseballProfile() SportProfile {
	return SportProfile{
		SportID:             "baseball",
		IsContactSport:      false,
		ACWRRedLine:         1.3,
		ACWRYouthFactor:     0.867,
		MonotonyRedLine:     2.0,
		PainThresholdAdjust: 1.0, // non-contact
		EWMA: EWMAConfig{
			AcuteSpan:   7,
			ChronicSpan: 21, // shorter chronic window for pitcher recovery cycle
		},
		Weights: FeatureWeights{
			ACWRExcess:      2.0, // lower weight because ACWRRedLine itself is conservative
			WellnessDecline: 2.5, // shoulder/elbow subjective decline is critical (Wilk 2009)
			InjuryHistory:   2.0, // high recurrence rate (Fleisig 2011)
			MonotonyInfo:    0.5, // daily games → structurally high monotony
		},
		Tissue: map[string]TissueParams{
			"metabolic":       {HalfLifeDays: 2, Alpha: 0.5, Beta: 0.3, Tau: 0.5, M: 1.5},
			"structural_soft": {HalfLifeDays: 10, Alpha: 0.3, Beta: 0.1, Tau: 0.8, M: 2.0}, // tendon recovery is slower
			"structural_hard": {HalfLifeDays: 28, Alpha: 0.1, Beta: 0.05, Tau: 1.2, M: 2.5}, // bone stress long-term
			"neuromotor":      {HalfLifeDays: 3, Alpha: 0.4, Beta: 0.2, Tau: 0.6, M: 1.8},
		},
		RecommendedActions: map[string][]string{
			"RED": {
				"投球禁止、医療スタッフによる肩・肘の評価を実施してください",
				"Pitch Smart ガイドラインに基づく段階的復帰プロトコルを検討",
			},
			"ORANGE": {
				"投球数を50%削減、またはブルペン投球のみに制限してください",
				"Thrower's Ten プログラム（レベル1: 軽負荷）を実施",
			},
			"YELLOW": {
				"投球数をモニタリングしながら練習継続可能です",
				"Thrower's Ten プログラム + 肩甲骨安定化エクササイズを推奨",
			},
			"GREEN": {
				"通常通り練習・試合参加可能です",
				"投球前のダイナミックウォームアップ + Thrower's Ten を推奨",
			},
		},
	}
}

// --- Basketball ---
// Evidence: Svilar 2018, Drakos 2010, Hewett 2005, Cumps 2007
// Key: ACWRRedLine=1.4 (conservative for jump/landing load),
//      MonotonyRedLine=2.5 (3-4 games/week → structurally higher monotony)

func basketballProfile() SportProfile {
	return SportProfile{
		SportID:             "basketball",
		IsContactSport:      true,
		ACWRRedLine:         1.4,
		ACWRYouthFactor:     0.867,
		MonotonyRedLine:     2.5, // 3-4 games/week → higher structural monotony
		PainThresholdAdjust: 1.1, // semi-contact
		EWMA: EWMAConfig{
			AcuteSpan:   7,
			ChronicSpan: 28,
		},
		Weights: FeatureWeights{
			ACWRExcess:      2.3, // jump/landing load emphasis (Svilar 2018)
			WellnessDecline: 2.0,
			InjuryHistory:   1.5,
			MonotonyInfo:    0.3,
		},
		Tissue: map[string]TissueParams{
			"metabolic":       {HalfLifeDays: 2, Alpha: 0.5, Beta: 0.3, Tau: 0.5, M: 1.5},
			"structural_soft": {HalfLifeDays: 7, Alpha: 0.3, Beta: 0.1, Tau: 0.8, M: 2.0},
			"structural_hard": {HalfLifeDays: 21, Alpha: 0.1, Beta: 0.05, Tau: 1.2, M: 2.5},
			"neuromotor":      {HalfLifeDays: 3, Alpha: 0.4, Beta: 0.2, Tau: 0.6, M: 1.8},
		},
		RecommendedActions: map[string][]string{
			"RED": {
				"トレーニング中止、医療スタッフによる評価を実施してください",
				"足関節・膝の状態を確認し、段階的復帰プロトコルを検討",
			},
			"ORANGE": {
				"ジャンプ系ドリル・カッティング動作を制限してください",
				"足関節安定性エクササイズ + バランスボードトレーニングを重点実施",
			},
			"YELLOW": {
				"リカバリーセッションを推奨します",
				"ACL予防プログラム（Nordic Hamstring + Single-leg Balance）を実施",
			},
			"GREEN": {
				"通常通りトレーニング継続可能です",
				"足関節安定性プログラム + ACL予防エクササイズを日常的に実施",
			},
		},
	}
}

// --- Rugby ---
// Evidence: Gabbett 2016 (original ACWR study), high-impact contact
// Key: PainThresholdAdjust=1.4 (highest), tissue half-lives shortened

func rugbyProfile() SportProfile {
	return SportProfile{
		SportID:             "rugby",
		IsContactSport:      true,
		ACWRRedLine:         1.5,
		ACWRYouthFactor:     0.867,
		MonotonyRedLine:     2.0,
		PainThresholdAdjust: 1.4, // high-impact contact
		EWMA: EWMAConfig{
			AcuteSpan:   7,
			ChronicSpan: 28,
		},
		Weights: FeatureWeights{
			ACWRExcess:      2.5,
			WellnessDecline: 2.0,
			InjuryHistory:   1.5,
			MonotonyInfo:    0.3,
		},
		Tissue: map[string]TissueParams{
			"metabolic":       {HalfLifeDays: 2, Alpha: 0.5, Beta: 0.3, Tau: 0.5, M: 1.5},
			"structural_soft": {HalfLifeDays: 5, Alpha: 0.3, Beta: 0.1, Tau: 0.8, M: 2.0},  // high-impact shortens recovery
			"structural_hard": {HalfLifeDays: 14, Alpha: 0.1, Beta: 0.05, Tau: 1.2, M: 2.5}, // same
			"neuromotor":      {HalfLifeDays: 3, Alpha: 0.4, Beta: 0.2, Tau: 0.6, M: 1.8},
		},
		RecommendedActions: map[string][]string{
			"RED": {
				"トレーニング中止、医療スタッフによる評価を実施してください",
				"コンタクト練習からの即時除外、HIA（頭部傷害評価）を検討",
			},
			"ORANGE": {
				"コンタクト練習からの一時的除外を検討してください",
				"高強度トレーニングを30-50%削減",
			},
			"YELLOW": {
				"リカバリーセッションを推奨します",
				"非コンタクトの有酸素トレーニングに限定",
			},
			"GREEN": {
				"通常通りトレーニング継続可能です",
				"傷害予防プログラム（肩・頸部の安定化）を日常的に実施",
			},
		},
	}
}

// --- Other (generic fallback, same as soccer defaults) ---

func otherProfile() SportProfile {
	p := soccerProfile()
	p.SportID = "other"
	p.IsContactSport = false
	p.PainThresholdAdjust = 1.0
	p.RecommendedActions = map[string][]string{
		"RED": {
			"トレーニング中止、医療スタッフによる評価を実施してください",
			"段階的復帰プロトコルを検討",
		},
		"ORANGE": {
			"高強度トレーニングを30-50%削減してください",
			"負荷軽減メニューに変更",
		},
		"YELLOW": {
			"リカバリーセッションを推奨します",
			"ウォームアッププロトコルを実施",
		},
		"GREEN": {
			"通常通りトレーニング継続可能です",
			"傷害予防プログラムを日常的に実施",
		},
	}
	return p
}
