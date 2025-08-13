# Content Path Map (Path-Based Editing Model)

This document defines the canonical JSON paths for all editable fields used by the preview. The frontend will render editable fields with `contenteditable` and `data-content-path="<path>"`. The Save button will batch-submit updates using these paths; the backend will persist and then compile, returning fresh compiled JSON.

Notes
- All paths are layout-agnostic (work for split/vertical, etc.).
- Types: `text` (plain), `html` (rich text), `imageUrl` (string URL), `style` (CSS props if ever used).
- The compiler reads only from these canonical fields to produce `compiled.*` data used by `PreviewRenderer`.

## Home
- homeContent.title — type: text
- homeContent.subtitle — type: text
- homeContent.description — type: text
- homeContent.imageUrl — type: imageUrl

## About (simple fields)
- aboutContent.title — type: text
- aboutContent.bio — type: html
- aboutContent.imageUrl — type: imageUrl

## About (structured sections)
These are arrays of objects. Each object’s keys are individually editable via `data-content-path` with array indices.

- content.about.workExperience — Array of:
  - role — type: text
  - organization — type: text
  - years — type: text
  - location — type: text
  - descriptionHtml — type: html

- content.about.education — Array of:
  - degree — type: text
  - school — type: text
  - years — type: text
  - location — type: text
  - descriptionHtml — type: html

- content.about.awards — Array of:
  - title — type: text
  - issuer — type: text
  - year — type: text
  - descriptionHtml — type: html

- content.about.press — Array of:
  - title — type: text
  - outlet — type: text
  - date — type: text
  - url — type: text
  - excerptHtml — type: html

Optional/Custom Sections
- For free-form custom sections, prefer a single rich text blob on a well-named path, e.g., `content.about.customSectionHtml` — type: html.

## Image placeholders
- Home hero/split image: `homeContent.imageUrl`
- About photo (split/vertical): `aboutContent.imageUrl`

## Frontend usage
- Render editable nodes with `contenteditable` and `data-content-path`:
  ```html
  <h2 contenteditable data-content-path="aboutContent.title"></h2>
  <div contenteditable data-content-path="aboutContent.bio"></div>
  <span contenteditable data-content-path="content.about.workExperience[0].role"></span>
  ```
- On Save: collect all edited values into a batch using their paths and types.

## Backend update API (Save button)
Endpoint
- POST `/api/website-state/update-content-batch?compile=true`

Request body
```json
{
  "siteId": "<site-id>",
  "version": 14,
  "updates": [
    { "path": "aboutContent.title", "type": "text", "value": "About Me (Edited)" },
    { "path": "aboutContent.bio", "type": "html", "value": "<p>Updated bio…</p>" },
    { "path": "content.about.workExperience[0].role", "type": "text", "value": "Gallery Assistant" },
    { "path": "aboutContent.imageUrl", "type": "imageUrl", "value": "https://example.com/photo.jpg" }
  ]
}
```

Response body
```json
{
  "compiled": { /* latest compiled JSON used by PreviewRenderer */ },
  "version": 15
}
```

Validation & Sanitization
- Server must whitelist root paths and field keys.
- Sanitize all `html` fields server-side to prevent XSS.
- Enforce max lengths and payload size.

## Compiler contract (inputs → outputs)
Inputs (source-of-truth)
- `homeContent.*`, `aboutContent.*`, `content.about.*`

Outputs (consumed by PreviewRenderer)
- `compiled.homeContent.*`
- `compiled.aboutContent.*`
- Any derived HTML for structured sections is built from `content.about.*`.

## Examples: Data paths in templates
- About Split title:
  - `data-content-path="aboutContent.title"`
- About Split bio (rich text):
  - `data-content-path="aboutContent.bio"`
- About workExperience (first row, role):
  - `data-content-path="content.about.workExperience[0].role"`

## Versioning
- Include an integer `version` in requests; server increments on successful saves to guard against stale writes.
- Client replaces its local `version` with the server-returned value after Save.
