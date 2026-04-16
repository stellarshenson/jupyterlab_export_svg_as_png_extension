import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ICommandPalette } from '@jupyterlab/apputils';
import { ISettingRegistry } from '@jupyterlab/settingregistry';

/**
 * Resolve @media (prefers-color-scheme) blocks in SVG style elements
 * to match the current JupyterLab theme. This ensures exported PNGs
 * reflect what the user sees, not the OS color scheme preference.
 */
function resolveThemeStyles(svgElement: SVGElement, themeMode: string = 'system'): void {
  let isDark: boolean;
  if (themeMode === 'dark') {
    isDark = true;
  } else if (themeMode === 'light') {
    isDark = false;
  } else {
    isDark = document.body.dataset.jpThemeLight === 'false';
  }
  const styleElements = svgElement.querySelectorAll('style');

  styleElements.forEach(styleEl => {
    const css = styleEl.textContent || '';
    if (!css.includes('prefers-color-scheme')) {
      return;
    }

    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);

      let resolvedCss = '';
      for (let i = 0; i < sheet.cssRules.length; i++) {
        const rule = sheet.cssRules[i];
        if (rule instanceof CSSMediaRule) {
          const mediaText = rule.media.mediaText;
          if (mediaText.includes('prefers-color-scheme')) {
            const matchesDark = mediaText.includes('dark');
            const matchesLight = mediaText.includes('light');

            if ((isDark && matchesDark) || (!isDark && matchesLight)) {
              // Extract inner rules without the media wrapper
              for (let j = 0; j < rule.cssRules.length; j++) {
                resolvedCss += rule.cssRules[j].cssText + '\n';
              }
            }
            // Skip non-matching theme rules entirely
          } else {
            resolvedCss += rule.cssText + '\n';
          }
        } else {
          resolvedCss += rule.cssText + '\n';
        }
      }

      styleEl.textContent = resolvedCss;
    } catch (e) {
      console.warn(
        '[SVG Extension] Could not parse SVG styles for theme resolution:',
        e
      );
    }
  });
}

/**
 * Convert SVG element to PNG blob using Canvas API.
 * Clones the SVG and resolves theme-dependent styles before rendering.
 */
async function svgToPng(
  svgElement: SVGElement,
  targetDPI: number = 300,
  backgroundColor: string = 'transparent',
  themeMode: string = 'system',
  sourceImgElement?: HTMLImageElement
): Promise<Blob> {
  // Clone to avoid modifying the original DOM element
  const svgClone = svgElement.cloneNode(true) as SVGElement;

  // Resolve theme-dependent CSS so the export matches what the user sees
  resolveThemeStyles(svgClone, themeMode);

  // Get SVG dimensions - prioritize element attributes over getBBox
  let width = 800;
  let height = 600;

  // If we have the source IMG element, use its natural dimensions (most reliable)
  if (
    sourceImgElement &&
    sourceImgElement.naturalWidth &&
    sourceImgElement.naturalHeight
  ) {
    width = sourceImgElement.naturalWidth;
    height = sourceImgElement.naturalHeight;
  } else {
    // Try to get from width/height attributes
    const widthAttr = svgElement.getAttribute('width');
    const heightAttr = svgElement.getAttribute('height');

    if (widthAttr && heightAttr) {
      width = parseFloat(widthAttr.replace(/[^\d.]/g, ''));
      height = parseFloat(heightAttr.replace(/[^\d.]/g, ''));
    } else {
      // Try viewBox
      const viewBox = svgElement.getAttribute('viewBox');
      if (viewBox) {
        const parts = viewBox.split(/[\s,]+/);
        if (parts.length === 4) {
          width = parseFloat(parts[2]);
          height = parseFloat(parts[3]);
        }
      } else {
        // Fall back to getBBox
        try {
          const graphicsElement =
            svgElement as unknown as SVGGraphicsElement;
          const bbox = graphicsElement.getBBox();
          width = bbox.width || 800;
          height = bbox.height || 600;
        } catch (e) {
          console.error('[SVG Extension] Error getting getBBox:', e);
        }
      }
    }
  }

  // Create high-resolution canvas at target DPI
  // SVG native resolution calibrated to match Adobe converter output
  const sourceDPI = 11.5;
  const scale = targetDPI / sourceDPI;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (backgroundColor !== 'transparent') {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Serialize the theme-resolved clone to data URI (avoids CORS/tainted canvas)
  const svgData = new XMLSerializer().serializeToString(svgClone);
  const base64Data = btoa(unescape(encodeURIComponent(svgData)));
  const dataUrl = `data:image/svg+xml;base64,${base64Data}`;

  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataUrl;
  });

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      },
      'image/png'
    );
  });
}

/**
 * Convert IMG element referencing SVG to PNG.
 * Handles both data URI SVGs and HTTP URL SVGs.
 * Fetches/extracts the SVG, resolves theme styles, and renders via svgToPng.
 */
async function imgToPng(
  imgElement: HTMLImageElement,
  targetDPI: number = 300,
  backgroundColor: string = 'transparent',
  themeMode: string = 'system'
): Promise<Blob> {
  const src = imgElement.src || '';

  let svgText: string;
  if (src.startsWith('data:image/svg+xml')) {
    // Extract SVG text from data URI
    if (src.includes(';base64,')) {
      svgText = atob(src.split(';base64,')[1]);
    } else {
      svgText = decodeURIComponent(src.split(',').slice(1).join(','));
    }
  } else {
    // Fetch SVG from HTTP URL (same-origin, e.g. JupyterHub /files/ endpoint)
    const response = await fetch(src);
    svgText = await response.text();
  }

  // Parse as SVG DOM element for theme resolution
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgElement = doc.documentElement as unknown as SVGElement;

  // Delegate to svgToPng which handles theme resolution and rendering
  return svgToPng(svgElement, targetDPI, backgroundColor, themeMode, imgElement);
}

/**
 * Copy PNG blob to clipboard
 */
async function copyPngToClipboard(blob: Blob): Promise<void> {
  const clipboardItem = new ClipboardItem({ 'image/png': blob });
  await navigator.clipboard.write([clipboardItem]);
}

/**
 * Generate simple hash from string (for deterministic filenames)
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).substring(0, 8).padStart(8, '0');
}

/**
 * Generate filename for downloaded PNG based on source widget and content hash
 */
function generateFilename(app: JupyterFrontEnd, content: string): string {
  const widget = app.shell.currentWidget;
  let baseName = 'graphic';

  if (widget) {
    const title = (widget as any)?.title?.label;
    if (title) {
      baseName = title.replace(/\.(md|markdown|ipynb|html|htm)$/i, '');
    }
  }

  const contentHash = simpleHash(content);
  return `svg-${baseName}-${contentHash}.png`;
}

/**
 * Download PNG blob as file
 */
function downloadPng(
  blob: Blob,
  filename: string = 'svg-graphic.png'
): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Initialization data for the jupyterlab_export_svg_as_png_extension extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab_export_svg_as_png_extension:plugin',
  description:
    'Jupyterlab extension to allow copying and exporting any given SVG graphics as PNG',
  autoStart: true,
  optional: [ICommandPalette, ISettingRegistry],
  activate: async (
    app: JupyterFrontEnd,
    palette: ICommandPalette | null,
    settingRegistry: ISettingRegistry | null
  ) => {
    // Settings
    let targetDPI = 300;
    let backgroundColor = 'transparent';
    let exportThemeMode = 'system';

    const resolveBackgroundColor = (
      bgType: string,
      customColor: string
    ): string => {
      switch (bgType) {
        case 'white':
          return '#ffffff';
        case 'black':
          return '#000000';
        case 'custom':
          return customColor;
        default:
          return 'transparent';
      }
    };

    if (settingRegistry) {
      try {
        const settings = await settingRegistry.load(plugin.id);
        targetDPI = settings.get('targetDPI').composite as number;
        const bgType = settings.get('backgroundColor').composite as string;
        const customBgColor = settings.get('customBackgroundColor')
          .composite as string;
        backgroundColor = resolveBackgroundColor(bgType, customBgColor);
        exportThemeMode = settings.get('exportThemeMode').composite as string;

        settings.changed.connect(() => {
          targetDPI = settings.get('targetDPI').composite as number;
          const bgType = settings.get('backgroundColor')
            .composite as string;
          const customBgColor = settings.get('customBackgroundColor')
            .composite as string;
          backgroundColor = resolveBackgroundColor(bgType, customBgColor);
          exportThemeMode = settings.get('exportThemeMode').composite as string;
        });
      } catch (error) {
        console.error('[SVG Extension] Failed to load settings:', error);
      }
    }

    const { commands, contextMenu } = app;

    // Track last right-click target
    let lastContextMenuTarget: EventTarget | null = null;
    document.addEventListener('contextmenu', (e: MouseEvent) => {
      lastContextMenuTarget = e.target;
    });

    // Helper: check if an IMG element references an SVG
    const isImgSvg = (img: HTMLImageElement): boolean => {
      const src = img.src || '';
      // Data URI SVGs
      if (src.startsWith('data:image/svg+xml')) {
        return true;
      }
      // HTTP URL SVGs (e.g. /files/path/to/image.svg?token=...)
      try {
        const url = new URL(src);
        return url.pathname.endsWith('.svg');
      } catch {
        return src.includes('.svg');
      }
    };

    // Helper: find SVG element at the right-click location
    // Searches the target itself, ancestors, and descendants
    const findSvgTarget = ():
      | { type: 'img'; element: HTMLImageElement }
      | { type: 'svg'; element: SVGElement }
      | null => {
      if (!lastContextMenuTarget) {
        return null;
      }
      const target = lastContextMenuTarget as Element;

      // Check if target is IMG referencing SVG (data URI or HTTP URL)
      if (target.tagName === 'IMG') {
        const imgElement = target as HTMLImageElement;
        if (isImgSvg(imgElement)) {
          return { type: 'img', element: imgElement };
        }
      }

      // Check target and ancestors for inline SVG, then descendants
      const svgElement =
        target.closest('svg') || target.querySelector('svg');
      if (svgElement) {
        return { type: 'svg', element: svgElement as SVGElement };
      }

      // Check descendants for IMG referencing SVG
      const imgs = target.querySelectorAll('img');
      for (let i = 0; i < imgs.length; i++) {
        if (isImgSvg(imgs[i] as HTMLImageElement)) {
          return { type: 'img', element: imgs[i] as HTMLImageElement };
        }
      }

      return null;
    };

    // Check if mermaid extension already provides these commands on markdown
    const hasMermaidExtension =
      commands.hasCommand('mermaid:copy-as-png') ||
      commands.hasCommand('mermaid:download-as-png');

    // --- Copy as PNG command ---
    const copySvgCommand = 'svg:copy-as-png';
    commands.addCommand(copySvgCommand, {
      label: 'Copy as PNG',
      caption: 'Copy SVG graphic as PNG image to clipboard',
      isEnabled: () => findSvgTarget() !== null,
      execute: async () => {
        try {
          const found = findSvgTarget();
          if (!found) {
            console.error('[SVG Extension] No SVG element found');
            return;
          }

          let pngBlob: Blob;
          if (found.type === 'img') {
            pngBlob = await imgToPng(
              found.element,
              targetDPI,
              backgroundColor,
              exportThemeMode
            );
          } else {
            pngBlob = await svgToPng(
              found.element,
              targetDPI,
              backgroundColor,
              exportThemeMode
            );
          }
          await copyPngToClipboard(pngBlob);
        } catch (error) {
          console.error(
            '[SVG Extension] Error copying SVG as PNG:',
            error
          );
        }
      }
    });

    // Register context menu for SVG-containing areas
    contextMenu.addItem({
      command: copySvgCommand,
      selector: '.jp-RenderedSVG',
      rank: 10
    });
    // Only register on markdown if mermaid extension doesn't already handle it
    // Note: .jp-RenderedMarkdown always has .jp-RenderedHTMLCommon too, so we
    // only register on one to avoid duplicate menu entries on the same element
    if (!hasMermaidExtension) {
      contextMenu.addItem({
        command: copySvgCommand,
        selector: '.jp-RenderedHTMLCommon',
        rank: 10
      });
    }

    if (palette) {
      palette.addItem({
        command: copySvgCommand,
        category: 'SVG Export'
      });
    }

    // --- Save as PNG command ---
    const downloadSvgCommand = 'svg:download-as-png';
    commands.addCommand(downloadSvgCommand, {
      label: 'Save as PNG',
      caption: 'Save SVG graphic as PNG file',
      isEnabled: () => findSvgTarget() !== null,
      execute: async () => {
        try {
          const found = findSvgTarget();
          if (!found) {
            console.error('[SVG Extension] No SVG element found');
            return;
          }

          let pngBlob: Blob;
          let svgData: string;

          if (found.type === 'img') {
            const src = found.element.src || '';
            svgData = decodeURIComponent(
              src.replace('data:image/svg+xml,', '')
            );
            pngBlob = await imgToPng(
              found.element,
              targetDPI,
              backgroundColor,
              exportThemeMode
            );
          } else {
            svgData = new XMLSerializer().serializeToString(
              found.element
            );
            pngBlob = await svgToPng(
              found.element,
              targetDPI,
              backgroundColor,
              exportThemeMode
            );
          }

          const filename = generateFilename(app, svgData);
          downloadPng(pngBlob, filename);
        } catch (error) {
          console.error(
            '[SVG Extension] Error saving SVG as PNG:',
            error
          );
        }
      }
    });

    contextMenu.addItem({
      command: downloadSvgCommand,
      selector: '.jp-RenderedSVG',
      rank: 11
    });
    if (!hasMermaidExtension) {
      contextMenu.addItem({
        command: downloadSvgCommand,
        selector: '.jp-RenderedHTMLCommon',
        rank: 11
      });
    }

    if (palette) {
      palette.addItem({
        command: downloadSvgCommand,
        category: 'SVG Export'
      });
    }

    console.log(
      'JupyterLab extension jupyterlab_export_svg_as_png_extension is activated!'
    );
  }
};

export default plugin;
