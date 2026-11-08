// Template names verified against Varin packages/extension-cli/src/templates.ts.
// Generate text only. These commands are never executed by the marketplace.
export const CLI_TEMPLATES = ['surface', 'shell', 'editor', 'view', 'language', 'debug', 'test'];
export const quoteShell = value => `'${value.replaceAll("'", "'\\''")}'`;
export function scaffoldCommands({ id, name, template }) {
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(id) || id.length > 160) return { error: '扩展 ID 请使用小写字母、数字及 . _ - 分隔符。' };
  if (!name.trim() || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) return { error: '请填写不含控制字符的显示名称（最多 120 字符）。' };
  if (!CLI_TEMPLATES.includes(template)) return { error: '请选择受支持的 CLI 模板。' };
  return { command: `varin-extension init ./my-extension --id ${quoteShell(id)} --name=${quoteShell(name.trim())} --template ${template} &&\ncd ./my-extension &&\nvarin-extension build &&\nvarin-extension check &&\nvarin-extension test` };
}
export function toListingDraft(entry) {
  return { ...entry, icon: entry.icon.replace(/^\.\.\//, '') };
}
export const FIELD_INFO = {
  identity: 'id 与包内扩展身份一致。displayName、description 与 author 是作者提交的展示资料，不代表官方认证。',
  discovery: 'categories 与 keywords 帮助搜索和筛选。目录不根据标签推断运行层、权限数量或可用平台。',
  source: 'source.kind 选择 GitHub Release 或 npm；specifier 指定作者来源及选择器，display 是可读名称。',
  links: 'icon 指向市场仓库内的 assets/。repository 与可选 homepage 连接作者源码和使用文档。',
};
export const LISTING_GROUPS = {
  identity: ['id', 'displayName', 'description', 'author', 'categories', 'keywords'],
  source: ['source'],
  links: ['icon', 'repository', 'homepage'],
};
// Return exact JSON lines with display-only token metadata, never HTML.
export function jsonLines(value) {
  const lines = JSON.stringify(value, null, 2).split('\n');
  let group = '';
  return lines.map(text => {
    const topKey = /^  "([^"]+)":/.exec(text)?.[1];
    if (topKey) group = Object.keys(LISTING_GROUPS).find(key => LISTING_GROUPS[key].includes(topKey)) || '';
    if (text === '{' || text === '}') group = '';
    const tokens = []; const pattern = /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null|-?\d+(?:\.\d+)?)\b/g;
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > offset) tokens.push({ text: text.slice(offset, match.index), kind: '' });
      tokens.push({ text: match[0], kind: match[0][0] === '"' ? /^\s*:/.test(text.slice(match.index + match[0].length)) ? 'k' : 's' : 'n' });
      offset = match.index + match[0].length;
    }
    if (offset < text.length) tokens.push({ text: text.slice(offset), kind: '' });
    return { text, group, tokens };
  });
}
