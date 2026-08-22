import type { IJupyterLabPageFixture } from '@jupyterlab/galata';
import { expect, test } from './galata';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Context menu targeting and export.
 *
 * The export items must be offered for the graphic under the pointer and for
 * nothing else. Resolution walks the clicked element and its ancestors only, so
 * a click on a container must not adopt a graphic located elsewhere in the same
 * document (DEF-1).
 */

const FIXTURES = path.resolve(__dirname, 'fixtures');
const PLUGIN = 'jupyterlab_export_svg_as_png_extension:plugin';

// Select menu items by command id, not by label. A label locator that matches
// nothing cannot tell "correctly hidden" from "extension never loaded", and
// another extension is free to contribute an item with the same label.
const COPY = '.lm-Menu-item[data-command="svg:copy-as-png"]';
const SAVE = '.lm-Menu-item[data-command="svg:download-as-png"]';

// Rendered markdown resolves relative image paths to /files/... with an _xsrf
// query appended, so match on a substring rather than the end of the URL.
// Scope to the main area: a branding extension can put a data-URI SVG logo in
// the top bar, and a side panel can hold a second rendered markdown document.
const DOC = '.jp-MainAreaWidget .jp-RenderedMarkdown';
const CHART = `${DOC} img[src*="chart.svg"]`;
const RASTER = `${DOC} img[src*="raster.png"]`;
const MERMAID = `${DOC} .jp-RenderedMermaid img`;

/** chart.svg is 400x260, so an export 1920 wide is exactly 1248 tall. */
const CHART_PNG = { width: 1920, height: 1248 };

/** PNG dimensions from the IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
  const buf = fs.readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * One pixel of a saved PNG as [r, g, b, a]. Decoded in the browser - Node has
 * no PNG decoder here, and the page already has one.
 */
async function pngPixel(
  page: IJupyterLabPageFixture,
  file: string,
  x: number,
  y: number
): Promise<number[]> {
  const base64 = fs.readFileSync(file).toString('base64');
  return page.evaluate(
    async ([data, px, py]) => {
      const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      return Array.from(ctx.getImageData(Number(px), Number(py), 1, 1).data);
    },
    [base64, String(x), String(y)]
  );
}

/**
 * chart.svg paints a full-bleed `.bg` rect - #ffffff normally, #1e1e1e inside
 * its `@media (prefers-color-scheme: dark)` block. A corner pixel of the export
 * is that rect, so it reports which palette the theme resolver chose.
 */
const LIGHT_BG = [255, 255, 255, 255];
const DARK_BG = [30, 30, 30, 255];

/** Both items present in the menu and offered to the user. */
async function expectOffered(page: IJupyterLabPageFixture): Promise<void> {
  await expect(page.locator(COPY)).toHaveCount(1);
  await expect(page.locator(SAVE)).toHaveCount(1);
  await expect(page.locator(COPY)).toBeVisible();
  await expect(page.locator(SAVE)).toBeVisible();
  // the reported symptom of DEF-1 was items that "appear enabled"; a disabled
  // item is still visible, so without this the enabled state is unasserted
  await expect(page.locator(COPY)).not.toHaveClass(/lm-mod-disabled/);
  await expect(page.locator(SAVE)).not.toHaveClass(/lm-mod-disabled/);
}

/**
 * The tag under a point. Tests that right-click container chrome assert on this
 * first: if the point drifts onto the graphic itself the test still passes, but
 * it has stopped testing the container fallback it was written for.
 */
async function tagAt(
  page: IJupyterLabPageFixture,
  point: { x: number; y: number }
): Promise<string> {
  return page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.tagName ?? '',
    [point.x, point.y]
  );
}

/**
 * Both items present in the menu but hidden. Asserting the class rather than
 * invisibility is the positive control: an absent element would satisfy
 * `toBeHidden()` even if the extension had failed to load entirely.
 */
async function expectHidden(page: IJupyterLabPageFixture): Promise<void> {
  await expect(page.locator(COPY)).toHaveClass(/lm-mod-hidden/);
  await expect(page.locator(SAVE)).toHaveClass(/lm-mod-hidden/);
}

async function upload(
  page: IJupyterLabPageFixture,
  tmpPath: string,
  name: string
): Promise<void> {
  await page.contents.uploadFile(
    path.resolve(FIXTURES, name),
    `${tmpPath}/${name}`
  );
}

async function openMarkdownFixture(
  page: IJupyterLabPageFixture,
  tmpPath: string
): Promise<void> {
  // the graphics are referenced by the markdown, so they must land beside it
  await upload(page, tmpPath, 'chart.svg');
  await upload(page, tmpPath, 'raster.png');
  await upload(page, tmpPath, 'graphics.md');
  await page.filebrowser.open(`${tmpPath}/graphics.md`, 'Markdown Preview');
  // the raster image is the last graphic in the document
  await page.locator(RASTER).waitFor();
}

/**
 * Points inside the rendered markdown that carry no graphic. Recomputed
 * immediately before each use: a preceding click can scroll the document and
 * invalidate coordinates taken earlier.
 */
async function emptyPoint(
  page: IJupyterLabPageFixture,
  which: 'paragraph' | 'gutter' | 'gap'
): Promise<{ x: number; y: number }> {
  const doc = page.locator(DOC);
  const box = await doc.boundingBox();
  const heading = await doc.locator('h1').first().boundingBox();
  const para = await doc.locator('p').first().boundingBox();
  if (which === 'paragraph') {
    return { x: para.x + para.width / 2, y: para.y + para.height / 2 };
  }
  if (which === 'gutter') {
    return { x: box.x + 3, y: para.y + para.height / 2 };
  }
  const gap = para.y - (heading.y + heading.height);
  expect(gap).toBeGreaterThan(6);
  return { x: box.x + box.width / 2, y: heading.y + heading.height + gap / 2 };
}

async function rightClickAt(
  page: IJupyterLabPageFixture,
  point: { x: number; y: number }
): Promise<void> {
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page.locator('.lm-Menu').first().waitFor();
}

test.describe('rendered markdown', () => {
  test.beforeEach(async ({ page, tmpPath }) => {
    await openMarkdownFixture(page, tmpPath);
  });

  test('offers both items on an SVG image', async ({ page }) => {
    await page.locator(CHART).click({ button: 'right' });

    await expectOffered(page);
  });

  test('offers exactly one pair on a mermaid diagram', async ({ page }) => {
    await page.locator(MERMAID).first().click({ button: 'right' });

    await expectOffered(page);
  });

  test('exports the mermaid diagram, whose source is a data URI', async ({
    page
  }) => {
    // the only decoder for a `data:` source, and the one the v1.1.6 UTF-8 fix
    // lives in - the node label carries a multibyte character on purpose.
    // Dimensions are core-owned, so assert the width we set and a real height,
    // not a constant that a mermaid version bump would break.
    await page.locator(MERMAID).first().click({ button: 'right' });

    const download = page.waitForEvent('download', { timeout: 15000 });
    await page.locator(SAVE).click();
    const saved = await download;

    const size = pngSize(await saved.path());
    expect(size.width).toBe(1920);
    expect(size.height).toBeGreaterThan(0);
  });

  test('offers both items beside the diagram in its wrapper', async ({
    page
  }) => {
    // .jp-RenderedMermaid holds exactly one graphic, so a click that misses
    // the image still resolves to it. Which side carries the slack depends on
    // how wide mermaid renders the diagram, so take whichever side is roomier
    // rather than assuming the right - the tagAt assertion is what proves the
    // click actually missed the image.
    const wrapper = page.locator(`${DOC} .jp-RenderedMermaid`);
    const box = await wrapper.boundingBox();
    const image = await wrapper.locator('img').boundingBox();
    const left = image.x - box.x;
    const right = box.x + box.width - (image.x + image.width);
    const onRight = right >= left;
    const slack = onRight ? right : left;
    expect(slack).toBeGreaterThan(8);
    const point = {
      x: onRight ? image.x + image.width + slack / 2 : box.x + slack / 2,
      y: box.y + box.height / 2
    };
    expect(await tagAt(page, point)).not.toBe('IMG');
    await rightClickAt(page, point);

    await expectOffered(page);
  });

  test('hides both items on a raster image', async ({ page }) => {
    await page.locator(RASTER).click({ button: 'right' });

    await expectHidden(page);
  });

  test('hides both items where the document carries no graphic', async ({
    page
  }) => {
    // gutter and gap are the DEF-1 regression: the click lands on
    // div.jp-RenderedMarkdown itself, which holds graphics as descendants
    for (const which of ['paragraph', 'gutter', 'gap'] as const) {
      await test.step(which, async () => {
        await rightClickAt(page, await emptyPoint(page, which));
        await expectHidden(page);
        await page.keyboard.press('Escape');
      });
    }
  });

  test('exports the clicked graphic, not another in the document', async ({
    page
  }) => {
    await page.locator(CHART).click({ button: 'right' });

    const download = page.waitForEvent('download', { timeout: 15000 });
    await page.locator(SAVE).click();
    const saved = await download;

    // svg-<widget-title>-<hash>.png: the preview widget's title is
    // graphics.md, whose extension generateFilename strips, and the hash is
    // base36 padded to 8
    expect(saved.suggestedFilename()).toMatch(
      /^svg-graphics-[0-9a-z]{8}\.png$/
    );
    // height is what identifies the source graphic - every export in this
    // document is 1920 wide, but only chart.svg is 1248 tall
    expect(pngSize(await saved.path())).toEqual(CHART_PNG);
    // the light control for the dark-theme case below
    expect(await pngPixel(page, await saved.path(), 2, 2)).toEqual(LIGHT_BG);
  });

  test('still exports after the graphic re-renders under the open menu', async ({
    page
  }) => {
    await page.locator(CHART).click({ button: 'right' });
    await expectOffered(page);

    // Lumino evaluates isVisible once, when the menu opens; the command
    // re-resolves when the item is clicked. Replace the container's children
    // with equivalent nodes in between - exactly what RenderedMermaid does on
    // re-render - so the recorded node detaches while its replacement occupies
    // the same point.
    await page.evaluate(() => {
      const img = document.querySelector(
        '.jp-MainAreaWidget .jp-RenderedMarkdown img[src*="chart.svg"]'
      );
      const holder = img?.parentElement;
      if (holder) {
        holder.innerHTML = holder.innerHTML;
      }
    });
    await page.waitForFunction(() => {
      const img = document.querySelector(
        '.jp-MainAreaWidget .jp-RenderedMarkdown img[src*="chart.svg"]'
      ) as HTMLImageElement | null;
      return !!img && img.complete && img.naturalWidth > 0;
    });

    const download = page.waitForEvent('download', { timeout: 15000 });
    await page.locator(SAVE).click();
    const saved = await download;

    expect(pngSize(await saved.path())).toEqual(CHART_PNG);
  });

  test('refuses to export a different graphic that took the same place', async ({
    page,
    tmpPath
  }) => {
    await upload(page, tmpPath, 'square.svg');
    await page.locator(CHART).click({ button: 'right' });
    await expectOffered(page);

    // a re-render that also changes layout can leave a *different* graphic
    // under the recorded point. Same document is not the same graphic, and
    // exporting this one would be a silent wrong export.
    await page.evaluate(() => {
      const img = document.querySelector(
        '.jp-MainAreaWidget .jp-RenderedMarkdown img[src*="chart.svg"]'
      ) as HTMLImageElement | null;
      const holder = img?.parentElement;
      if (holder && img) {
        holder.innerHTML = `<img src="${img.src.replace('chart.svg', 'square.svg')}">`;
      }
    });
    await page.waitForFunction(() => {
      const img = document.querySelector(
        '.jp-MainAreaWidget .jp-RenderedMarkdown img[src*="square.svg"]'
      ) as HTMLImageElement | null;
      return !!img && img.complete && img.naturalWidth > 0;
    });

    const download = page
      .waitForEvent('download', { timeout: 5000 })
      .catch(() => null);
    await page.locator(SAVE).click();

    expect(await download).toBeNull();
  });

  test('copies the clicked graphic to the clipboard', async ({ page }) => {
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator(CHART).click({ button: 'right' });

    await page.locator(COPY).click();

    // read the IHDR off the clipboard, same instrument as the download test:
    // a byte count is satisfied by any PNG, including the wrong graphic or one
    // rendered at the wrong width
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const items = await navigator.clipboard.read();
            if (!items.length || !items[0].types.includes('image/png')) {
              return null;
            }
            const blob = await items[0].getType('image/png');
            const head = new DataView(await blob.slice(0, 24).arrayBuffer());
            return { width: head.getUint32(16), height: head.getUint32(20) };
          }),
        { timeout: 15000 }
      )
      .toEqual(CHART_PNG);
  });
});

test.describe('figure holding two images', () => {
  // `figure` is not in SINGLE_GRAPHIC_HOLDERS: HTML groups tables, listings and
  // quotations in one too. The caption case below is what pins that decision on
  // its own. The raster case needs both that and the early return on a non-SVG
  // image to be undone before it fails, so it does not pin either alone - it is
  // the end-to-end record of the reported symptom.
  test.beforeEach(async ({ page, tmpPath }) => {
    await upload(page, tmpPath, 'chart.svg');
    await upload(page, tmpPath, 'raster.png');
    await upload(page, tmpPath, 'figure.md');
    await page.filebrowser.open(`${tmpPath}/figure.md`, 'Markdown Preview');
    await page.locator(`${DOC} figure img[src*="raster.png"]`).waitFor();
  });

  test('hides both items on the raster image beside an SVG', async ({
    page
  }) => {
    await page
      .locator(`${DOC} figure img[src*="raster.png"]`)
      .click({ button: 'right' });

    await expectHidden(page);
  });

  test('hides both items on the caption', async ({ page }) => {
    await page.locator(`${DOC} figcaption`).click({ button: 'right' });

    await expectHidden(page);
  });

  test('hides both items on body text of a one-graphic document', async ({
    page
  }) => {
    // figure.md holds exactly one SVG graphic, so unlike graphics.md the
    // exactly-one gate cannot mask a widened holder list. This is what pins
    // `.jp-RenderedMarkdown` staying out of SINGLE_GRAPHIC_HOLDERS.
    const para = page.locator(`${DOC} p`).first();
    const box = await para.boundingBox();
    await rightClickAt(page, {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2
    });

    await expectHidden(page);
  });

  test('still offers both items on the SVG image itself', async ({ page }) => {
    await page
      .locator(`${DOC} figure img[src*="chart.svg"]`)
      .click({ button: 'right' });

    await expectOffered(page);
  });
});

test.describe('image sources', () => {
  test.beforeEach(async ({ page, tmpPath }) => {
    await upload(page, tmpPath, 'upper.SVG');
    await upload(page, tmpPath, 'unreadable.svg');
    await upload(page, tmpPath, 'sources.md');
    await page.filebrowser.open(`${tmpPath}/sources.md`, 'Markdown Preview');
    await page.locator(`${DOC} img[src*="upper.SVG"]`).waitFor();
  });

  test('hides both items on a source that failed to load', async ({ page }) => {
    // offering a broken source means a menu item that fails at click time -
    // the item is only worth showing for something the exporter can read.
    // unreadable.svg is served but is not parseable as SVG, so it loads with
    // naturalWidth 0 - a real path, so the repo's link check stays green
    await page
      .locator(`${DOC} img[src*="unreadable.svg"]`)
      .click({ button: 'right' });

    await expectHidden(page);
  });

  test('recognises an uppercase .SVG extension', async ({ page }) => {
    await page
      .locator(`${DOC} img[src*="upper.SVG"]`)
      .click({ button: 'right' });

    await expectOffered(page);
  });
});

test.describe('settings', () => {
  test.use({ mockSettings: { [PLUGIN]: { targetWidth: 640 } } });

  test('exports at the configured target width', async ({ page, tmpPath }) => {
    await openMarkdownFixture(page, tmpPath);
    await page.locator(CHART).click({ button: 'right' });

    const download = page.waitForEvent('download', { timeout: 15000 });
    await page.locator(SAVE).click();
    const saved = await download;

    expect(pngSize(await saved.path())).toEqual({ width: 640, height: 416 });
  });

  test('copies at the configured target width', async ({ page, tmpPath }) => {
    // the copy branch reads the settings separately from the save branch;
    // without this, hard-coding the width there ships green
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);
    await openMarkdownFixture(page, tmpPath);
    await page.locator(CHART).click({ button: 'right' });

    await page.locator(COPY).click();

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const items = await navigator.clipboard.read();
            if (!items.length || !items[0].types.includes('image/png')) {
              return null;
            }
            const blob = await items[0].getType('image/png');
            const head = new DataView(await blob.slice(0, 24).arrayBuffer());
            return { width: head.getUint32(16), height: head.getUint32(20) };
          }),
        { timeout: 15000 }
      )
      .toEqual({ width: 640, height: 416 });
  });
});

test.describe('export theme', () => {
  test.use({ mockSettings: { [PLUGIN]: { exportThemeMode: 'dark' } } });

  test('resolves the dark palette into the export', async ({
    page,
    tmpPath
  }) => {
    // the resolver rewrites @media (prefers-color-scheme) against JupyterLab's
    // theme rather than the OS setting, so the PNG matches what is on screen
    await openMarkdownFixture(page, tmpPath);
    await page.locator(CHART).click({ button: 'right' });

    const download = page.waitForEvent('download', { timeout: 15000 });
    await page.locator(SAVE).click();
    const saved = await download;

    expect(await pngPixel(page, await saved.path(), 2, 2)).toEqual(DARK_BG);
  });
});

test.describe('image viewer', () => {
  test('offers both items on an SVG file', async ({ page, tmpPath }) => {
    // open a second file first: the tab-label lookup must resolve the viewer
    // the click landed in, not whichever tab the shell thinks is current
    await upload(page, tmpPath, 'raster.png');
    await upload(page, tmpPath, 'chart.svg');
    await page.filebrowser.open(`${tmpPath}/raster.png`);
    await page.filebrowser.open(`${tmpPath}/chart.svg`);

    await page
      .locator('.jp-MainAreaWidget:visible .jp-ImageViewer img')
      .click({ button: 'right' });

    await expectOffered(page);
  });

  test('offers both items in the empty panel area', async ({
    page,
    tmpPath
  }) => {
    // the viewer panel is mostly empty space around the image; it holds
    // exactly one graphic, so a click anywhere in it resolves to that graphic
    await upload(page, tmpPath, 'chart.svg');
    await page.filebrowser.open(`${tmpPath}/chart.svg`);
    const viewer = page.locator('.jp-MainAreaWidget:visible .jp-ImageViewer');
    const box = await viewer.boundingBox();
    const point = { x: box.x + box.width - 8, y: box.y + box.height - 8 };
    expect(await tagAt(page, point)).not.toBe('IMG');
    await rightClickAt(page, point);

    await expectOffered(page);
  });

  test('hides both items on a raster file', async ({ page, tmpPath }) => {
    await upload(page, tmpPath, 'raster.png');
    await page.filebrowser.open(`${tmpPath}/raster.png`);
    await page.locator('.jp-ImageViewer img').click({ button: 'right' });

    await expectHidden(page);
  });
});
