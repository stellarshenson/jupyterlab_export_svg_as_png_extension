# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.13] - 2026-08-22

### Fixed

- `Copy as PNG` and `Save as PNG` no longer appear on markdown content that holds no SVG - a right-click on the container (left gutter, gap between blocks, area below the last block) offered both items enabled and exported an unrelated graphic from elsewhere in the document; target resolution now walks the clicked element and its ancestors, never the whole subtree
- A click that misses the graphic but lands in a container built to hold exactly one - the image viewer panel, a rendered SVG output, a mermaid wrapper - resolves to that graphic again; the targeting fix above had hidden both items across most of the image viewer panel, where the image can occupy under a fifth of the area
- Right-clicking a raster image that sits beside an SVG one inside the same container no longer offers the export items and saves the SVG instead - a click that lands on an image resolves to that image or to nothing
- A decorative inline `<svg>` - a caption icon, a sparkline, a legend glyph - beside the real figure is no longer exported in its place; inline SVG and SVG images are now counted together and the container must hold exactly one
- `<figure>` is no longer treated as a container built around a single graphic; HTML groups tables, listings and quotations in one too, and a right-click on a table cell inside one exported an unrelated status icon
- A diagram containing nested `<svg>` viewports counts as one graphic again, so near-miss clicks inside its container still offer both items
- A recorded right-click target that has left the DOM now resolves to nothing, so an export can no longer read or name a document the user has closed; the check does not clear the record, so a node that detaches and re-attaches within one gesture - as windowed notebooks do while scrolling - still resolves
- An export item that is offered now always acts. Lumino decides visibility once, when the menu opens, while the command re-resolves when the item is clicked, so a graphic that re-rendered in between left an item that silently did nothing; resolution now falls back to the recorded click point, gated on the element there belonging to the same document widget so a closed document still resolves to nothing
- That coordinate fallback can no longer export the wrong graphic. Resolving by position alone meant a re-render that moved a different image under the recorded point exported that one instead - the user right-clicks one chart and silently saves another; the fallback now also requires the graphic found there to match an identity recorded when the menu opened, and resolves to nothing when it does not
- A right-click inside a diagram built from nested `<svg>` viewports exports the whole diagram rather than the inner fragment under the pointer, and an `<img>` that is not itself SVG but sits inside an `<svg>` resolves to the drawing that owns it
- A failed export now says so. A dead target or a canvas error left both commands failing silently, with nothing beyond a console line; they now raise a notification
- An SVG sized in units rather than pixels - `width="100%"`, the standard responsive idiom - is no longer rasterised with its unit stripped, which turned a 400x260 chart into a 1920x1920 square stretched 1.54x with no error; the width and height attributes are read only when they carry plain pixel values, and anything else falls through to `viewBox`
- A file named `.SVG` is recognised; the extension test is now case-insensitive
- A `contextmenu` event whose target is not an `Element` no longer throws out of `isVisible`, which would have left the menu unable to render
- Removed the mermaid suppression guard, which tested command ids no deployed extension registers and left the branch unreachable

### Added

- Playwright/Galata integration suite covering context-menu targeting: SVG image, mermaid diagram and its wrapper, raster image, paragraph text, container gutter and block gap in rendered markdown, plus a `<figure>` holding one SVG and one raster image, `.svg` and `.png` in the image viewer, the configured target width, a clipboard copy, a re-render under the open menu, a download case asserting the exported PNG is the graphic that was clicked, and a corner-pixel case asserting the export carries the theme's palette
- `docs/defects.md` and `docs/acc-crit-jupyterlab_export_svg_as_png_extension.md` tracking documents

### Changed

- Both commands are no longer registered in the command palette - invoked from there they have no click point, so there is no graphic to act on
- Integration tests run serialised on a port taken from `JUPYTER_TEST_PORT` and never adopt an existing server, and wait longer than galata's built-in 15s for JupyterLab to become ready - on a machine carrying a full set of extensions that default made every test a coin flip

## [1.1.6] - 2026-06-12

### Fixed

- Copying an SVG containing multibyte UTF-8 characters (e.g. `→`, `€`, `—`) no longer throws `InvalidCharacterError: atob ... not correctly encoded` - data-URI SVGs are now decoded with `fetch`, which handles all URL encodings correctly
- Copy as PNG no longer fails with `NotAllowedError: Document is not focused` - the clipboard write is now initiated synchronously within the user gesture, with the conversion resolving via a promise-based `ClipboardItem`
- Hardened the Save as PNG filename hash to use the raw image source, avoiding a potential `decodeURIComponent` throw on malformed escapes

### Changed

- `docs/example-chart.svg` now includes `— € →` so the bundled example exercises the UTF-8 decode path as a regression case

<!-- <START NEW CHANGELOG ENTRY> -->

<!-- <END NEW CHANGELOG ENTRY> -->
