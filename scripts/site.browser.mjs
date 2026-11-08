import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
import { validateEntry } from './catalog.mjs';
import { EXAMPLE_LISTING } from '../site/marketplace.js';

const root = resolve('dist');
const headers = await readFile(resolve(root, '_headers'), 'utf8');
const csp = headers.split('\n').find(line => line.includes('Content-Security-Policy:')).trim().slice('Content-Security-Policy:'.length).trim();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!path.startsWith(`${root}/`)) { response.writeHead(403).end(); return; }
  try { const bytes = await readFile(path); response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Content-Security-Policy': csp }); response.end(bytes); }
  catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try { browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless: true }); }
catch (error) { await new Promise(done => server.close(done)); throw error; }
const screenshotDir = process.env.SCREENSHOT_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const screenshot = async (page, name) => { if (screenshotDir) await page.screenshot({ path: resolve(screenshotDir, `${name}.png`), fullPage: true }); };
let checks = 0;
async function check(name, run) { await run(); checks++; console.log(`✓ ${name}`); }
const fixture = [
  validateEntry({ ...EXAMPLE_LISTING, displayName: '天气工具 · 测试样本', description: '仅用于浏览器回归测试的目录资料，不是已收录插件。', author: '测试作者', categories: ['工作台面板'], keywords: ['forecast'] }),
  validateEntry({ ...EXAMPLE_LISTING, id: 'dev.example.notes', displayName: '笔记工具 · 测试样本', author: 'Notes author', categories: ['工具服务'], keywords: ['memo'], source: { kind: 'npm', specifier: '@author/notes@^1.0.0', display: '@author/notes' } }),
  validateEntry({ ...EXAMPLE_LISTING, id: 'dev.example.escape', displayName: '<img src=x onerror=alert(1)>', author: '安全回归样本', categories: ['语言调试'], keywords: [], description: '<script>throw new Error("unsafe")</script>', source: { kind: 'github-release', specifier: 'owner/repo#stable?tagPrefix=tool-v&manifest=tool.release.json', display: 'owner/repo' } }),
];
const catalog = { schemaVersion: 1, entries: fixture };
const pageErrors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', reducedMotion: 'reduce' });
context.on('page', page => page.on('pageerror', error => pageErrors.push(error.message)));
let state = 'empty';
await context.route('**/catalog/v1.json', route => {
  if (state === 'error') return route.fulfill({ status: 503, body: 'unavailable' });
  return route.fulfill({ json: state === 'empty' ? { schemaVersion: 1, entries: [] } : state === 'malformed' ? { schemaVersion: 1, entries: [null] } : catalog });
});
await context.route('**/assets/dev.example.weather.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#71825e"/></svg>' }));
try {
  const page = await context.newPage();
  await page.goto(base);
  await check('real empty state and zero counts, no fake entries', async () => {
    await page.locator('#empty-catalog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.entry').count(), 0); assert.equal(await page.locator('[data-count="all"]').textContent(), '0');
    assert.equal(await page.locator('#no-results').isVisible(), false);
    await screenshot(page, 'desktop-empty');
  });
  await check('local JSON precheck supports valid, invalid, edited states and no upload', async () => {
    const posts = []; page.on('request', request => { if (request.method() !== 'GET') posts.push(request.url()); });
    await page.locator('#load-example').click(); await page.locator('#draft-result.valid').waitFor();
    await page.locator('#listing-input').fill('invalid'); assert.match(await page.locator('#draft-result').textContent(), /资料已修改/);
    await page.locator('#validate-draft').click(); await page.locator('#draft-result.invalid').waitFor();
    assert.equal(posts.length, 0);
  });
  state = 'entries'; await page.goto(base);
  await check('fixture cards render, hostile text stays text', async () => {
    await page.waitForFunction(() => document.querySelectorAll('.entry').length === 3);
    assert.equal(await page.locator('.entry script').count(), 0); assert.equal(await page.locator('.card-open img').count(), 0);
    await screenshot(page, 'desktop-test-fixtures');
  });
  await check('reference geometry uses compact hero, exact brand cube and three-column cards', async () => {
    const metrics = await page.evaluate(() => {
      const card = document.querySelector('.entry').getBoundingClientRect();
      return { nav: document.querySelector('.v-nav').getBoundingClientRect().height, title: getComputedStyle(document.querySelector('h1')).fontSize, x: card.x, width: card.width, top: card.y, cells: document.querySelectorAll('.face.fx i, .face.fy i').length, columns: getComputedStyle(document.querySelector('.market-grid')).gridTemplateColumns.split(' ').length, radius: getComputedStyle(document.querySelector('.entry')).borderRadius };
    });
    assert.ok(Math.abs(metrics.nav - 60) < 1, `navigation height ${metrics.nav}`); assert.equal(metrics.title, '42px'); assert.equal(metrics.cells, 32); assert.equal(metrics.columns, 3); assert.equal(metrics.radius, '20px');
    assert.ok(Math.abs(metrics.x - 148) < 2); assert.ok(Math.abs(metrics.width - 368) < 2); assert.ok(metrics.top >= 420 && metrics.top <= 480, JSON.stringify(metrics));
    assert.equal(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length), 0, 'reduced-motion preference must stop decorative CSS animation');
  });
  await check('search shortcut, query, source, category and sort compose', async () => {
    await page.locator('body').click({ position: { x: 5, y: 500 } }); await page.keyboard.press('/'); assert.equal(await page.locator('#query').evaluate(el => el === document.activeElement), true);
    await page.locator('#query').fill('memo'); assert.equal(await page.locator('.entry').count(), 1); assert.match(page.url(), /q=memo/);
    await page.locator('[data-source="github-release"]').click(); assert.equal(await page.locator('#no-results').isVisible(), true);
    await page.locator('#clear-search').click(); assert.equal(await page.locator('.entry').count(), 3);
    await page.locator('[data-category="工作台面板"]').click(); assert.equal(await page.locator('.entry').count(), 1);
    await page.locator('[data-sort="author"]').click(); assert.match(page.url(), /sort=author/);
    await page.locator('#reset-filters').click(); assert.equal(await page.locator('.entry').count(), 3);
  });
  await check('shareable filters survive reload and Back/Forward restores state', async () => {
    await page.locator('#query').fill('notes'); await page.reload(); await page.waitForFunction(() => document.querySelectorAll('.entry').length === 1);
    assert.equal(await page.locator('#query').inputValue(), 'notes');
    await page.goto(`${base}/?source=github-release&category=${encodeURIComponent('工作台面板')}#directory`); await page.waitForFunction(() => document.querySelectorAll('.entry').length === 1);
    await page.goBack(); assert.equal(await page.locator('#query').inputValue(), 'notes');
    await page.goForward(); assert.equal(await page.locator('[data-category="工作台面板"]').getAttribute('aria-pressed'), 'true');
    await page.locator('#reset-filters').click();
  });
  await check('dialog exposes exact source and deep link, keeps focus inside, closes repeatedly', async () => {
    const opener = page.getByRole('button', { name: '天气工具 · 测试样本', exact: true });
    await opener.click(); assert.equal(await page.locator('#extension-dialog').isVisible(), true);
    const link = new URL(await page.locator('#detail-install').getAttribute('href'));
    assert.deepEqual(JSON.parse(link.searchParams.get('source')), fixture[0].source); assert.equal(link.searchParams.get('extensionId'), fixture[0].id);
    assert.deepEqual(JSON.parse(await page.locator('#detail-json').textContent()), fixture[0]);
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement)), true); }
    await screenshot(page, 'desktop-detail-test-fixture');
    await page.keyboard.press('Escape'); assert.equal(await opener.evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('body').evaluate(el => el.classList.contains('dialog-open')), false);
    await opener.click(); await page.locator('#close-dialog').click(); await opener.click();
    await page.mouse.click(2, 2); assert.equal(await page.locator('#extension-dialog').isVisible(), false);
    await opener.click(); await page.locator('#close-dialog').click();
  });
  await check('anatomy inspector highlights fields, switches keyboard tabs and transfers a real listing to precheck', async () => {
    await page.getByRole('button', { name: '天气工具 · 测试样本', exact: true }).click();
    assert.equal(Math.round((await page.locator('dialog').boundingBox()).width), 980);
    await page.locator('[data-inspector-group="source"]').click(); assert.ok(await page.locator('#detail-json [data-group="source"].is-hi').count() > 0);
    await page.locator('#source-code-tab').click(); assert.deepEqual(JSON.parse(await page.locator('#detail-source-json').textContent()), fixture[0].source);
    await page.keyboard.press('ArrowLeft'); assert.equal(await page.locator('#listing-code-tab').getAttribute('aria-selected'), 'true');
    await page.locator('#inspect-listing').click(); await page.locator('#draft-result.valid').waitFor();
    assert.equal(await page.locator('dialog').isVisible(), false); const draft = JSON.parse(await page.locator('#listing-input').inputValue());
    assert.equal(draft.id, fixture[0].id); assert.equal(draft.icon, 'assets/dev.example.weather.svg');
    assert.equal(await page.locator('body').evaluate(el => el.classList.contains('dialog-open')), false);
  });
  await check('clipboard success and denied permission have useful distinct results', async () => {
    await page.getByRole('button', { name: '天气工具 · 测试样本', exact: true }).click();
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.copied = value; } } }));
    await page.locator('#copy-install').click(); assert.match(await page.locator('#copy-status').textContent(), /已复制/);
    assert.equal(await page.evaluate(() => window.copied), await page.locator('#detail-install').getAttribute('href'));
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
    await page.locator('#copy-install').click(); assert.equal(await page.locator('#copy-fallback-label').isVisible(), true);
    assert.equal(await page.locator('#copy-fallback').inputValue(), await page.locator('#detail-install').getAttribute('href'));
    await page.keyboard.press('Escape');
  });
  await check('card copy does not open the inspector, and clipboard failure has a selectable fallback', async () => {
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.copied = value; } } }));
    await page.getByRole('button', { name: '复制 天气工具 · 测试样本 的安装链接', exact: true }).click();
    assert.equal(await page.locator('dialog').isVisible(), false); assert.equal(new URL(await page.evaluate(() => window.copied)).protocol, 'varin:');
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
    await page.getByRole('button', { name: '复制 天气工具 · 测试样本 的安装链接', exact: true }).click();
    assert.equal(await page.locator('#copy-fallback-label').isVisible(), true); await page.keyboard.press('Escape');
  });
  await check('CLI scaffold uses real template names and rejects malformed IDs without executing commands', async () => {
    await page.locator('#scaffold-id').fill('dev.example.panel'); await page.locator('[data-template="editor"]').click();
    assert.match(await page.locator('#scaffold-command').textContent(), /--template editor/);
    await page.locator('#scaffold-name').fill('Panel; echo injected');
    assert.match(await page.locator('#scaffold-command').textContent(), /--name='Panel; echo injected'/);
    await page.locator('#scaffold-id').fill('bad; command'); assert.equal(await page.locator('#copy-scaffold').isDisabled(), true);
    await page.locator('#scaffold-id').fill('dev.example.panel'); assert.equal(await page.locator('#copy-scaffold').isDisabled(), false);
    await page.locator('[data-info="source"]').click(); assert.match(await page.locator('#field-explanation').textContent(), /specifier/);
  });
  await check('theme selection persists and system mode clears the override', async () => {
    await page.getByRole('button', { name: '切换深色外观', exact: true }).click(); await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await page.getByRole('button', { name: '切换浅色外观', exact: true }).count(), 1);
    await page.emulateMedia({ colorScheme: 'dark' }); await page.getByRole('button', { name: '跟随系统外观', exact: true }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), null);
    assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(22, 22, 22)');
    await screenshot(page, 'desktop-dark-test-fixtures');
    await page.emulateMedia({ colorScheme: 'light' });
  });
  await check('responsive cards, modal and navigation fit at 320/390/768/961/1040/1080 px', async () => {
    for (const width of [320, 390, 768, 961, 1040, 1080]) {
      await page.setViewportSize({ width, height: 844 }); await page.goto(base); await page.waitForFunction(() => document.querySelectorAll('.entry').length === 3);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `horizontal overflow at ${width}`);
      await page.getByRole('button', { name: '天气工具 · 测试样本', exact: true }).click();
      assert.equal(await page.locator('dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true, `dialog overflow at ${width}`);
      await page.keyboard.press('Escape');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '打开导航', exact: true }).click(); assert.equal(await page.locator('#mobile-menu').isVisible(), true);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#mobile-menu').isVisible(), false);
    await page.getByRole('button', { name: '打开导航', exact: true }).click(); await page.locator('#mobile-menu a[href="#authoring"]').click(); assert.equal(await page.locator('#mobile-menu').isVisible(), false);
    state = 'empty'; await page.setViewportSize({ width: 390, height: 844 }); await page.goto(base); await page.locator('#empty-catalog').waitFor({ state: 'visible' });
    await screenshot(page, 'mobile-empty');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    state = 'entries';
  });
  await check('offline and malformed response show retry, then recover without fake empty state', async () => {
    state = 'error'; await page.goto(base); await page.locator('#load-error').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#empty-catalog').isVisible(), false);
    state = 'malformed'; await page.locator('#retry').click(); await page.waitForFunction(() => document.querySelector('#error-message').textContent.includes('条目格式'));
    state = 'entries'; await page.locator('#retry').click(); await page.waitForFunction(() => document.querySelectorAll('.entry').length === 3);
    assert.equal(await page.locator('#load-error').isVisible(), false);
  });
  await check('stale shared category remains explicit and can be cleared', async () => {
    await page.goto(`${base}/?category=missing`); await page.locator('#no-results').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-category="missing"]').getAttribute('aria-pressed'), 'true'); await page.locator('#clear-search').click(); assert.equal(await page.locator('.entry').count(), 3);
  });
  await check('JavaScript-disabled page retains honest catalog and source links', async () => {
    const noJs = await browser.newContext({ javaScriptEnabled: false }); const fallback = await noJs.newPage(); await fallback.goto(base);
    assert.equal(await fallback.locator('noscript').isVisible(), true); assert.equal(await fallback.locator('noscript a[href="/catalog/v1.json"]').count(), 1); await noJs.close();
  });
  assert.deepEqual(pageErrors, []); console.log(`PASS: ${checks} browser scenarios; no uncaught page errors.`);
} finally { await context.close(); await browser.close(); await new Promise(done => server.close(done)); }
