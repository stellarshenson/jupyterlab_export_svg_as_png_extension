# Defect - Copy/Save as PNG appear on markdown content that holds no SVG

**Component**: `jupyterlab_export_svg_as_png_extension`
**Version**: 1.1.6
**Environment**: JupyterLab 4.6.3, Chrome, GalaxaLab singleuser image
**Severity**: Medium - wrong menu state and a misleading action, no data loss
**Status**: Fixed in 1.1.7. Line references below are to the pre-fix code.
**Date**: 2026-08-21

## Summary

In the Markdown Viewer the context menu changes shape depending on where inside the document the right-click lands. Clicking on a paragraph gives the expected menu; clicking a few pixels away, in the gap between blocks or in the left gutter, adds `Copy as PNG` and `Save as PNG` in an **enabled** state even though there is no diagram under the pointer. Invoking them copies whatever SVG happens to sit elsewhere in the same document.

The behaviour looks intermittent but is fully deterministic. It is decided by which DOM element receives the `contextmenu` event, not by timing.

## Symptom

- Two different menus on the same document, alternating with small pointer movements
- `Copy as PNG` and `Save as PNG` render enabled with nothing to export at the click point
- Acting on them silently exports an unrelated diagram from further down the document
- Reported against a document containing one mermaid diagram; any inline SVG or SVG-backed image reproduces it

## Reproduction

1. Open a Markdown file containing a mermaid diagram in the Markdown Viewer, for example `@docs/tailscale-lab-zone-access.md`
2. Right-click in the middle of a paragraph of body text → menu shows `Refresh View`, `Show Markdown Editor`, `Shift+Right Click for Browser Menu`
3. Right-click in the left gutter of the same paragraph, or in the vertical gap between two blocks → menu additionally shows `Copy as PNG` and `Save as PNG`, both enabled

Confirmed over five alternating clicks driven through Playwright against the live server, with the `contextmenu` target captured in a capture-phase listener:

| Right-click spot | `event.target`            | SVG-bearing `<img>` descendants | Menu                                                                                    |
| ---------------- | ------------------------- | ------------------------------- | --------------------------------------------------------------------------------------- |
| Container gutter | `div.jp-RenderedMarkdown` | 1                               | Refresh View, **Copy as PNG**, **Save as PNG**, Show Markdown Editor, Shift+Right Click |
| Paragraph text   | `p`                       | 0                               | Refresh View, Show Markdown Editor, Shift+Right Click                                   |

Five clicks, five matching outcomes. In the paragraph case the two items carry `lm-mod-hidden` and `display: none`, so `isVisible` is being honoured correctly - the fault is upstream of it, in what the extension considers a target.

## Root cause

`src/index.ts:378-410`, `findSvgTarget()` resolves the export target by searching the clicked element's **descendants** without any bound:

```ts
// Check target and ancestors for inline SVG, then descendants
const svgElement = target.closest('svg') || target.querySelector('svg');   // :396
...
// Check descendants for IMG referencing SVG
const imgs = target.querySelectorAll('img');                               // :402
```

When the pointer lands on a leaf block such as `<p>` the descendant scan finds nothing and the items are correctly hidden. When it lands on the container - the padding, the gutter, the gap between blocks, or the empty area below the last block - `event.target` is `div.jp-RenderedMarkdown`, so `querySelectorAll('img')` returns **every image in the whole document**. The mermaid diagram, rendered by JupyterLab core as `<img src="data:image/svg+xml;...">`, satisfies `isImgSvg()` and is returned as the export target.

Both `isVisible` and `isEnabled` are wired to that same result, so the items appear and enable together. The exported artefact is then the first matching image in document order, which is unrelated to where the user clicked.

## Secondary defect - dead mermaid suppression

`src/index.ts:416-418` gates the markdown suppression on command ids that do not exist in this deployment:

```ts
const hasMermaidExtension = (): boolean =>
  commands.hasCommand('mermaid:copy-as-png') ||
  commands.hasCommand('mermaid:download-as-png');
```

JupyterLab 4.6.3 core ships only `mermaid:copy-source` - verified by scanning the core static bundle, which yields `mermaid:copy-source` and no PNG variants. `jupyterlab_mermaid_latest_extension` is not installed in this image. `hasMermaidExtension()` therefore always returns `false`, the branch at `:437` never fires, and the whole mermaid-conflict path in `shouldShow()` is unreachable. Menu visibility rests entirely on the descendant scan described above.

This is worth fixing on its own: the guard is silently inert, so a future duplicate-entry problem it was meant to prevent would not be caught.

## Ruled out

Listener ordering is **not** implicated, despite the symptom resembling a race. The extension registers its `contextmenu` listener during plugin activation, which completes before Lumino attaches its own document listener, so the bubble-phase handler that sets `lastContextMenuTarget` always runs first and the value is fresh when Lumino builds the menu. This was checked by instrumenting both phases and observing that `.lm-Menu` was already populated by the time a later-registered bubble listener fired, while results stayed perfectly reproducible across repeated clicks.

## Suggested fix

Bound the search to the click point rather than the subtree:

- Keep the direct `target.tagName === 'IMG'` check at `:388`
- Keep `target.closest('svg')` for a click inside an inline SVG
- Drop `target.querySelector('svg')` at `:396` and the `target.querySelectorAll('img')` sweep at `:402-407`

`.jp-ImageViewer` is unaffected, since a click there lands on the `<img>` element itself and is caught by the direct check. Roughly six lines removed in `findSvgTarget()`.

Separately, either correct `hasMermaidExtension()` to the command ids core actually registers, or remove the branch if the descendant fix makes it redundant.

## Suggested verification

- Right-click on paragraph text, on a heading, in the gutter, in a block gap, and below the last block → items hidden in all five cases
- Right-click directly on a mermaid diagram → items visible and enabled, export matches the clicked diagram
- Open an `.svg` file in the Image Viewer and right-click the image → items visible and enabled
- Open a `.png` file in the Image Viewer and right-click the image → items hidden
