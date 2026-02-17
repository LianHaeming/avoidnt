Implement the following feature. Follow these project conventions:

- Handlers go on `*handlers.Deps`, routes in `main.go`
- htmx GET endpoints return HTML fragments; POST/PUT/PATCH/DELETE return JSON
- Templates use the clone-based system in `tmpl/loader.go`
- No database — flat-file JSON under `data/`
- Bump static asset `?v=N` cache busters if you change CSS/JS

Plan before coding. Describe the approach, then implement.

$ARGUMENTS
