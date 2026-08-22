# Graphics fixture

This paragraph is plain body text with no graphic in it. Right-clicking it must
not offer the PNG export items, even though this document does contain two SVG
graphics further down.

## SVG file

![Quarterly sales chart](chart.svg)

## Mermaid diagram

```mermaid
flowchart LR
    A[Right-click €] --> B{SVG here?}
    B -->|yes| C[Export]
    B -->|no| D[Hide menu]
```

## Raster image

![A raster plot](raster.png)

A final paragraph, so the last block of the document is text rather than an
image.
