import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appCssPath = path.join(repoRoot, 'styles/app.css');

test('warn button and chip foreground tracks --warn-strong in light and dark themes', async ({ page }) => {
  const css = await readFile(appCssPath, 'utf8');
  await page.setContent(`
    <!doctype html>
    <html data-theme="light">
      <head><style>${css}</style></head>
      <body>
        <button type="button" class="btn warn">Warn action</button>
        <span class="chip warn">Warn status</span>
      </body>
    </html>
  `);

  const warnButton = page.locator('.btn.warn');
  const warnChip = page.locator('.chip.warn');

  await expect(warnButton).toHaveCSS('color', 'rgb(158, 106, 25)');
  await expect(warnChip).toHaveCSS('color', 'rgb(158, 106, 25)');

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

  await expect(warnButton).toHaveCSS('color', 'rgb(241, 192, 129)');
  await expect(warnChip).toHaveCSS('color', 'rgb(241, 192, 129)');
});
