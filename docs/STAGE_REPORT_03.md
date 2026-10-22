# Stage report 3: design editor and form customisation upgrade

## 1. Features

### Choice buttons: style each option, a whole question, or every option in the form
- Click an option in the preview, or use **✦ → Style this option in Design** in Questions. The option has its own controls:
  - font, size and weight
  - width and minimum height
  - padding
  - background: solid, gradient, texture or image
  - border colour, width and per-corner radius, with square, rounded and pill presets
  - text alignment
  - hover, selected and focus colours
  - shadow and opacity
- **Apply changes to:**
  - **This option only**: stored with the option.
  - **All options in this question**: also controls stacked or side-by-side layout, group alignment and spacing between options.
  - **All option buttons in the form**.
- **Overrides are kept:** each level only fills in what the level below hasn't set, so a form-wide change never overwrites a question's or option's own style. Each level has its own reset (**Reset this option**, **Reset this question's options**, colour reset icons, and **Reset all element styles** in Advanced).
- **Same everywhere:** the builder preview and the customer form use the same renderer and CSS.
- **Fix:** choosing a background colour for an option or outline button now shows it. These start see-through, so the fill is made opaque unless you've set an opacity yourself.

### Heading artwork
- **Where:** upload a logo, illustration or banner under **Questions → Form heading** or **Design → Heading artwork**. It is separate from the existing event banner artwork.
- **Controls:**
  - width (px or %), height and fit (when proportions aren't kept), minimum and maximum width, maximum height
  - padding and margin on all four sides
  - horizontal alignment, plus vertical alignment when the artwork sits beside the text
  - background, border colour, width and radius, opacity and shadow
  - position above, below, left or right of the heading text
- **Resizing:** when you select the artwork in the preview, a blue handle appears in its corner; drag it to resize.
- **Proportions** are kept by default.
- **Narrow screens:** artwork beside the text moves above it automatically.

### Artwork and colour swatches on questions and options
- **Any question that takes an answer** (not headings, text or dividers) can have its own artwork above, below, left or right of it, and a row of round colour swatches beneath it.
- **Choice and multi-select options** can each have their own artwork and swatches, under **✦** on the option row.
- **Options editor:** options are now edited one per row, with add, rename, move and remove. Artwork, swatches and styles move with their option. **Paste a list** is still available, and options that keep their wording keep their extras.
- **Swatch settings:**
  - add, remove and reorder colours, each with a HEX code and a picker
  - optional colour names
  - size, spacing, alignment, border, and round by default (switch off for rounded squares)
  - selected outline colour and width, and space above and below
- **Customer form:** swatches can be **selectable**, so the customer picks one, and the choice can be required. On an option, the colour is only required when that option is picked. The choice goes into the form's answers as `<question>__color` or `<question>__o<n>__color`, for example `Red (#C62828)`.

### Customer messages (Settings → Messages customers see)
- **Thank-you message:** placeholders `{order_number}`, `{business}` and `{form_title}`. Includes a filled-in preview, reset to default, and a **Thank-you screen** toggle in the builder preview.
- **Permission checkbox text:** this used to be fixed in the code ("Send me SMS updates… Reply STOP to opt out."). It now has placeholders `{channel}` and `{business}`, a preview and reset to default. Existing forms keep the default until changed. A warning appears if text-message wording doesn't say how to opt out.
- **Unknown placeholders** are flagged and shown exactly as typed.
- **Saved per form:** `forms.thanks` and `forms.settings.notify.consentText`.

## 2. Files

| | Files |
|---|---|
| New | `src/lib/design/media.ts`, `src/components/builder/media-controls.tsx`, `src/app/dev/assets/[...path]/route.ts`, `tests/e2e/customize.py`, `docs/STAGE_REPORT_03.md` |
| Changed | `src/lib/design/engine.ts`, `src/lib/design/color.ts`, `src/lib/validation/form.ts`, `src/components/form/FormRenderer.tsx`, `src/components/form/form.css`, `src/components/builder/{Builder,QuestionsPanel,SettingsPanel,DesignPanel}.tsx`, `src/components/builder/builder.css`, `src/components/builder/design/{paths.ts,context.tsx,controls.tsx,groups.tsx,sections.tsx}`, `src/app/dev/{sample.ts,builder/page.tsx,form/page.tsx}`, unit tests, `tests/e2e/builder.py`, `package.json` |

## 3. Database and setup

- **No migration and no new environment variables.** Everything is stored in the existing JSON columns:
  - `forms.design.headArt`
  - `form_fields.config.art`, `.swatches` and `.optMeta`
  - `forms.settings.notify.consentText`
- **Server checks before every save:** each question's settings are re-normalised. Numbers are clamped, words checked against allowed lists, colours parsed, images limited to `form-assets/{business-id}/…` paths, and swatches capped at 24 per row. A question's settings must stay under 30 KB.
- **Images:** uploaded to the existing `form-assets` bucket, with the same per-business storage rules as before. SVG files are converted to PNG in the browser.

## 4. Tests

| Check | Result |
|---|---|
| typecheck, lint, production build | pass |
| Unit tests (Vitest) | 29/29, including save-and-reload of every new setting, hostile artwork and swatch values, and per-option paths |
| New browser checks (`tests/e2e/customize.py`) | 59/59. Covers: upload, replace, undo and remove; drag resize; per-option, per-question and form-wide styles with overrides kept; swatch add, edit, reorder and remove; required colour choice on the customer form; messages, preview and reset; phone layout |
| Existing builder and public-form checks | 67/67 |
| Smoke tests | 21/21 |
| Database security tests (local Postgres) | 100/100 |
| **Live Supabase** (transaction rolled back, verified nothing left behind) | `save_form_draft` stored the full payload as your account (largest question settings 5.3 KB). `publish_form` and the public `get_public_form` returned the heading artwork and option settings. A user from another business saw 0 fields, couldn't overwrite the form ("Form not found") and couldn't upload into your business's storage folder. |
| Dev-only routes in a normal build | `/dev/*` return 404 (also blocked on Vercel) |

The browser tests use the development harness, which saves to memory and keeps uploaded images in an in-memory stand-in for the bucket. Real uploads to Supabase Storage go through the same code path and storage rules as Stage 5, but they haven't been run from this workspace.

## 5. Known limitations
- **Customer answers aren't stored yet.** That includes the chosen colour: submissions are Stage 6, so the colour is collected in the form's data but not saved. The thank-you screen can be previewed in the builder, and customers will see it once submissions are switched on.
- **Removed or replaced images stay in storage**, so Undo keeps working. A clean-up of unused files is a later task.
- **Drag-to-resize changes width only.** Height follows the image's proportions, or use the Height setting.
