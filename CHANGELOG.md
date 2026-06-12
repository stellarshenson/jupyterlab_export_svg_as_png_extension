# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.6] - 2026-06-12

### Fixed

- Copying an SVG containing multibyte UTF-8 characters (e.g. `→`, `€`, `—`) no longer throws `InvalidCharacterError: atob ... not correctly encoded` - data-URI SVGs are now decoded with `fetch`, which handles all URL encodings correctly
- Copy as PNG no longer fails with `NotAllowedError: Document is not focused` - the clipboard write is now initiated synchronously within the user gesture, with the conversion resolving via a promise-based `ClipboardItem`
- Hardened the Save as PNG filename hash to use the raw image source, avoiding a potential `decodeURIComponent` throw on malformed escapes

### Changed

- `docs/example-chart.svg` now includes `— € →` so the bundled example exercises the UTF-8 decode path as a regression case

<!-- <START NEW CHANGELOG ENTRY> -->

<!-- <END NEW CHANGELOG ENTRY> -->
