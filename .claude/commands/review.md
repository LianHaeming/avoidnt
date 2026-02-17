Review the changes on the current branch compared to main. Look for:

- Bugs or logic errors
- Security issues (XSS, injection, etc.)
- Missing error handling at system boundaries
- CSS changes that might conflict with existing rules (grep app.css thoroughly per CLAUDE.md)
- Forgotten cache-bust version bumps on static assets

Provide a concise summary of findings, grouped by severity.
