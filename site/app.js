const query = document.querySelector('#query');
const category = document.querySelector('#category');
const container = document.querySelector('#entries');
const status = document.querySelector('#status');
const retry = document.querySelector('#retry');
let entries = [];
let loaded = false;
const element = (tag, className, text) => { const node = document.createElement(tag); node.className = className; if (text) node.textContent = text; return node; };
const external = (label, url, className = '') => { const link = element('a', className, label); link.href = url; link.rel = 'noopener noreferrer'; link.target = '_blank'; return link; };
const safeUrl = url => { try { return new URL(url).protocol === 'https:'; } catch { return false; } };
function render() {
  const search = query.value.trim().toLocaleLowerCase();
  const filtered = entries.filter(entry => (!category.value || entry.categories.includes(category.value))
    && (!search || [entry.displayName, entry.description, entry.author, ...entry.keywords].join(' ').toLocaleLowerCase().includes(search)));
  container.replaceChildren();
  status.textContent = !loaded ? '正在读取插件目录…' : entries.length === 0 ? '目录正在准备中，暂时没有已收录插件。你仍可在 Varin 中直接安装作者提供的发行包。' : filtered.length ? `${filtered.length} 个插件` : '没有匹配的插件。试试其他关键词或用途。';
  for (const entry of filtered) {
    const row = element('article', 'entry');
    const icon = document.createElement('img'); icon.src = new URL(entry.icon, new URL('/catalog/v1.json', location.origin)); icon.alt = ''; icon.width = 48; icon.height = 48; icon.loading = 'lazy';
    const body = element('div', 'body'); body.append(element('h2', '', entry.displayName), element('p', 'description', entry.description));
    const details = element('details', 'full-description'); details.append(element('summary', '', '完整简介'), element('p', '', entry.description)); body.append(details);
    body.append(element('p', 'meta', `${entry.author} · ${entry.categories.join(' / ')}`));
    const actions = element('div', 'actions');
    const link = new URL('varin://extensions/install'); link.searchParams.set('source', JSON.stringify(entry.source)); link.searchParams.set('extensionId', entry.id);
    const install = element('a', 'primary', '在 Varin 中打开'); install.href = link.href;
    const copy = element('button', '', '复制安装链接'); copy.type = 'button';
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(link.href); copy.textContent = '已复制'; } catch { copy.textContent = '无法复制，请从“在 Varin 中打开”复制链接地址'; } });
    actions.append(install, copy);
    if (safeUrl(entry.repository)) actions.append(external('查看仓库 ↗', entry.repository));
    if (entry.homepage && safeUrl(entry.homepage) && entry.homepage !== entry.repository) actions.append(external('使用文档 ↗', entry.homepage));
    actions.append(external('修改收录资料 ↗', `https://github.com/Astrmira/Varin-plugins/edit/main/entries/${encodeURIComponent(entry.id)}.json`, 'meta'));
    row.append(icon, body, actions); container.append(row);
  }
}
async function load() {
  retry.hidden = true;
  try {
    const response = await fetch('/catalog/v1.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const document = await response.json();
    if (document.schemaVersion !== 1 || !Array.isArray(document.entries)) throw new Error('不支持的目录格式');
    entries = document.entries; loaded = true;
    const previous = category.value;
    category.replaceChildren(new Option('全部用途', ''));
    for (const value of [...new Set(entries.flatMap(entry => entry.categories))].sort()) category.add(new Option(value, value));
    if ([...category.options].some(option => option.value === previous)) category.value = previous;
    render();
  } catch (error) { status.textContent = `目录读取失败：${error.message}${loaded ? '。仍显示上次读取的列表。' : ''}`; retry.hidden = false; }
}
document.querySelector('form').addEventListener('submit', event => event.preventDefault());
query.addEventListener('input', render); category.addEventListener('change', render); retry.addEventListener('click', load); void load();
