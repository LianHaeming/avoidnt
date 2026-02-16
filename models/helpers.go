package models

// StageColors maps stage (1-5) to hex color.
var StageColors = map[int]string{
	1: "#ef4444", // Red
	2: "#f97316", // Orange
	3: "#eab308", // Yellow
	4: "#84cc16", // Lime
	5: "#22c55e", // Green
}

// StageColor returns the color for a stage, with a fallback.
func StageColor(stage int) string {
	if c, ok := StageColors[stage]; ok {
		return c
	}
	return "#9ca3af"
}
