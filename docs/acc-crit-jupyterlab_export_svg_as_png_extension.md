# Acceptance Criteria - jupyterlab_export_svg_as_png_extension

Right-click context menu that copies or saves any SVG graphic in JupyterLab as a PNG. Conversion is client-side via the Canvas API; the export theme is resolved from the JupyterLab theme, and the output width is a user setting.

## Contents

- [Context menu targeting](#context-menu-targeting)
- [Conversion](#conversion)
- [Settings](#settings)

## Context menu targeting

The menu items are offered for the graphic under the pointer. A click that lands on a graphic resolves to that graphic and stops there. A click that lands on anything else resolves through its ancestors, then falls back to the three containers JupyterLab builds around a single graphic - `.jp-RenderedSVG`, `.jp-RenderedMermaid`, `.jp-ImageViewer` - and only when the container holds exactly one. `.jp-RenderedMarkdown` is excluded from that fallback, so a click on document whitespace cannot adopt a graphic located elsewhere on the page; `figure` is excluded because HTML groups tables, listings and quotations in one too.

| Right-click point                               | Copy as PNG / Save as PNG | Export target |
| ----------------------------------------------- | ------------------------- | ------------- |
| On an inline `<svg>` or its children            | visible, enabled          | that `<svg>`  |
| On an `<img>` whose source is SVG               | visible, enabled          | that `<img>`  |
| Inside a container holding exactly one graphic  | visible, enabled          | that graphic  |
| On a paragraph, heading, gutter, block gap      | hidden                    | -             |
| On an `<img>` that is not SVG                   | hidden                    | -             |
| Inside a container holding two or more graphics | hidden                    | -             |

- [x] **Visible only on the graphic** - items render only when the right-click lands on an SVG-bearing element or one of its descendants; every other click point hides them
  - log: 2026-08-21 criterion added, fixed with `DEF-1` (v1.1.7)
  - log: 2026-08-21 covered by ui-tests/tests/context-menu.spec.ts
- [x] **No unbounded descendant search** - `findSvgTarget()` never sweeps the clicked element's whole subtree; the only descendant search is inside `SINGLE_GRAPHIC_HOLDERS`, gated on the container holding exactly one graphic
  - log: 2026-08-21 criterion added, fixed with `DEF-1` (v1.1.7)
- [x] **Export matches the click** - the exported PNG is the graphic that was right-clicked, never the first matching graphic in document order
  - log: 2026-08-21 criterion added, fixed with `DEF-1` (v1.1.7)
  - log: 2026-08-21 covered by ui-tests/tests/context-menu.spec.ts
- [x] **Hidden, not disabled** - when there is nothing to export the items carry `lm-mod-hidden` rather than appearing greyed out
  - log: 2026-08-21 criterion added, held through the `DEF-1` fix (v1.1.7)
- [ ] **Rendered SVG output** - right-click on a `.jp-RenderedSVG` notebook output (matplotlib with `figure_format='svg'`) shows both items enabled
  - log: 2026-08-21 criterion added
  - log: 2026-08-21 not covered by tests: rendering a stored SVG output needs a trusted notebook, which the galata harness cannot produce without a kernel run
  - log: 2026-08-22 still open, and the only criterion that is. Residual risk is narrow: `.jp-RenderedSVG` shares its resolution path with the two containers the suite does drive (`.jp-RenderedMermaid`, `.jp-ImageViewer`), so what is unverified is the selector registration for this one container, not the logic behind it. Closing it needs a kernel-executing notebook fixture
- [x] **Markdown inline SVG** - right-click on an inline `<svg>` inside rendered markdown shows both items enabled
  - log: 2026-08-21 criterion added
  - log: 2026-08-21 not reachable in rendered markdown: JupyterLab's sanitizer has no `svg` in allowedTags, and notebook SVG outputs render as `<img>`, so this path applies only to renderers that inject inline SVG (plotly, vega)
  - log: 2026-08-22 closed as not applicable: the criterion names a path the sanitizer forecloses, so it can neither pass nor fail as written. The inline-`<svg>` branch it was meant to cover is exercised through `.jp-ImageViewer`, and remains reachable in practice only via plotly and vega
- [x] **Mermaid diagram** - right-click on a mermaid diagram (core renders it as `<img src="data:image/svg+xml;...">`) shows both items enabled
  - log: 2026-08-21 criterion added
  - log: 2026-08-21 closed: verified in browser against live server
  - log: 2026-08-21 menu state covered by ui-tests/tests/context-menu.spec.ts; exporting the diagram itself is asserted only for chart.svg
- [x] **Image Viewer SVG file** - `.svg` opened as a file shows both items enabled on the image
  - log: 2026-08-21 criterion added
  - log: 2026-08-21 closed: verified in browser against live server (v1.1.7)
  - log: 2026-08-21 covered by ui-tests/tests/context-menu.spec.ts
- [x] **Image Viewer export** - `Save as PNG` on an `.svg` opened as a file produces the PNG, not only the menu entry
  - log: 2026-09-02 criterion added after DEF-19: the three criteria above assert menu state only, and every one of them held while this export could not run at all for any file. A path is not covered by proof that it is offered
  - log: 2026-09-02 closed: covered by 'exports the file, whose blob URL is already revoked', which asserts the blob URL is unreadable before exporting and then pins the export at chart.svg's own 1920x1248; mutation restoring the URL-only read produces no download at all
- [x] **No duplicate entries** - a single right-click contributes at most one `Copy as PNG` and one `Save as PNG`, despite registration on `.jp-RenderedSVG`, `.jp-RenderedHTMLCommon` and `.jp-ImageViewer`
  - log: 2026-08-21 criterion added
  - log: 2026-08-21 closed: verified in browser against live server (v1.1.7)
  - log: 2026-08-21 covered by ui-tests/tests/context-menu.spec.ts
- [x] **Edge: Image Viewer non-SVG file** - `.png` or `.jpg` opened as a file hides both items
  - log: 2026-08-21 criterion added
  - log: 2026-08-21 closed: verified in browser against live server (v1.1.7)
  - log: 2026-08-21 covered by ui-tests/tests/context-menu.spec.ts
- [x] **Edge: markdown paragraph text** - right-click on body text hides both items even when the document contains a diagram
  - log: 2026-08-21 criterion added
  - log: 2026-08-21 closed: verified in browser against live server (v1.1.7)
  - log: 2026-08-21 covered by ui-tests/tests/context-menu.spec.ts
- [x] **Edge: markdown gutter, block gap, below last block** - all three hide both items
  - log: 2026-08-21 criterion added
  - log: 2026-08-21 closed: verified in browser against live server
  - log: 2026-08-21 gutter and block gap covered by ui-tests/tests/context-menu.spec.ts; below-last-block is manual only
- [x] **Container holding one graphic** - a click inside `.jp-RenderedSVG`, `.jp-RenderedMermaid` or `.jp-ImageViewer` that misses the graphic still offers both items, provided the container holds exactly one graphic
  - log: 2026-08-21 criterion added, fixed with `DEF-3`
  - log: 2026-08-21 covered by ui-tests/tests/context-menu.spec.ts
  - log: 2026-08-21 `figure` removed from the container list with `DEF-8`
- [x] **A click on a graphic stops there** - right-clicking an `<img>` resolves to that image or to nothing; it never falls through to the container search and offers a neighbouring graphic instead
  - log: 2026-08-21 criterion added, fixed with `DEF-6`
  - log: 2026-08-21 covered by ui-tests/tests/context-menu.spec.ts
- [x] **One graphic means one of either kind** - inline `<svg>` and SVG `<img>` are counted together, so a decorative icon beside the real figure hides the items rather than being exported in its place
  - log: 2026-08-21 criterion added, fixed with `DEF-7`
- [x] **Nested `<svg>` is one graphic** - a diagram containing nested SVG viewports counts as one, so near-miss clicks inside its container still offer both items
  - log: 2026-08-21 criterion added, fixed with `DEF-9`
  - log: 2026-08-21 not covered by tests: rendered markdown strips inline `<svg>`, and a `.jp-RenderedSVG` output needs a trusted notebook
- [x] **Edge: stale target after the document closes** - a recorded right-click target that has left the DOM resolves to nothing, so no export can name or read a closed document
  - log: 2026-08-21 criterion added, fixed with `DEF-4`
  - log: 2026-08-21 the check no longer clears the record, so a node that detaches and re-attaches within one gesture still resolves (`DEF-10`)
- [x] **An offered item always acts** - an item shown in the menu still exports when clicked, even if the graphic re-renders while the menu is open
  - log: 2026-08-21 criterion added; open as `DEF-11` - Lumino evaluates visibility once at menu-open and the command re-resolves at click time, so a re-render in between leaves an item that silently does nothing
  - log: 2026-08-22 fixed with `DEF-11`: resolution falls back to the recorded click point when the recorded node has gone, gated on the element there belonging to the same document widget
  - log: 2026-08-22 covered by ui-tests/tests/context-menu.spec.ts
- [x] **Edge: non-Element right-click target** - a synthetic `contextmenu` on a non-Element resolves to nothing rather than throwing out of `isVisible`
  - log: 2026-08-21 criterion added, fixed with `DEF-5`
- [x] **No palette entries** - neither command is registered in the command palette; an invocation with no click point has no graphic to act on
  - log: 2026-08-21 criterion added, replaces the former 'Edge: no prior right-click'

## Conversion

Client-side Canvas rendering; theme-dependent CSS in the source SVG is resolved against the active JupyterLab theme before rasterising.

- [x] **Theme resolution** - `@media (prefers-color-scheme)` blocks are resolved against the JupyterLab theme, not the OS setting, so the PNG matches what is on screen
  - log: 2026-08-21 criterion added, implemented earlier (v0.1.1)
  - log: 2026-08-22 covered by ui-tests/tests/context-menu.spec.ts: the exported corner pixel is asserted white under the default settings and `#1e1e1e` under `exportThemeMode: 'dark'`
- [x] **UTF-8 sources** - an SVG containing multibyte characters (`->`, `EUR`, en dash) converts without `InvalidCharacterError`; `data:` and `http:` sources decode via `fetch`, which handles every URL escaping form natively, and a `blob:` source is read from the document model instead
  - log: 2026-08-21 criterion added, fixed earlier (v1.1.6)
  - log: 2026-08-21 not covered by tests: the multibyte fixture only ever travels the http-URL path, and the suite's one data-URI SVG is pure ASCII
  - log: 2026-08-22 left uncovered deliberately: the failure mode is corrupted glyphs, which no dimension or byte-count assertion can detect, and the pre-fix code is not in this repository's history (single commit), so no mutation can prove a candidate test would bite. Pinning it honestly needs a rendered-text comparison
  - log: 2026-09-02 amended: `blob:` removed from the fetch list. DEF-19 established that the image viewer's blob URL is revoked before the graphic is on screen, so that form is never fetchable; it now reads `context.model.toString()`, which is the same string the viewer built its Blob from, so the decoding this criterion is about does not arise for it
- [x] **Clipboard gesture** - `navigator.clipboard.write()` is initiated synchronously inside the user gesture with a promise-backed `ClipboardItem`, so copying never fails with `NotAllowedError: Document is not focused`
  - log: 2026-08-21 criterion added, fixed earlier (v1.1.6)
- [x] **Aspect ratio** - canvas width is the configured target width, height is `round(sourceHeight * targetWidth / sourceWidth)`
  - log: 2026-08-21 criterion added, implemented earlier (v1.1.1)
- [x] **Filename** - saved file is `svg-<widget-title>-<hash>.png`, hash derived from the document text where there is one, else from the raw image source
  - log: 2026-08-21 criterion added
  - log: 2026-08-21 only the `svg-*.png` shape is asserted; neither the title segment nor the hash is checked
  - log: 2026-08-22 closed: the download assertion now pins `svg-graphics-<8 base36>.png`, so both the stripped widget title and the hash shape are checked; mutation-verified against the real value `svg-graphics-00hvb24e.png`
  - log: 2026-09-02 amended: the raw source is a `blob:` uuid in the image viewer, freshly minted on every render, so the same unchanged file was named differently on every export. The document text is used where one resolves; pinned by the reopen half of 'exports the file, whose blob URL is already revoked'

## Settings

- [x] **Target width** - `targetWidth` in pixels, 64 to 8192, default 1920
  - log: 2026-08-21 criterion added, implemented earlier (v1.1.3)
- [x] **Background** - `backgroundColor` one of transparent, white, black, custom; custom reads `customBackgroundColor`
  - log: 2026-08-21 criterion added, implemented earlier (v0.1.1)
  - log: 2026-08-21 not covered by tests: no assertion reads a pixel, so returning transparent unconditionally leaves the suite green
  - log: 2026-08-22 still uncovered: `chart.svg` paints a full-bleed background rect, so the canvas background never shows through it; covering this needs a fixture without one
- [x] **Export theme mode** - `exportThemeMode` one of system, light, dark; system follows the active JupyterLab theme
  - log: 2026-08-21 criterion added, implemented earlier (v0.1.1)
- [x] **Live reload** - changing a setting takes effect on the next export without reloading JupyterLab
  - log: 2026-08-21 criterion added, implemented earlier (v1.1.1)
