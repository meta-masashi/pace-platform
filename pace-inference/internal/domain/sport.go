// Package domain defines core types for the PACE v6 inference engine.
package domain

// SportID represents a supported sport identifier.
type SportID string

const (
	SportSoccer     SportID = "soccer"
	SportBaseball   SportID = "baseball"
	SportBasketball SportID = "basketball"
	SportRugby      SportID = "rugby"
	SportOther      SportID = "other"
)

// ValidSports lists all supported sport identifiers.
var ValidSports = []SportID{
	SportSoccer,
	SportBaseball,
	SportBasketball,
	SportRugby,
	SportOther,
}

// IsValidSport returns true if the given string is a recognized sport ID.
func IsValidSport(s string) bool {
	for _, v := range ValidSports {
		if string(v) == s {
			return true
		}
	}
	return false
}

// NormalizeSport converts a string to a SportID, defaulting to SportOther
// if the string is not recognized.
func NormalizeSport(s string) SportID {
	if IsValidSport(s) {
		return SportID(s)
	}
	return SportOther
}
