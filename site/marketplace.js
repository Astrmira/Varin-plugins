// Browser-safe helpers. These checks are deliberately not an install/security approval.
export const SOURCE_LABELS = { 'github-release': 'GitHub Release', npm: 'npm' };
export const EXAMPLE_LISTING = {
  id: 'dev.example.weather', displayName: 'Weather',
  description: 'A short description of what the extension does.', author: 'Example author',
  categories: ['Utilities'], keywords: ['forecast'], icon: 'assets/dev.example.weather.svg',
  repository: 'https://github.com/example/weather',
  source: { kind: 'github-release', specifier: 'example/weather', display: 'example/weather' },
};
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const isStringArray = value => Array.isArray(value) && value.every(hasText);
export function isPublicHttps(value) {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
export function isAssetPath(value, catalog = false) {
  const path = catalog && typeof value === 'string' ? value.replace(/^\.\.\//, '') : value;
  return typeof path === 'string' && /^assets\/[a-zA-Z0-9._/-]+\.(svg|png|webp|jpg|jpeg)$/.test(path)
    && !path.split('/').some(part => part === '..' || part === '.');
}
export function sourceErrors(source) {
  if (!isObject(source) || !Object.hasOwn(SOURCE_LABELS, source.kind)) return ['source.kind 必须是 github-release 或 npm。'];
  const errors = [];
  if (!hasText(source.specifier)) errors.push('source.specifier 不能为空。');
  if (!hasText(source.display)) errors.push('source.display 不能为空。');
  if (Object.keys(source).some(key => !['kind', 'specifier', 'display'].includes(key))) errors.push('source 包含不支持的字段。');
  if (!hasText(source.specifier)) return errors;
  const specifier = source.specifier.trim();
  if (source.kind === 'github-release') {
    const match = /^([\w.-]+)\/([\w.-]+)(?:#(stable|prerelease)(?:\?(.*))?)?$/.exec(specifier);
    if (!match || ['.', '..'].includes(match[1]) || ['.', '..'].includes(match[2])) errors.push('GitHub 来源应为 owner/repository，可附带 #stable 或 #prerelease 选择器。');
    else {
      const params = new URLSearchParams(match[4]);
      if ([...params.keys()].some(key => !['tagPrefix', 'manifest'].includes(key))) errors.push('GitHub 选择器只支持 tagPrefix 和 manifest。');
      if (params.has('manifest') && !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(params.get('manifest'))) errors.push('manifest 必须是不含路径的文件名。');
    }
  } else if (!/^((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)(?:@[^\r\n]+)?$/.test(specifier)) errors.push('npm 来源应为包名，可附带版本、范围或 dist-tag。');
  return errors;
}
export function listingErrors(value, { catalog = false } = {}) {
  if (!isObject(value)) return ['收录资料必须是 JSON 对象。'];
  const errors = [];
  const allowed = ['id', 'displayName', 'description', 'author', 'categories', 'keywords', 'icon', 'repository', 'homepage', 'source'];
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`不支持字段 ${key}；版本与安装统计不属于收录资料。`);
  for (const key of ['id', 'displayName', 'description', 'author']) if (!hasText(value[key])) errors.push(`${key} 不能为空。`);
  if (hasText(value.id) && !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value.id)) errors.push('id 只能使用小写字母、数字，以及分隔符 . _ -。');
  for (const key of ['categories', 'keywords']) {
    if (key === 'keywords' && value[key] === undefined) continue;
    if (!isStringArray(value[key])) errors.push(`${key} 必须是非空字符串组成的数组。`);
    else if (new Set(value[key].map(item => item.trim())).size !== value[key].length) errors.push(`${key} 不能重复。`);
  }
  if (!isAssetPath(value.icon, catalog)) errors.push('icon 必须指向 assets/ 下的 SVG、PNG、WebP 或 JPEG 图标，不能越界。');
  if (!isPublicHttps(value.repository)) errors.push('repository 必须是无凭据的 HTTPS 地址。');
  if (value.homepage !== undefined && !isPublicHttps(value.homepage)) errors.push('homepage 必须是无凭据的 HTTPS 地址。');
  errors.push(...sourceErrors(value.source));
  return errors;
}
export function inspectDraft(text) {
  try {
    const value = JSON.parse(text);
    return { value, errors: listingErrors(value) };
  } catch { return { errors: ['JSON 无法解析，请检查引号、逗号与括号。'] }; }
}
export function parseCatalog(value) {
  if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.entries)) throw new Error('不支持的目录格式');
  const ids = new Set();
  const entries = value.entries.map(entry => {
    const errors = listingErrors(entry, { catalog: true });
    if (errors.length) throw new Error('目录条目格式不完整，请由维护者检查后重试');
    if (ids.has(entry.id)) throw new Error('目录包含重复的插件 ID');
    ids.add(entry.id);
    return { ...entry, keywords: entry.keywords ?? [] };
  });
  return entries;
}
export function filterEntries(entries, { query = '', source = '', category = '', sort = 'name' } = {}) {
  const term = query.trim().toLocaleLowerCase();
  return entries.filter(entry => (!source || entry.source.kind === source) && (!category || entry.categories.includes(category))
    && (!term || [entry.id, entry.displayName, entry.description, entry.author, entry.source.display, entry.source.specifier, ...entry.categories, ...entry.keywords].join(' ').toLocaleLowerCase().includes(term)))
    .sort((a, b) => (sort === 'author' ? a.author.localeCompare(b.author, 'zh-CN') : 0) || a.displayName.localeCompare(b.displayName, 'zh-CN') || a.id.localeCompare(b.id));
}
export function installUrl(entry) {
  const url = new URL('varin://extensions/install');
  url.searchParams.set('source', JSON.stringify(entry.source));
  url.searchParams.set('extensionId', entry.id);
  return url.href;
}
export function readFilters(search) {
  const params = new URLSearchParams(search);
  return { query: params.get('q') ?? '', source: ['github-release', 'npm'].includes(params.get('source')) ? params.get('source') : '', category: params.get('category') ?? '', sort: params.get('sort') === 'author' ? 'author' : 'name' };
}
export function writeFilters(url, filters) {
  const result = new URL(url);
  for (const [key, value] of Object.entries({ q: filters.query.trim(), source: filters.source, category: filters.category, sort: filters.sort === 'author' ? 'author' : '' })) {
    if (value) result.searchParams.set(key, value); else result.searchParams.delete(key);
  }
  return result;
}
