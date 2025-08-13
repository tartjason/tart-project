# Editable Content Paths and Persistence Plan

## Step 0. Define the path map (single source of truth)
Create a short mapping doc for all editable fields and their JSON paths.

- Home (simple fields)
  - title → `homeContent.title`
  - subtitle → `homeContent.subtitle`
  - description → `homeContent.description`
  - image → `homeContent.imageUrl`

- About (simple fields)
  - title → `aboutContent.title`
  - bio (HTML) → `aboutContent.bio`
  - image → `aboutContent.imageUrl`

- About (structured sections)
  - workExperience[i].role → `content.about.workExperience[i].role`
  - workExperience[i].organization → `content.about.workExperience[i].organization`
  - workExperience[i].years → `content.about.workExperience[i].years`
  - workExperience[i].location → `content.about.workExperience[i].location`
  - workExperience[i].descriptionHtml → `content.about.workExperience[i].descriptionHtml`
  - Repeat similarly for education, awards, press.

## Step 1. Backend: update endpoint with server-chained compile
File: `routes/websiteState.js`

- Add `POST /api/website-state/update-content-batch?compile=true`
- Body: `{ siteId, version, updates: [{ path, type: 'text'|'html'|'style'|'imageUrl', value }] }`

- Validate
  - Whitelist allowed root paths: `homeContent.*`, `aboutContent.*`, `content.about.workExperience[*].*`, etc.
  - Sanitize HTML for `type === 'html'`.
  - Enforce payload size limits.

- Persist
  - Load `WebsiteState` by artist/site.
  - Apply each update to the source-of-truth doc (`models/WebsiteState.js`).
  - Increment a version field for optimistic concurrency.
  - Save.

- Compile
  - Call your existing compile function (refactor current logic in `routes/websiteState.js` into a reusable function if needed).
  - Ensure compiler reads from `homeContent`, `aboutContent`, and `content.about.*` (structured sections) to generate compiled.

- Response
  - Return `{ compiled, version }`.

## Step 2. Compiler alignment
File: `routes/websiteState.js` (compile logic)

- Ensure compile uses only canonical fields:
  - Home: read `homeContent.*` (fall back to defaults if empty).
  - About: read `aboutContent.*` for title/bio/image; render selected sections from `content.about.*`.

- Output
  - Keep emitting `compiled.homeContent` and `compiled.aboutContent` as today.
  - If you also mirror raw content, continue producing `compiled.content.about.*` as needed.

- Confirm background images
  - `aboutContent.imageUrl` and `homeContent.imageUrl` pass through to preview as data-style inline CSS (already covered).

## Step 3. Frontend templates: make fields editable with data paths
Files: `public/templates/home/*.html`, `public/templates/about/split.html`, `public/templates/about/vertical.html`

- For simple fields
  - Add `contenteditable="true"` and `data-content-path="homeContent.title"`, etc.

- For About sections
  - When building `{{about_sections_html}}`, render each field with a precise data-content-path:
    - Example (workExperience):
      - role span → `data-content-path="content.about.workExperience[0].role"`
      - years span → `data-content-path="content.about.workExperience[0].years"`
      - description → `data-content-path="content.about.workExperience[0].descriptionHtml"` (contenteditable, HTML allowed)

- Keep image placeholders as-is for click-to-upload behavior; their content path will be `aboutContent.imageUrl` or `homeContent.imageUrl`.

## Step 4. Frontend: wire editing and Save button
File: `public/js/previewrender.js`

- After each render
  - Query all `[contenteditable][data-content-path]` and attach input/blur handlers that:
    - Mark the field “dirty” in a map: `this._dirty[path] = { value, type }`.
    - Update `this._compiled` at path immediately so preview text reflects edits before save.

- Add a Save button in the preview header
  - Disabled state when no dirty fields; enabled when `this._dirty` has entries.

- On click
  - Build updates from `this._dirty` into a batch with current version.
  - POST to `/api/website-state/update-content-batch?compile=true`.

- On success
  - `this._compiled = res.compiled`
  - Clear `this._dirty`
  - Re-render current page (`create*Preview()`), then `applyDataStyles(previewContent)`
  - Show “Saved” toast; update version.

- On error
  - Show error; keep dirty state so the user can retry.

## Step 5. Frontend: image URL and upload integration
- Clicking the photo placeholder (`split-about-photo-1`, `vertical-about-photo-1`, and Home image):
  - If uploading files:
    - Upload to your asset store → get a URL.
    - Set `this._compiled.aboutContent.imageUrl` (or `homeContent.imageUrl`) immediately for instant preview.
    - Update placeholder element’s data-style and call `applyDataStyles(previewContent)`.
    - Add `{ path: 'aboutContent.imageUrl', type: 'imageUrl', value: url }` to `this._dirty`.
    - Save persists it like any other field.

## Step 6. Data model adjustments (if needed)
File: `models/WebsiteState.js`

- Confirm schema supports:
  - `homeContent` object (title, subtitle, description, imageUrl)
  - `aboutContent` object (title, bio HTML, imageUrl)
  - `content.about.workExperience` (array of structured objects)
  - Similarly for education, awards, press
  - Add a version field for optimistic concurrency.

## Step 7. Remove ID-based placeholder logic
- Delete all `placeholdersById` use across backend and frontend.
- Remove helper calls (like `getTextById`/`getStyleById`/`getContentById` if present).
- Ensure preview reads only from compiled canonical fields.

## Step 8. Validation, sanitization, and safety
- Server
  - Whitelist allowed JSON paths; reject unexpected paths.
  - Sanitize HTML fields (bio, descriptionHtml) to prevent XSS.
  - Limit max field lengths / HTML size.

- Client
  - Optionally sanitize before sending; still treat server as the final gate.
  - Prevent navigation away with unsaved changes (if Save button only).

## Step 9. Testing matrix
- Home
  - Edit title/subtitle/description; Save → compiled updates reflect changes; preview re-renders.
  - Set/clear `homeContent.imageUrl`; verify background image shows/hides.

- About
  - Edit title/bio; Save; switch layouts (split/vertical) to confirm persistence/layout-agnostic rendering.
  - Edit structured `workExperience` fields; reorder items (if supported later) and verify compiled output reflects changes.
  - Set/clear `aboutContent.imageUrl`; confirm in both layouts.

- Error paths
  - Server validation failure, compile failure, network failure: ensure Save shows error and dirty state remains.

## Step 10. UX polish
- Save states:
  - “Save” button with disabled/enabled states.
  - Status text: “Unsaved changes” → “Saving…” → “All changes saved”.
  - Prevent multiple concurrent saves; queue or disable until request completes.

## Step 11. Documentation and cleanup
- Update README to describe the path-based editing model, the update endpoint, and compile flow.
- Remove references to `placeholdersById` in docs and comments.

---

Summary: This plan implements a path-based editing system with a Save button that triggers server-side compile and returns fresh compiled JSON. It uses simple paths for Home and About fields, structured arrays for repeatable sections, and preserves free-form HTML for bio.
