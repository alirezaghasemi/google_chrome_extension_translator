# Build a Production-Grade AI Translation & Screenshot Chrome Extension

## Role

Act as a senior Chrome Extension architect and TypeScript/React engineer.

Build a production-quality Google Chrome Extension for AI-powered webpage translation, contextual explanation, region translation, and intelligent screenshots.

This is NOT a tutorial project.

Do not create a demo, mockup, proof-of-concept, or simplified implementation.

Implement the actual working product with clean architecture, robust state management, error handling, responsive UI, security considerations, and maintainable code.

---

# 1. Product Concept

Create a Chrome Extension that allows users to:

1. Translate an entire webpage.
2. Select any visual region of a webpage with the mouse and translate it.
3. Explain technical terms, abbreviations, concepts, and domain-specific terminology when enabled.
4. Store and manage the user's own Google AI Studio / Gemini API key locally.
5. Display translation/explanation results inside movable floating UI boxes.
6. Configure the position and transparency of translation boxes.
7. Drag translation boxes around the page in real time.
8. Capture normal screenshots.
9. Capture full-page screenshots that require automatic scrolling and stitching.
10. Use AI vision capabilities when translating content that is primarily visual, such as text embedded in images.

The extension must feel like a polished commercial product rather than a developer tool.

---

# 2. Technology Requirements

Use:

- Chrome Extension Manifest V3
- TypeScript
- React
- Vite
- Modern CSS or Tailwind CSS
- Chrome Extension APIs
- Gemini API through the user's own Google AI Studio API key

Do NOT use Manifest V2.

Do NOT create a backend server for the core functionality.

Do NOT send user API keys, webpage content, screenshots, or translation data to any third-party backend other than the Gemini API required by the user's configured model.

Do NOT use remote JavaScript or dynamically execute remote code.

All application logic must be packaged inside the extension.

---

# 3. High-Level Architecture

Use a modular architecture with clear separation of responsibilities.

Recommended structure:

extension/
├── src/
│   ├── background/
│   │   └── service-worker.ts
│   │
│   ├── content/
│   │   ├── content-script.tsx
│   │   ├── selection/
│   │   ├── translation/
│   │   ├── overlays/
│   │   ├── screenshot/
│   │   └── dom/
│   │
│   ├── popup/
│   │   ├── Popup.tsx
│   │   └── components/
│   │
│   ├── options/
│   │   ├── Options.tsx
│   │   └── components/
│   │
│   ├── components/
│   ├── services/
│   │   ├── gemini/
│   │   ├── translation/
│   │   ├── screenshot/
│   │   └── storage/
│   │
│   ├── types/
│   ├── utils/
│   └── styles/
│
├── public/
├── manifest.json
└── package.json

Keep responsibilities separated.

The content script owns page interaction and visual overlays.

The service worker coordinates extension-level actions and Chrome APIs.

The Gemini service handles AI requests.

The storage service handles configuration persistence.

The screenshot service handles viewport capture and full-page screenshot stitching.

---

# 4. Manifest V3

Create a correct Manifest V3 configuration.

Use only permissions actually required.

Prefer optional permissions where practical.

Potential APIs include:

- activeTab
- storage
- scripting
- tabs
- commands

Use host permissions only where required.

The extension must work on normal HTTP/HTTPS websites.

Handle pages where content scripts cannot be injected gracefully, such as Chrome internal pages.

Never assume that every webpage is accessible.

---

# 5. Gemini / Google AI Studio Integration

The user must provide their own Google AI Studio / Gemini API key.

Create a settings screen containing:

- API Key input
- Show/hide API key button
- Save button
- Test Connection button
- Delete Key button
- Current configuration status
- Model selection

Store the API key locally using Chrome extension storage.

Never send the API key to any application-controlled backend.

Never log the API key.

Never expose the API key in console logs.

Never include it in analytics.

Never hardcode an API key.

Provide clear security messaging explaining that the API key belongs to the user.

Use a dedicated Gemini client abstraction so the rest of the application does not depend directly on the HTTP implementation.

The model should be configurable rather than hardcoded throughout the codebase.

Support both:

- text translation
- multimodal/image-based analysis when needed

Implement request timeout, retry handling, rate-limit handling, invalid-key handling, network errors, and malformed AI responses.

---

# 6. Full Page Translation

Add an action:

"Translate Page"

When activated:

1. Analyze the current document.
2. Identify meaningful textual content.
3. Avoid modifying:
   - script
   - style
   - textarea
   - input values
   - code blocks
   - preformatted code
   - editable fields
   - hidden elements
   - browser-generated UI
3. Preserve HTML structure.
4. Preserve links.
5. Preserve images.
6. Preserve layout as much as possible.
7. Detect the source language automatically.
8. Translate into the user's selected target language.
9. Process large pages in batches/chunks.
10. Avoid exceeding Gemini request limits.
11. Preserve paragraph boundaries and semantic structure.
12. Avoid translating the same text repeatedly.
13. Cache translations during the current page session.
14. Provide progress feedback.

The translation engine must not simply replace the entire body.innerText.

It must operate on meaningful DOM text nodes/elements.

Provide:

- Start Translation
- Pause
- Cancel
- Restore Original Page

Restoring the original page must reliably return the DOM to its previous state.

---

# 7. Smart Term Explanation

Add a setting:

"Explain unfamiliar or technical terms"

When enabled, the AI should identify terms that may require contextual explanation.

Example:

Original:

"LLMs are increasingly used for document processing."

Result:

"مدل‌های زبانی بزرگ (LLM) به‌طور فزاینده‌ای برای پردازش اسناد استفاده می‌شوند."

Then optionally:

"LLM یعنی Large Language Model؛ مدلی از هوش مصنوعی که برای درک و تولید زبان طبیعی آموزش داده شده است."

Important:

Do not explain every word.

Only explain terms that are:

- technical
- abbreviated
- domain-specific
- ambiguous
- uncommon
- important for understanding the sentence

The explanation must be contextual to the current page.

Support an adjustable explanation level:

- None
- Important terms only
- Technical terms
- Detailed

---

# 8. Mouse Region Selection

Implement an interaction mode called:

"Translate Region"

When activated:

- Show a selection overlay over the webpage.
- Cursor becomes crosshair.
- User presses the mouse button.
- User drags to create a rectangular selection.
- Display a visible colored border around the selected region.
- Display semi-transparent background outside the selected area.
- Show selection dimensions while dragging.
- Allow cancel with ESC.
- Allow confirmation with mouse release / action button.

The selection must work correctly even when:

- page is scrolled
- browser is zoomed
- webpage uses responsive layouts
- elements are positioned dynamically

Calculate coordinates using viewport/document coordinate systems correctly.

---

# 9. Region Translation Pipeline

When the user selects a region:

First attempt to identify textual DOM content intersecting the selected rectangle.

Extract:

- text
- element boundaries
- semantic context
- nearby headings
- relevant metadata when useful

If the selected region contains normal webpage text:

Send structured text/context to Gemini.

If the selected region contains text embedded inside an image, canvas, PDF viewer, chart, or other non-DOM visual content:

Use screenshot-based multimodal analysis.

Gemini should receive the relevant image when visual analysis is necessary.

The result should contain:

- translation
- detected source language
- optional explanations
- important terminology

Do not send the entire webpage screenshot when only a small region is required.

Crop the selected region before sending it whenever possible.

---

# 10. Translation Result UI

Display translation inside a floating result panel.

The panel must support:

- drag
- resize
- close
- minimize
- copy
- retranslate
- show/hide explanation
- change target language
- opacity adjustment

The panel must not interfere with the webpage.

Use a Shadow DOM or another strong style-isolation mechanism where appropriate.

The webpage's CSS must not break the extension UI.

The extension's CSS must not break the webpage.

---

# 11. Result Position

Provide settings for default result position:

- Top Left
- Top Center
- Top Right
- Center Left
- Center
- Center Right
- Bottom Left
- Bottom Center
- Bottom Right

Also support:

"Remember last position"

If enabled, save the user's manually selected position.

The user must be able to drag the translation panel anywhere inside the viewport.

Position must remain stable when the page scrolls unless explicitly configured otherwise.

---

# 12. Transparency

Provide opacity control.

Example:

0%
10%
20%
30%
40%
50%
60%
70%
80%
90%
100%

Use a smooth slider.

Apply opacity to the visual container without making text unreadable.

Do not make controls unnecessarily transparent.

Keep accessibility and readability as higher priorities than visual effects.

---

# 13. Multiple Result Panels

Support multiple translation/explanation panels when the user performs multiple selections.

Each panel should have:

- unique ID
- source text
- translated text
- explanation
- position
- size
- creation timestamp
- state

The user can:

- move panels independently
- close individual panels
- close all panels
- copy individual results

Avoid uncontrolled DOM growth.

Clean up closed panels and temporary event listeners.

---

# 14. Screenshot Feature

Add:

"Screenshot"

The extension must capture the current visible viewport.

Provide:

- Capture Screenshot
- Copy to Clipboard
- Download
- Preview

The screenshot UI must not appear in the captured result.

Temporarily hide extension overlays before capture when necessary.

---

# 15. Full Page Screenshot

Implement:

"Full Page Screenshot"

Chrome's visible viewport capture alone is not sufficient.

Implement a reliable scrolling and stitching algorithm.

Pipeline:

1. Determine document dimensions.
2. Determine viewport dimensions.
3. Calculate required scroll positions.
4. Capture each viewport.
5. Scroll progressively.
6. Wait for rendering stabilization.
7. Capture the viewport.
8. Correct overlapping regions.
9. Stitch images into one final canvas.
10. Restore the user's original scroll position.
11. Restore page state.
12. Export final image.

Handle:

- fixed headers
- sticky elements
- lazy-loaded images
- dynamically changing pages
- pages taller than a single viewport
- horizontal page dimensions
- browser zoom

Avoid duplicated sticky/fixed UI in the stitched screenshot where possible.

Do not leave the webpage scrolled somewhere else after the operation.

If a page cannot be captured reliably, provide a clear error message instead of producing a corrupted screenshot.

---

# 16. Screenshot Formats

Allow:

- PNG
- JPEG

For JPEG provide quality control.

Example:

Low
Medium
High
Maximum

For very large screenshots:

- avoid unnecessary memory duplication
- release intermediate canvases/images
- prevent browser crashes where possible

---

# 17. Popup UI

Create a professional popup.

The popup should provide:

### Main actions

- Translate Page
- Translate Region
- Screenshot
- Full Page Screenshot

### Quick settings

- Target Language
- Explain Terms
- Explanation Level
- Translation Box Position
- Opacity

### Status

Show:

- Gemini API configured
- Gemini API not configured
- Current model
- Current target language

Use clear icons and concise labels.

Do not overload the popup.

---

# 18. Settings Page

Create a full settings/options page.

Sections:

## General

- Target language
- Source language: Auto Detect / Manual
- Theme
- Enable animations

## Translation

- Explanation enabled
- Explanation level
- Translation style:
  - Natural
  - Literal
  - Professional
  - Technical
- Preserve formatting

## Result Panel

- Default position
- Width
- Maximum height
- Opacity
- Remember position
- Enable dragging

## Screenshot

- Image format
- JPEG quality
- Full-page capture delay
- Automatically restore scroll position

## AI

- Gemini API Key
- Model
- Temperature if supported/appropriate
- Request timeout
- Test connection

## Privacy

Clearly explain:

- API key is stored locally.
- Page content is sent to Gemini only when translation/analysis is requested.
- No application-controlled backend is used.
- No analytics should collect page content or API keys.

---

# 19. Internationalization

Design the UI for:

- English
- Persian

The application must support RTL correctly.

Persian UI should use a high-quality Persian font such as Vazirmatn.

Do not hardcode directional assumptions.

Use logical CSS properties where possible:

- margin-inline
- padding-inline
- inset-inline
- text-align based on direction

Switching between RTL and LTR must not break the layout.

---

# 20. Design System

The visual design must be:

- modern
- minimal
- premium
- clean
- professional
- productivity-focused

Avoid:

- excessive gradients
- unnecessary glassmorphism
- oversized cards
- excessive shadows
- childish illustrations
- excessive animations

Use:

- consistent spacing
- subtle borders
- restrained shadows
- clear hierarchy
- accessible contrast
- smooth but short animations
- professional iconography

The extension should visually resemble a polished modern productivity application.

---

# 21. Interaction Design

All important operations must provide feedback.

Examples:

Translation started:

"Translating page…"

Region selection:

"Select an area to translate"

Gemini request:

"Analyzing…"

Screenshot:

"Capturing…"

Full page screenshot:

"Capturing 4 / 12"

Errors:

"Gemini API key is invalid."

"Unable to access this page."

"Translation failed. Please try again."

Never silently fail.

Prevent duplicate requests caused by double clicks.

Disable or debounce actions when appropriate.

---

# 22. Error Handling

Handle at minimum:

- missing API key
- invalid API key
- expired/restricted API key
- Gemini API errors
- rate limits
- network failures
- timeout
- malformed AI response
- unsupported page
- inaccessible page
- screenshot failure
- huge webpage
- empty selection
- empty page
- iframe content
- dynamically changing DOM

Errors must be human-readable.

Do not expose raw stack traces to normal users.

Log technical details only in development mode.

Never log API keys or sensitive page content.

---

# 23. Performance Requirements

Do not continuously scan the entire DOM.

Use targeted DOM traversal.

Do not attach unnecessary event listeners to every element.

Use event delegation where appropriate.

Avoid repeated layout calculations.

Batch Gemini requests intelligently.

Do not send duplicate text.

Use caching where useful.

Do not block the main webpage thread with expensive operations.

Large pages must remain usable while translation is running.

---

# 24. State Management

Define clear application state.

Example:

ExtensionSettings
TranslationJob
TranslationResult
SelectionState
OverlayState
ScreenshotJob

Persist only settings and data that actually need persistence.

Do not persist webpage content unnecessarily.

Do not persist screenshots unless explicitly requested by the user.

---

# 25. AI Response Contract

Do not rely on uncontrolled natural-language responses.

Request structured JSON from Gemini whenever practical.

Define a schema similar to:

{
  "sourceLanguage": "en",
  "targetLanguage": "fa",
  "translation": "...",
  "explanations": [
    {
      "term": "LLM",
      "meaning": "...",
      "context": "..."
    }
  ]
}

Validate the response before using it.

If parsing fails:

1. Attempt safe recovery.
2. If recovery fails, display a controlled error.
3. Never inject raw AI output directly into the DOM as HTML.

Treat AI-generated content as untrusted data.

---

# 26. Security

Follow Chrome Extension security best practices.

Do NOT use:

- eval()
- new Function()
- remotely hosted executable JavaScript
- unsafe HTML injection
- uncontrolled innerHTML for AI-generated content

Sanitize any rich content.

Prefer textContent and safe DOM APIs.

Use Shadow DOM for isolated extension UI when appropriate.

Never expose API credentials through the page context.

Keep sensitive operations inside the extension's controlled contexts.

---

# 27. Accessibility

Support:

- keyboard navigation
- ESC to cancel region selection
- Enter to confirm where appropriate
- visible focus states
- ARIA labels
- accessible buttons
- sufficient color contrast

Do not make drag-only controls.

Provide keyboard alternatives for major actions.

---

# 28. Keyboard Shortcuts

Add configurable Chrome commands.

Suggested defaults:

Alt + Shift + T
Translate Page

Alt + Shift + R
Translate Region

Alt + Shift + S
Screenshot

Allow users to change shortcuts through Chrome's extension shortcut management where supported.

---

# 29. Context Menu

Add optional right-click actions:

"Translate selected text"

"Translate page"

"Translate selected region"

Do not duplicate functionality unnecessarily.

---

# 30. Important Edge Cases

Explicitly test:

- Wikipedia
- news websites
- documentation websites
- ecommerce pages
- SPA applications
- pages with infinite scrolling
- pages with sticky headers
- pages with iframes
- pages with canvas
- pages containing code
- pages containing tables
- Persian websites
- RTL websites
- mixed Persian/English content
- text inside images
- very long pages
- pages with dynamically injected content

---

# 31. Testing

Create meaningful tests for:

- DOM text extraction
- translation chunking
- language detection handling
- response schema validation
- selection rectangle calculation
- viewport/document coordinate conversion
- overlay positioning
- drag behavior
- opacity configuration
- screenshot stitching
- scroll restoration
- storage operations
- API error handling

Do not consider the project complete simply because it compiles.

---

# 32. Build Quality

The final project must:

- install successfully as an unpacked Chrome Extension
- build without TypeScript errors
- have no obvious runtime errors
- contain no placeholder functionality
- contain no fake API responses
- contain no TODO implementation for core features
- contain no hardcoded API key
- have clean module boundaries
- have clear naming
- have reusable components
- have production-quality error handling

---

# 33. Development Strategy

Do not implement everything as one giant content-script file.

Build the system as independent modules.

Prioritize architecture and correctness over speed of implementation.

Before implementing a feature, inspect the existing project structure and integrate with it instead of unnecessarily rewriting working components.

Do not introduce libraries unless they solve a real problem.

Keep dependencies minimal.

---

# 34. Acceptance Criteria

The implementation is considered successful only when the following workflow works end-to-end:

### Scenario A — Full Page Translation

User opens an English webpage.

User clicks:

Translate Page

The extension:

- extracts meaningful content
- sends appropriate batches to Gemini
- translates content
- displays progress
- preserves page structure
- supports restoring the original page

### Scenario B — Region Translation

User activates:

Translate Region

User drags around a paragraph.

A colored selection rectangle appears.

After release:

- selected content is analyzed
- translation is generated
- explanation is generated when enabled
- result appears in a floating panel

The user can drag the panel anywhere.

### Scenario C — Technical Explanation

Selected text:

"LLM"

Output contains the translated meaning and, when explanation is enabled, a concise contextual explanation of what LLM means.

### Scenario D — Image Text

User selects an image containing English text.

The extension captures only the relevant region.

Gemini multimodal analysis identifies and translates the visible text.

### Scenario E — Screenshot

User clicks Screenshot.

The visible viewport is captured without extension overlays.

User can preview, copy, or download it.

### Scenario F — Full Page Screenshot

User clicks Full Page Screenshot.

The extension:

- scrolls automatically
- captures all sections
- stitches them
- produces one image
- restores the original scroll position

No duplicated sticky header should appear repeatedly if technically avoidable.

---

# 35. Final UX Principle

The extension must feel like:

"Select → Translate → Understand"

not:

"Configure → Wait → Debug"

The user should be able to install the extension, enter their Gemini API key once, and immediately translate pages or regions.

Keep the interface simple while keeping the internal architecture robust.

Do not sacrifice engineering quality for visual appearance.

Do not sacrifice usability for technical complexity.

Build this as a real production-oriented Chrome Extension.