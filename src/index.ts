import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { Notification } from '@jupyterlab/apputils';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

/**
 * Resolve @media (prefers-color-scheme) blocks in SVG style elements
 * to match the current JupyterLab theme. This ensures exported PNGs
 * reflect what the user sees, not the OS color scheme preference.
 */
function resolveThemeStyles(
  svgElement: SVGElement,
  themeMode: string = 'system'
): void {
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
 * The output width is fixed to `targetWidth`; height scales to preserve
 * the SVG's aspect ratio.
 */
async function svgToPng(
  svgElement: SVGElement,
  targetWidth: number = 1920,
  backgroundColor: string = 'transparent',
  themeMode: string = 'system',
  sourceImgElement?: HTMLImageElement
): Promise<Blob> {
  // Clone to avoid modifying the original DOM element
  const svgClone = svgElement.cloneNode(true) as SVGElement;

  // Resolve theme-dependent CSS so the export matches what the user sees
  resolveThemeStyles(svgClone, themeMode);

  // Get SVG source dimensions - prioritize element attributes over getBBox
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

    // `100%` is the standard responsive-SVG idiom; stripping its unit yields
    // 100x100 and a square export, so only a unitless or px value is a size.
    // Anything else falls through to the viewBox, which is already correct.
    const PX = /^\s*[\d.]+(px)?\s*$/;
    if (widthAttr && heightAttr && PX.test(widthAttr) && PX.test(heightAttr)) {
      width = parseFloat(widthAttr);
      height = parseFloat(heightAttr);
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
          const graphicsElement = svgElement as unknown as SVGGraphicsElement;
          const bbox = graphicsElement.getBBox();
          width = bbox.width || 800;
          height = bbox.height || 600;
        } catch (e) {
          console.error('[SVG Extension] Error getting getBBox:', e);
        }
      }
    }
  }

  // Scale the canvas so its width equals targetWidth, preserving aspect ratio
  const scale = targetWidth / width;

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = Math.round(height * scale);

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
    canvas.toBlob(blob => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to convert canvas to blob'));
      }
    }, 'image/png');
  });
}

/**
 * Convert IMG element referencing SVG to PNG.
 * Handles data URI SVGs (base64 or url-encoded), blob URLs, and HTTP URLs.
 * Fetches the source - the Fetch API natively decodes every URL form into
 * correct UTF-8 text, avoiding the encoding pitfalls of manual
 * atob/decodeURIComponent (which break on multibyte characters such as
 * arrows or accented letters embedded in the SVG).
 *
 * `source` short-circuits that fetch with markup the caller already holds. It
 * is what makes the image viewer exportable at all: that viewer revokes its
 * blob URL inside the image's own load handler, so the URL is dead before the
 * graphic is even on screen and fetching it throws (DEF-19).
 */
async function imgToPng(
  imgElement: HTMLImageElement,
  targetWidth: number = 1920,
  backgroundColor: string = 'transparent',
  themeMode: string = 'system',
  source?: string
): Promise<Blob> {
  const svgText = source ?? (await (await fetch(imgElement.src || '')).text());

  // Parse as SVG DOM element for theme resolution
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const svgElement = doc.documentElement as unknown as SVGElement;

  // Delegate to svgToPng which handles theme resolution and rendering
  return svgToPng(
    svgElement,
    targetWidth,
    backgroundColor,
    themeMode,
    imgElement
  );
}

/**
 * Copy a PNG to the clipboard, given a promise that resolves to the blob.
 *
 * The ClipboardItem is constructed with the *promise* (not an already
 * resolved blob) and `navigator.clipboard.write()` is invoked immediately.
 * This keeps the write call inside the originating user gesture so the
 * browser does not reject it with "Document is not focused" - the blob is
 * allowed to resolve asynchronously after the write has been initiated.
 */
async function copyPngToClipboard(blobPromise: Promise<Blob>): Promise<void> {
  const clipboardItem = new ClipboardItem({
    'image/png': blobPromise
  });
  await navigator.clipboard.write([clipboardItem]);
}

/**
 * Generate simple hash from string (for deterministic filenames)
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
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
function downloadPng(blob: Blob, filename: string = 'svg-graphic.png'): void {
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
 * Containers JupyterLab builds to hold a single graphic. A click inside one of
 * these that misses the graphic itself still resolves to it. `.jp-RenderedMarkdown`
 * is deliberately not here - it holds a whole document. Nor is `figure`: HTML
 * groups tables, listings and quotations in one too, so its contract is unknown.
 */
const SINGLE_GRAPHIC_HOLDERS =
  '.jp-RenderedSVG, .jp-RenderedMermaid, .jp-ImageViewer';

/**
 * Initialization data for the jupyterlab_export_svg_as_png_extension extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab_export_svg_as_png_extension:plugin',
  description:
    'Jupyterlab extension to allow copying and exporting any given SVG graphics as PNG',
  autoStart: true,
  optional: [ISettingRegistry],
  activate: async (
    app: JupyterFrontEnd,
    settingRegistry: ISettingRegistry | null
  ) => {
    // Settings
    let targetWidth = 1920;
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
        const applySettings = () => {
          targetWidth = settings.get('targetWidth').composite as number;
          const bgType = settings.get('backgroundColor').composite as string;
          const customBgColor = settings.get('customBackgroundColor')
            .composite as string;
          backgroundColor = resolveBackgroundColor(bgType, customBgColor);
          exportThemeMode = settings.get('exportThemeMode').composite as string;
        };
        applySettings();
        settings.changed.connect(applySettings);
      } catch (error) {
        console.error('[SVG Extension] Failed to load settings:', error);
      }
    }

    const { commands, contextMenu } = app;

    // The document widget an element belongs to. This is what separates a
    // graphic that re-rendered in place from one whose document has been
    // closed: the first keeps its widget id, the second is replaced by
    // whatever the shell now puts in that screen position.
    const widgetIdOf = (element: Element): string =>
      element.closest('.jp-MainAreaWidget')?.id ?? '';

    // Track the last right-click - the element, the point, and the document it
    // belonged to. The point is what keeps the gesture alive when the graphic
    // re-renders while the menu is open: Lumino evaluates isVisible once, when
    // the menu opens, but the command re-resolves when the item is clicked.
    let lastContextMenuTarget: EventTarget | null = null;
    let lastContextMenuPoint: { x: number; y: number } | null = null;
    let lastContextMenuWidgetId = '';
    let lastResolvedKey: string | null = null;
    document.addEventListener('contextmenu', (e: MouseEvent) => {
      lastContextMenuTarget = e.target;
      lastContextMenuPoint = { x: e.clientX, y: e.clientY };
      lastContextMenuWidgetId =
        e.target instanceof Element ? widgetIdOf(e.target) : '';
      lastResolvedKey = null;
    });

    // The identity key is only wanted between the menu opening and the click.
    // Since `keyOf` began carrying a whole document's text, holding it past the
    // gesture keeps a large SVG file reachable until the user happens to
    // right-click again - the retention shape DEF-4 was filed for. Both
    // commands drop it when they finish.
    const endGesture = (): void => {
      lastResolvedKey = null;
    };

    // Helper: find the tab label for a widget element. JupyterLab tabs
    // are linked to their content widgets via `data-id` matching the
    // MainAreaWidget's `id` attribute. This is more reliable than
    // app.shell.currentWidget which depends on focus state.
    const findTabLabel = (element: Element): string => {
      const mainArea = element.closest('.jp-MainAreaWidget');
      if (!mainArea || !mainArea.id) {
        return '';
      }
      const tab = document.querySelector(
        `.lm-TabBar-tab[data-id="${mainArea.id}"] .lm-TabBar-tabLabel`
      );
      return tab?.textContent || '';
    };

    // The text of the document an element belongs to, or null when there is
    // none to read. JupyterLab 4.6 changed the image viewer to revoke its blob
    // URL in the image's own `load` handler, so by the time a graphic can be
    // right-clicked its URL is already out of the blob registry and `fetch`
    // rejects with `TypeError: Failed to fetch` (DEF-19). The document model
    // holds the same bytes, is what the viewer itself renders from, and
    // outlives the URL.
    //
    // This returns whatever the owning document's model stringifies to, which
    // is the file's markup only because of who calls it: `isImgSvg` below
    // admits a `blob:` source only inside a `.jp-ImageViewer` whose tab label
    // ends in `.svg`, so the widget found here is always an image viewer over
    // an SVG file. That gate is load-bearing - relaxing it would let a
    // notebook's `.ipynb` JSON through as if it were SVG markup.
    const documentSourceOf = (element: Element): string | null => {
      const id = widgetIdOf(element);
      if (!id) {
        return null;
      }
      for (const widget of app.shell.widgets('main')) {
        if (widget.id === id) {
          const text = (widget as any)?.context?.model?.toString?.();
          return typeof text === 'string' && text.length > 0 ? text : null;
        }
      }
      return null;
    };

    // Helper: check if an IMG element references an SVG
    const isImgSvg = (img: HTMLImageElement): boolean => {
      // An image that failed to load, or has not loaded yet, cannot be
      // exported. Without this a broken src is offered in the menu and then
      // fails at click time with nothing to show for it.
      if (!img.complete || img.naturalWidth === 0) {
        return false;
      }
      const src = img.src || '';
      // Data URI SVGs
      if (src.startsWith('data:image/svg+xml')) {
        return true;
      }
      // Blob URLs (used by JupyterLab's ImageViewer) - check if the IMG
      // is inside an ImageViewer whose tab label ends in .svg
      if (src.startsWith('blob:')) {
        const viewer = img.closest('.jp-ImageViewer');
        if (!viewer) {
          return false;
        }
        const label = findTabLabel(img);
        return /\.svg$/i.test(label);
      }
      // HTTP URL SVGs (e.g. /files/path/to/image.svg?token=...)
      try {
        const url = new URL(src);
        return /\.svg$/i.test(url.pathname);
      } catch {
        return /\.svg/i.test(src);
      }
    };

    // The outermost <svg> containing an element. `closest('svg')` returns the
    // innermost, but a nested viewport is part of one graphic, not a graphic of
    // its own - the same premise the holder count uses (DEF-9). Without this the
    // two branches disagree on the same DOM.
    const outermostSvg = (element: Element): SVGElement | null => {
      let svg = element.closest('svg');
      for (;;) {
        const outer = svg?.parentElement?.closest('svg');
        if (!outer) {
          break;
        }
        svg = outer;
      }
      return (svg as SVGElement | null) ?? null;
    };

    type SvgTarget =
      | { type: 'img'; element: HTMLImageElement; source?: string }
      | { type: 'svg'; element: SVGElement };

    // An SVG image as an export target, or null when its markup cannot be
    // read. An image whose markup cannot be read is not offered at all,
    // because offering it means a menu item that fails at click time.
    //
    // The discriminator is the URL scheme, and it must stay that way. A
    // `blob:` source arises only from `ImageViewer._render`'s non-base64
    // branch, which builds the Blob from the very string `documentSourceOf`
    // reads back - that is what makes the model the right source for it.
    // JupyterLab registers a second, base64 factory for `.svg` (Open With ->
    // Image), and that one sets a `data:` src over a base64 model: widening
    // this test to the container would hand that base64 to the SVG parser.
    // Every non-blob form is read back from its own URL at export time.
    const imgTarget = (element: HTMLImageElement): SvgTarget | null => {
      if (!(element.src || '').startsWith('blob:')) {
        return { type: 'img', element };
      }
      const source = documentSourceOf(element);
      return source ? { type: 'img', element, source } : null;
    };

    // Helper: resolve the graphic for one element.
    // An element that is a graphic resolves to that graphic and stops there.
    // Anything else resolves only through its ancestors, and then only inside a
    // container JupyterLab builds to hold one graphic - see
    // SINGLE_GRAPHIC_HOLDERS. Everything else resolves to nothing.
    const resolveFrom = (target: Element): SvgTarget | null => {
      // The click landed on an image. That image is the answer; failing that,
      // only an <svg> it sits inside - a raster in a <foreignObject> is part of
      // that graphic. It must never fall through to the holder search below,
      // which would offer the image's neighbour instead: a right-click on a PNG
      // returning the SVG beside it in the same <figure>.
      if (target.tagName === 'IMG') {
        const imgElement = target as HTMLImageElement;
        if (isImgSvg(imgElement)) {
          return imgTarget(imgElement);
        }
        const owner = outermostSvg(imgElement);
        return owner ? { type: 'svg', element: owner } : null;
      }

      // Check target and ancestors for inline SVG
      const svgElement = outermostSvg(target);
      if (svgElement) {
        return { type: 'svg', element: svgElement };
      }

      // A click that misses the graphic but lands in a container built to hold
      // exactly one - the image viewer panel, a notebook output box, a mermaid
      // wrapper - still resolves to that graphic. `.jp-RenderedMarkdown` is
      // deliberately absent: it holds a whole document, so searching it would
      // export an unrelated graphic from elsewhere on the page.
      const holder = target.closest(SINGLE_GRAPHIC_HOLDERS);
      if (holder) {
        // Nested <svg> is a legal viewport, not a second graphic, so count only
        // the outermost ones. Inline SVG and SVG images are counted together:
        // a caption icon beside the real figure must read as two, not win as
        // the sole <svg> and be exported in the figure's place.
        const svgs = Array.from(holder.querySelectorAll('svg')).filter(
          el => !el.parentElement?.closest('svg')
        );
        const imgs = Array.from(holder.querySelectorAll('img')).filter(
          isImgSvg
        );
        if (svgs.length + imgs.length === 1) {
          return svgs.length === 1
            ? { type: 'svg', element: svgs[0] as SVGElement }
            : imgTarget(imgs[0]);
        }
      }

      return null;
    };

    // Identity of a resolved graphic, so the fallback below can tell the same
    // graphic from merely another one in the same place.
    // The document text, where there is one, rather than the URL: the image
    // viewer mints a fresh `blob:` URL on every render, so a URL key would call
    // the same unchanged graphic a different one after any re-render.
    const keyOf = (found: SvgTarget): string =>
      found.type === 'img'
        ? `img:${found.source ?? found.element.src}`
        : `svg:${found.element.outerHTML}`;

    // Helper: find the SVG graphic under the right-click point.
    const findSvgTarget = (): SvgTarget | null => {
      if (
        lastContextMenuTarget instanceof Element &&
        lastContextMenuTarget.isConnected
      ) {
        const found = resolveFrom(lastContextMenuTarget);
        lastResolvedKey = found ? keyOf(found) : null;
        return found;
      }

      // The recorded node has left the DOM. Either the graphic re-rendered
      // under the open menu, in which case its replacement is at the same
      // point, or its document is gone and the point now shows something else.
      if (!lastContextMenuPoint || !lastResolvedKey) {
        return null;
      }
      // `elementsFromPoint`, not `elementFromPoint`: the context menu opens at
      // the pointer, so the topmost element at the recorded point may be the
      // menu itself. Take the first thing underneath it.
      const atPoint = document
        .elementsFromPoint(lastContextMenuPoint.x, lastContextMenuPoint.y)
        .find(el => !el.closest('.lm-Menu'));
      if (!atPoint || widgetIdOf(atPoint) !== lastContextMenuWidgetId) {
        return null;
      }
      // Same document is not enough. A re-render that also changes layout puts
      // a *different* graphic under the recorded point, and exporting that
      // would be the silent wrong export this whole fallback must not cause.
      // Only the same graphic, by identity, counts.
      const found = resolveFrom(atPoint);
      return found && keyOf(found) === lastResolvedKey ? found : null;
    };

    // Our items are hidden (not just disabled) when there is nothing to
    // export at the click point
    const shouldShow = (): boolean => findSvgTarget() !== null;

    // The user asked for a PNG and did not get one. A console line is not an
    // answer - a source the exporter cannot read (a cross-origin badge, a 404)
    // would otherwise look like a menu item that does nothing.
    const fail = (message: string, error?: unknown): void => {
      console.error(`[SVG Extension] ${message}`, error ?? '');
      Notification.error(message, { autoClose: 4000 });
    };

    // --- Copy as PNG command ---
    const copySvgCommand = 'svg:copy-as-png';
    commands.addCommand(copySvgCommand, {
      label: 'Copy as PNG',
      caption: 'Copy SVG graphic as PNG image to clipboard',
      isVisible: shouldShow,
      isEnabled: () => findSvgTarget() !== null,
      execute: async () => {
        try {
          const found = findSvgTarget();
          if (!found) {
            // the graphic went away between the menu opening and this click
            fail('The graphic is no longer available');
            return;
          }

          // Start the conversion but do NOT await it here - hand the promise
          // straight to the clipboard so the write is initiated synchronously
          // within the user gesture (avoids "Document is not focused").
          const blobPromise =
            found.type === 'img'
              ? imgToPng(
                  found.element,
                  targetWidth,
                  backgroundColor,
                  exportThemeMode,
                  found.source
                )
              : svgToPng(
                  found.element,
                  targetWidth,
                  backgroundColor,
                  exportThemeMode
                );
          await copyPngToClipboard(blobPromise);
        } catch (error) {
          fail('Could not copy this graphic as PNG', error);
        } finally {
          endGesture();
        }
      }
    });

    // Register context menu for SVG-containing areas.
    // Note: .jp-RenderedMarkdown always has .jp-RenderedHTMLCommon too, so
    // registering on only one selector avoids duplicate entries on the same
    // element. .jp-ImageViewer covers SVG files opened directly (isImgSvg
    // filters by document extension to avoid showing on PNG/JPEG files).
    contextMenu.addItem({
      command: copySvgCommand,
      selector: '.jp-RenderedSVG',
      rank: 10
    });
    contextMenu.addItem({
      command: copySvgCommand,
      selector: '.jp-RenderedHTMLCommon',
      rank: 10
    });
    contextMenu.addItem({
      command: copySvgCommand,
      selector: '.jp-ImageViewer',
      rank: 10
    });

    // --- Save as PNG command ---
    const downloadSvgCommand = 'svg:download-as-png';
    commands.addCommand(downloadSvgCommand, {
      label: 'Save as PNG',
      caption: 'Save SVG graphic as PNG file',
      isVisible: shouldShow,
      isEnabled: () => findSvgTarget() !== null,
      execute: async () => {
        try {
          const found = findSvgTarget();
          if (!found) {
            // the graphic went away between the menu opening and this click
            fail('The graphic is no longer available');
            return;
          }

          let pngBlob: Blob;
          // Hash source used only to derive a deterministic filename. Prefer
          // the document text where there is one - a `blob:` URL is a fresh
          // random id on every render, so hashing it names the same file
          // differently each time. Otherwise the raw src (never throws, unlike
          // decodeURIComponent on a malformed escape), and the serialized
          // markup for inline SVG.
          let hashSource: string;

          if (found.type === 'img') {
            hashSource = found.source ?? found.element.src;
            pngBlob = await imgToPng(
              found.element,
              targetWidth,
              backgroundColor,
              exportThemeMode,
              found.source
            );
          } else {
            hashSource = new XMLSerializer().serializeToString(found.element);
            pngBlob = await svgToPng(
              found.element,
              targetWidth,
              backgroundColor,
              exportThemeMode
            );
          }

          const filename = generateFilename(app, hashSource);
          downloadPng(pngBlob, filename);
        } catch (error) {
          fail('Could not save this graphic as PNG', error);
        } finally {
          endGesture();
        }
      }
    });

    contextMenu.addItem({
      command: downloadSvgCommand,
      selector: '.jp-RenderedSVG',
      rank: 11
    });
    contextMenu.addItem({
      command: downloadSvgCommand,
      selector: '.jp-RenderedHTMLCommon',
      rank: 11
    });
    contextMenu.addItem({
      command: downloadSvgCommand,
      selector: '.jp-ImageViewer',
      rank: 11
    });

    console.log(
      'JupyterLab extension jupyterlab_export_svg_as_png_extension is activated!'
    );
  }
};

export default plugin;
