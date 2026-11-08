import { SOURCE_LABELS, EXAMPLE_LISTING, parseCatalog, filterEntries, installUrl, readFilters, writeFilters, inspectDraft } from './marketplace.js';

const $ = selector => document.querySelector(selector);
const query = $('#query'), category = $('#category'), sort = $('#sort');
const container = $('#entries'), status = $('#status'), dialog = $('#extension-dialog');
const filters = readFilters(location.search);
let entries = [], loaded = false, loading = false, loadError = '', selected = null, opener = null;
const element = (tag, className = '', text = '') => { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; };
const external = (label, url, className = '') => { const link = element('a', className, label); link.href = url; link.rel = 'noopener noreferrer'; link.target = '_blank'; return link; };
const iconUrl = entry => new URL(entry.icon.startsWith('assets/') ? `../${entry.icon}` : entry.icon, new URL('/catalog/v1.json', location.origin)).href;
function makeIcon(entry) {
  const icon = new Image(44, 44); icon.src = iconUrl(entry); icon.alt = ''; icon.loading = 'lazy';
  icon.addEventListener('error', () => { icon.src = '/mark.svg'; }, { once: true }); return icon;
}
function syncFilterControls() {
  query.value = filters.query; sort.value = filters.sort;
  const categories = [...new Set(entries.flatMap(entry => entry.categories))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  // Keep an explicit stale URL filter visible instead of silently broadening a shared query.
  if (filters.category && !categories.includes(filters.category)) categories.push(filters.category);
  category.replaceChildren(new Option('全部用途', ''));
  for (const value of categories) category.add(new Option(value, value));
  category.value = filters.category;
}
function render() {
  const filtered = filterEntries(entries, filters);
  const hasFilters = Boolean(filters.query.trim() || filters.category || filters.source || filters.sort !== 'name');
  $('#reset-filters').hidden = !hasFilters;
  for (const button of document.querySelectorAll('[data-source]')) button.setAttribute('aria-pressed', String(button.dataset.source === filters.source));
  for (const node of document.querySelectorAll('[data-count]')) node.textContent = loaded ? String(node.dataset.count === 'all' ? entries.length : entries.filter(entry => entry.source.kind === node.dataset.count).length) : '—';
  status.textContent = loaded ? `显示 ${filtered.length} / ${entries.length} 个插件${loadError ? ' · 上次读取的目录' : ''}` : loading ? '正在读取插件目录…' : '目录暂不可用';
  container.setAttribute('aria-busy', String(loading));
  $('#empty-catalog').hidden = !loaded || entries.length !== 0;
  $('#no-results').hidden = !loaded || entries.length === 0 || filtered.length !== 0;
  if (!loaded && loading) return;
  container.replaceChildren();
  for (const entry of filtered) {
    const card = element('article', 'entry');
    const heading = element('div', 'card-heading');
    const identity = element('div', 'card-identity');
    const title = element('h3');
    const open = element('button', 'card-open', entry.displayName); open.type = 'button';
    open.addEventListener('click', () => openDetails(entry, open)); title.append(open);
    identity.append(title, element('p', 'entry-id mono', entry.id)); heading.append(makeIcon(entry), identity);
    const source = element('div', 'card-source'); source.append(element('span', 'source-pill', SOURCE_LABELS[entry.source.kind]), element('span', 'entry-author', entry.author));
    const tags = element('div', 'card-tags');
    for (const item of entry.categories) tags.append(element('span', '', item));
    if (!entry.categories.length) tags.append(element('span', '', '未分类'));
    const foot = element('div', 'card-footer'); foot.append(tags, element('span', 'card-arrow', '↗'));
    card.append(source, heading, element('p', 'description', entry.description), foot); container.append(card);
  }
}
function updateFilters(patch) {
  Object.assign(filters, patch);
  history.replaceState(null, '', writeFilters(location.href, filters));
  syncFilterControls(); render();
}
function resetFilters() { updateFilters({ query: '', category: '', source: '', sort: 'name' }); query.focus(); }
async function load() {
  if (loading) return;
  loading = true; loadError = ''; $('#load-error').hidden = true; $('#retry').disabled = true; render();
  try {
    const response = await fetch('/catalog/v1.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    entries = parseCatalog(await response.json()); loaded = true;
    syncFilterControls();
  } catch (error) {
    loadError = error instanceof SyntaxError ? '目录 JSON 无法解析' : error.message;
    $('#error-message').textContent = `目录读取失败：${loadError}。${loaded ? '仍保留上次读取的资料。' : '请稍后重试，或前往 GitHub 查看收录仓库。'}`;
    $('#load-error').hidden = false;
  } finally { loading = false; $('#retry').disabled = false; render(); }
}
function openDetails(entry, trigger) {
  if (dialog.open) return;
  selected = entry; opener = trigger;
  $('#detail-title').textContent = entry.displayName;
  $('#detail-kind').textContent = SOURCE_LABELS[entry.source.kind];
  $('#detail-id').textContent = entry.id;
  const icon = $('#detail-icon'); icon.src = iconUrl(entry); icon.onerror = () => { icon.onerror = null; icon.src = '/mark.svg'; };
  $('#detail-description').textContent = entry.description;
  $('#detail-json').textContent = JSON.stringify(entry, null, 2);
  const meta = $('#detail-meta'); meta.replaceChildren();
  for (const [label, value] of [['作者', entry.author], ['用途', entry.categories.join(' / ') || '未分类'], ['发行来源', entry.source.display], ['来源选择器', entry.source.specifier]]) meta.append(element('dt', '', label), element('dd', '', value));
  $('#detail-install').href = installUrl(entry);
  $('#copy-status').textContent = ''; $('#copy-install').textContent = '复制安装链接'; $('#copy-fallback-label').hidden = true;
  $('#copy-fallback').value = installUrl(entry);
  const links = $('#detail-links'); links.replaceChildren(external('作者仓库 ↗', entry.repository));
  if (entry.homepage && entry.homepage !== entry.repository) links.append(external('使用文档 ↗', entry.homepage));
  links.append(external('修改收录资料 ↗', `https://github.com/Astrmira/Varin-plugins/edit/main/entries/${encodeURIComponent(entry.id)}.json`));
  $('.catalog-source').open = false; dialog.showModal(); dialog.scrollTop = 0; document.body.classList.add('dialog-open'); $('#close-dialog').focus();
}
function closeDetails() { if (dialog.open) dialog.close(); }
dialog.addEventListener('close', () => { document.body.classList.remove('dialog-open'); selected = null; if (opener?.isConnected) opener.focus(); });
// Only a pointer that starts and ends outside dismisses the dialog, not a drag from its contents.
let pointerOutside = false;
const outside = event => { const bounds = dialog.getBoundingClientRect(); return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom; };
dialog.addEventListener('pointerdown', event => { pointerOutside = event.target === dialog && outside(event); });
dialog.addEventListener('click', event => { if (pointerOutside && event.target === dialog && outside(event)) closeDetails(); pointerOutside = false; });
$('#close-dialog').addEventListener('click', closeDetails);
$('#copy-install').addEventListener('click', async () => {
  const entry = selected; if (!entry) return;
  try {
    await navigator.clipboard.writeText(installUrl(entry));
    if (selected === entry) { $('#copy-install').textContent = '已复制 ✓'; $('#copy-status').textContent = '安装链接已复制，在 Varin 的“插件”中打开即可。'; }
  } catch {
    if (selected === entry) { $('#copy-fallback-label').hidden = false; $('#copy-fallback').focus(); $('#copy-fallback').select(); $('#copy-status').textContent = '浏览器不允许自动复制。请选择上方链接并手动复制。'; }
  }
});
$('.search-form').addEventListener('submit', event => event.preventDefault());
query.addEventListener('input', () => updateFilters({ query: query.value }));
category.addEventListener('change', () => updateFilters({ category: category.value }));
sort.addEventListener('change', () => updateFilters({ sort: sort.value }));
for (const button of document.querySelectorAll('[data-source]')) button.addEventListener('click', () => updateFilters({ source: button.dataset.source }));
$('#reset-filters').addEventListener('click', resetFilters); $('#clear-search').addEventListener('click', resetFilters); $('#retry').addEventListener('click', load);
window.addEventListener('popstate', () => { closeDetails(); Object.assign(filters, readFilters(location.search)); syncFilterControls(); render(); });
window.addEventListener('keydown', event => {
  const target = event.target;
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !dialog.open && !target.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
    event.preventDefault(); query.focus(); query.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
});
function updateTheme(choice) {
  if (choice === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = choice;
  try { localStorage.setItem('varin-market-theme', choice); } catch { /* Theme still works for this page. */ }
  for (const button of document.querySelectorAll('[data-theme-choice]')) button.setAttribute('aria-pressed', String(button.dataset.themeChoice === choice));
}
for (const button of document.querySelectorAll('[data-theme-choice]')) button.addEventListener('click', () => updateTheme(button.dataset.themeChoice));
updateTheme(document.documentElement.dataset.theme || 'system');
const draftInput = $('#listing-input');
function checkDraft() {
  const result = inspectDraft(draftInput.value);
  const output = $('#draft-result'); output.replaceChildren(); output.className = `draft-result ${result.errors.length ? 'invalid' : 'valid'}`;
  output.append(element('strong', '', result.errors.length ? `发现 ${result.errors.length} 项基础问题` : '基础结构通过 ✓'));
  if (result.errors.length) { const list = element('ul'); for (const error of result.errors) list.append(element('li', '', error)); output.append(list); }
  output.append(element('p', '', '此预检不验证发行是否存在、图标文件、SemVer 范围或包内契约，也不代表已收录或安全。请继续运行仓库校验与发行核验。'));
}
$('#load-example').addEventListener('click', () => { draftInput.value = JSON.stringify(EXAMPLE_LISTING, null, 2); checkDraft(); });
$('#validate-draft').addEventListener('click', checkDraft);
draftInput.addEventListener('input', () => { $('#draft-result').className = 'draft-result'; $('#draft-result').replaceChildren(element('p', '', '资料已修改，请重新检查。')); });
$('#copy-checks').addEventListener('click', async event => {
  const button = event.currentTarget;
  try { await navigator.clipboard.writeText($('#check-commands').textContent); button.textContent = '已复制 ✓'; }
  catch { button.textContent = '请手动选择下方命令'; const range = document.createRange(); range.selectNodeContents($('#check-commands')); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); }
});
syncFilterControls(); void load();
