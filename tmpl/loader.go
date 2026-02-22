package tmpl

import (
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"math"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Templates holds all page templates, keyed by page name.
type Templates struct {
	pages map[string]*template.Template
}

// ExecuteTemplate renders a page template by name.
func (t *Templates) ExecuteTemplate(w io.Writer, name string, data any) error {
	tmpl, ok := t.pages[name]
	if !ok {
		return fmt.Errorf("template %q not found", name)
	}
	// Partials are rendered directly by their define name, pages via layout
	if strings.HasPrefix(name, "partials/") {
		// The partial defines a named template; execute the first defined name
		baseName := strings.TrimSuffix(filepath.Base(name), ".html") + "-inner"
		// Try common patterns
		for _, try := range []string{"song-rows-inner", baseName} {
			if tmpl.Lookup(try) != nil {
				return tmpl.ExecuteTemplate(w, try, data)
			}
		}
		// Fallback: execute the template file itself
		return tmpl.Execute(w, data)
	}
	return tmpl.ExecuteTemplate(w, "layout", data)
}

// Load parses all templates. Each page template gets its own clone of the
// shared templates (layout + partials) so {{define "content"}} doesn't collide.
func Load(assetVer string) *Templates {
	funcMap := template.FuncMap{
		// Cache-busting version string for static assets
		"assetVer": func() string { return assetVer },

		// Math / formatting
		"mul":  func(a, b float64) float64 { return a * b },
		"pct":  func(f float64) string { return fmt.Sprintf("%.2f%%", f*100) },
		"itoa": func(i int) string { return strconv.Itoa(i) },
		"add":  func(a, b int) int { return a + b },
		"sub":  func(a, b int) int { return a - b },
		"pctFloat": func(num, denom int) float64 {
			if denom == 0 {
				return 0
			}
			return float64(num) / float64(denom) * 100
		},

		// Strings
		"lower":      strings.ToLower,
		"upper":      strings.ToUpper,
		"capitalize": capitalize,
		"contains":   strings.Contains,
		"join":       strings.Join,
		"trimSpace":  strings.TrimSpace,
		"firstChar": func(s string) string {
			if len(s) == 0 {
				return "?"
			}
			return strings.ToUpper(string([]rune(s)[0]))
		},

		// Colors
		"stageColor":  stageColor,
		"hexToRGBA":   hexToRGBA,
		"stageTint":   func(stage int) string { return hexToRGBA(stageColor(stage), 0.18) },
		"stageBorder": func(stage int) string { return hexToRGBA(stageColor(stage), 0.7) },
		"stageText":   func(stage int) string { return stageColor(stage) },

		// Time
		"relativeTime":   relativeTime,
		"formatDuration": formatDuration,
		"formatTimer":    formatTimer,

		// Nil / comparison helpers
		"deref": func(p *int) int {
			if p == nil {
				return 0
			}
			return *p
		},
		"derefStr": func(p *string) string {
			if p == nil {
				return ""
			}
			return *p
		},
		"derefFloat": func(p *float64) float64 {
			if p == nil {
				return 0
			}
			return *p
		},
		"isNil":     func(p any) bool { return p == nil },
		"notNil":    func(p *string) bool { return p != nil },
		"notNilInt": func(p *int) bool { return p != nil },
		"seq": func(n int) []int {
			s := make([]int, n)
			for i := range s {
				s[i] = i + 1
			}
			return s
		},

		// JSON for embedding data in JS
		"json": func(v any) template.JS {
			b, _ := json.Marshal(v)
			return template.JS(b)
		},

		// Safe HTML/CSS
		"safeCSS": func(s string) template.CSS { return template.CSS(s) },
		"safeURL": func(s string) template.URL { return template.URL(s) },
	}

	// Parse shared templates (layout + partials) as the base.
	base := template.Must(
		template.New("base").Funcs(funcMap).ParseGlob("templates/layout.html"),
	)
	template.Must(base.ParseGlob("templates/partials/*.html"))

	// For each page template, clone the base and parse the page file on top.
	pages := map[string]*template.Template{}
	pageFiles, err := filepath.Glob("templates/*.html")
	if err != nil {
		panic("failed to glob page templates: " + err.Error())
	}

	for _, f := range pageFiles {
		name := filepath.Base(f)
		if name == "layout.html" {
			continue
		}
		clone, err := base.Clone()
		if err != nil {
			panic("failed to clone base template: " + err.Error())
		}
		template.Must(clone.ParseFiles(f))
		pages[name] = clone
	}

	// Also support rendering partials directly (for htmx)
	// Parse song-rows partial as its own template
	partialFiles, _ := filepath.Glob("templates/partials/*.html")
	for _, f := range partialFiles {
		name := "partials/" + filepath.Base(f)
		t := template.Must(template.New("").Funcs(funcMap).ParseFiles(f))
		pages[name] = t
	}

	return &Templates{pages: pages}
}

func capitalize(s string) string {
	if s == "" {
		return s
	}
	r := []rune(s)
	if r[0] >= 'a' && r[0] <= 'z' {
		r[0] -= 32
	}
	return string(r)
}

func stageColor(stage int) string {
	colors := map[int]string{
		1: "#ef4444",
		2: "#f97316",
		3: "#eab308",
		4: "#84cc16",
		5: "#22c55e",
	}
	if c, ok := colors[stage]; ok {
		return c
	}
	return "#9ca3af"
}

func hexToRGBA(hex string, alpha float64) string {
	hex = strings.TrimPrefix(hex, "#")
	if len(hex) != 6 {
		return fmt.Sprintf("rgba(156, 163, 175, %.2f)", alpha)
	}
	r, _ := strconv.ParseInt(hex[0:2], 16, 64)
	g, _ := strconv.ParseInt(hex[2:4], 16, 64)
	b, _ := strconv.ParseInt(hex[4:6], 16, 64)
	return fmt.Sprintf("rgba(%d, %d, %d, %.2f)", r, g, b, alpha)
}

func relativeTime(s *string) string {
	if s == nil || *s == "" {
		return "Never"
	}
	t, err := time.Parse(time.RFC3339, *s)
	if err != nil {
		// Try ISO format without timezone
		t, err = time.Parse("2006-01-02T15:04:05.000Z", *s)
		if err != nil {
			return "Never"
		}
	}
	diff := time.Since(t)
	days := int(math.Floor(diff.Hours() / 24))

	if days == 0 {
		return "Today"
	}
	if days == 1 {
		return "Yesterday"
	}
	if days < 7 {
		return fmt.Sprintf("%d days ago", days)
	}
	if days < 30 {
		return fmt.Sprintf("%d weeks ago", days/7)
	}
	return fmt.Sprintf("%d months ago", days/30)
}

func formatDuration(seconds int) string {
	hours := seconds / 3600
	minutes := (seconds % 3600) / 60
	if hours > 0 {
		return fmt.Sprintf("%dh %dm", hours, minutes)
	}
	if minutes > 0 {
		return fmt.Sprintf("%d min total", minutes)
	}
	return "0 min"
}

func formatTimer(seconds int) string {
	hours := seconds / 3600
	minutes := (seconds % 3600) / 60
	secs := seconds % 60
	if hours > 0 {
		return fmt.Sprintf("%d:%02d:%02d", hours, minutes, secs)
	}
	return fmt.Sprintf("%d:%02d", minutes, secs)
}
