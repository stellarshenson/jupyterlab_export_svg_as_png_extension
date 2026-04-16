# jupyterlab_export_svg_as_png_extension

[![GitHub Actions](https://github.com/stellarshenson/jupyterlab_export_svg_as_png_extension/actions/workflows/build.yml/badge.svg)](https://github.com/stellarshenson/jupyterlab_export_svg_as_png_extension/actions/workflows/build.yml)
[![npm version](https://img.shields.io/npm/v/jupyterlab_export_svg_as_png_extension.svg)](https://www.npmjs.com/package/jupyterlab_export_svg_as_png_extension)
[![PyPI version](https://img.shields.io/pypi/v/jupyterlab-export-svg-as-png-extension.svg)](https://pypi.org/project/jupyterlab-export-svg-as-png-extension/)
[![Total PyPI downloads](https://static.pepy.tech/badge/jupyterlab-export-svg-as-png-extension)](https://pepy.tech/project/jupyterlab-export-svg-as-png-extension)
[![JupyterLab 4](https://img.shields.io/badge/JupyterLab-4-orange.svg)](https://jupyterlab.readthedocs.io/en/stable/)
[![Brought To You By KOLOMOLO](https://img.shields.io/badge/Brought%20To%20You%20By-KOLOMOLO-00ffff?style=flat)](https://kolomolo.com)
[![Donate PayPal](https://img.shields.io/badge/Donate-PayPal-blue?style=flat)](https://www.paypal.com/donate/?hosted_button_id=B4KPBJDLLXTSA)

> [!TIP]
> This extension is part of the [stellars_jupyterlab_extensions](https://github.com/stellarshenson/stellars_jupyterlab_extensions) metapackage. Install all Stellars extensions at once: `pip install stellars_jupyterlab_extensions`

Copy or export any SVG graphic in JupyterLab as a high-quality PNG image. Right-click on any SVG element - whether it's a chart output, a diagram, or an inline graphic - and choose to copy it to the clipboard as PNG or save it as a PNG file.

**Full disclosure:** SVG is a perfectly fine format that nobody asked to be converted. But sometimes you need a PNG for a slide deck, a report, or that one colleague who insists on pasting images into Word documents. This extension won't judge. It just converts.

## Features

- **Copy SVG as PNG** - Right-click any SVG in a notebook output or document and copy it as a PNG to the clipboard
- **Save SVG as PNG file** - Download any SVG as a high-quality PNG file with a deterministic filename
- **Theme-aware export** - Resolves `@media (prefers-color-scheme)` CSS in SVGs to match the current JupyterLab theme, so exported PNGs look exactly like what you see
- **Configurable DPI** - Control output resolution from 72 (screen) to 1200 (professional print), default 300
- **Background color options** - Export with transparent, white, black, or custom background color
- **Works everywhere** - Context menu appears on SVG outputs, markdown previews, and HTML rendered content

## Installation

Requires JupyterLab 4.0.0 or higher.

```bash
pip install jupyterlab-export-svg-as-png-extension
```

## Uninstall

```bash
pip uninstall jupyterlab-export-svg-as-png-extension
```
