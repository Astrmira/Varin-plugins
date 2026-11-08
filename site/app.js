import { SOURCE_LABELS, EXAMPLE_LISTING, parseCatalog, filterEntries, installUrl, readFilters, writeFilters, inspectDraft } from './marketplace.js';
import { scaffoldCommands, toListingDraft, FIELD_INFO, jsonLines } from './authoring.js';
import { mountScene } from './scene.js';

const $ = selector => document.querySelector(selector);
const query = $('#query'), container = $('#entries'), status = $('#status'), dialog = $('#extension-dialog');
const filters = readFilters(location.search);
const COMMON_CATEGORIES = ['工作台面板','工具服务','Agent 策略','上下文模型','语言调试'];
let entries=[],loaded=false,loading=false,loadError='',selected=null,opener=null,toastTimer;
const element=(tag,className='',text='')=>{const node=document.createElement(tag);node.className=className;node.textContent=text;return node;};
const external=(label,url,className='')=>{const link=element('a',className,label);link.href=url;link.rel='noopener noreferrer';link.target='_blank';return link;};
const iconUrl=entry=>new URL(entry.icon.startsWith('assets/')?`../${entry.icon}`:entry.icon,new URL('/catalog/v1.json',location.origin)).href;
const motion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('#toast').hidden=true;},2600);}
function makeIcon(entry){const icon=new Image(24,24);icon.src=iconUrl(entry);icon.alt='';icon.loading='lazy';icon.addEventListener('error',()=>{icon.src='/mark.svg';},{once:true});return icon;}
function categoryOptions(){return [...new Set([...COMMON_CATEGORIES,...entries.flatMap(entry=>entry.categories),...(filters.category?[filters.category]:[])])];}
function syncFilterControls(){
  query.value=filters.query;$('#clear-query').hidden=!filters.query;
  const tabs=$('#category-tabs');const focusCategory=tabs.contains(document.activeElement)?document.activeElement.dataset.category:null;
  tabs.replaceChildren();
  for(const value of ['',...categoryOptions()]){
    const button=element('button',`wb-tab${filters.category===value?' is-active':''}`);button.type='button';button.dataset.category=value;button.setAttribute('aria-pressed',String(filters.category===value));
    button.append(element('span','',value||'全部'),element('span','count',loaded?String(value?entries.filter(entry=>entry.categories.includes(value)).length:entries.length):'—'));
    button.addEventListener('click',()=>updateFilters({category:value}));tabs.append(button);
  }
  if(focusCategory!==null)[...tabs.children].find(node=>node.dataset.category===focusCategory)?.focus({preventScroll:true});
  for(const button of document.querySelectorAll('[data-source]')){const active=button.dataset.source===filters.source;button.setAttribute('aria-pressed',String(active));button.classList.toggle('is-active',active);}
  for(const button of document.querySelectorAll('[data-sort]')){const active=button.dataset.sort===filters.sort;button.setAttribute('aria-pressed',String(active));button.classList.toggle('is-active',active);}
  for(const button of document.querySelectorAll('[data-nav-source]')){if(button.dataset.navSource===filters.source)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');}
}
function render(){
  const filtered=filterEntries(entries,filters);
  $('#reset-filters').hidden=!(filters.query.trim()||filters.category||filters.source||filters.sort!=='name');
  for(const node of document.querySelectorAll('[data-count="all"]'))node.textContent=loaded?String(entries.length):'—';
  status.textContent=loaded?`显示 ${filtered.length} / ${entries.length} 个插件${loadError?' · 上次读取的目录':''}`:loading?'正在读取插件目录…':'目录暂不可用';
  container.setAttribute('aria-busy',String(loading));
  $('#empty-catalog').hidden=!loaded||entries.length!==0;$('#no-results').hidden=!loaded||!entries.length||Boolean(filtered.length);
  if(!loaded&&loading)return;
  container.replaceChildren();
  for(const [index,entry] of filtered.entries()){
    const card=element('article','market-card entry');card.style.setProperty('--d',`${Math.min(index,11)*32}ms`);
    const top=element('div','card-top'),icon=element('span','ci');icon.append(makeIcon(entry));top.append(icon,element('span','card-tag',entry.categories[0]||'未分类'));
    const title=element('h3'),open=element('button','card-open',entry.displayName);open.type='button';open.addEventListener('click',()=>openDetails(entry,open));title.append(open);
    const id=element('p','pkg-id',entry.id);id.title=`${entry.id} · ${entry.author}`;
    const bar=element('div','install-bar'),source=element('code','',`${entry.source.kind==='npm'?'npm':'github'}: ${entry.source.specifier}`);source.title=entry.source.specifier;
    const copy=element('button','install-btn','复制');copy.type='button';copy.setAttribute('aria-label',`复制 ${entry.displayName} 的安装链接`);copy.title='复制安装链接，在自己的 Varin 中继续';
    copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(installUrl(entry));copy.textContent='✓ 已复制';copy.classList.add('is-copied');toast('安装链接已复制，在 Varin 的“插件”中打开。');setTimeout(()=>{copy.textContent='复制';copy.classList.remove('is-copied');},1800);}catch{openDetails(entry,copy);showCopyFallback();}});
    bar.append(source,copy);card.append(top,title,id,element('p','desc-body',entry.description),bar);container.append(card);
  }
}
function updateFilters(patch){Object.assign(filters,patch);history.replaceState(null,'',writeFilters(location.href,filters));syncFilterControls();render();}
function resetFilters(){updateFilters({query:'',category:'',source:'',sort:'name'});query.focus();}
async function load(){
  if(loading)return;loading=true;loadError='';$('#load-error').hidden=true;$('#retry').disabled=true;render();
  try{const response=await fetch('/catalog/v1.json',{cache:'no-cache'});if(!response.ok)throw new Error(`HTTP ${response.status}`);entries=parseCatalog(await response.json());loaded=true;syncFilterControls();}
  catch(error){loadError=error instanceof SyntaxError?'目录 JSON 无法解析':error.message;$('#error-message').textContent=`目录读取失败：${loadError}。${loaded?'仍保留上次读取的资料。':'请稍后重试，或前往 GitHub 查看收录仓库。'}`;$('#load-error').hidden=false;}
  finally{loading=false;$('#retry').disabled=false;render();}
}
function renderJson(target,value){
  target.replaceChildren();
  for(const line of jsonLines(value)){
    const node=element('span','line grp');node.dataset.group=line.group;
    for(const token of line.tokens)node.append(element('span',token.kind,token.text));
    target.append(node);
  }
}
function highlightGroup(group){
  for(const node of $('#detail-json').children)node.classList.toggle('is-hi',node.dataset.group===group);
  for(const button of document.querySelectorAll('[data-inspector-group]')){const selected=button.dataset.inspectorGroup===group;button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));}
}
function switchCodeTab(tab,focus=false){
  for(const button of document.querySelectorAll('[data-code-tab]')){const active=button.dataset.codeTab===tab;button.classList.toggle('is-on',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;if(active&&focus)button.focus();}
  $('#listing-code-panel').hidden=tab!=='listing';$('#source-code-panel').hidden=tab!=='source';
}
function openDetails(entry,trigger){
  if(dialog.open)return;selected=entry;opener=trigger;
  $('#detail-title').textContent=entry.displayName;$('#detail-kind').textContent=SOURCE_LABELS[entry.source.kind];$('#detail-id').textContent=`${entry.id} · ${entry.author}`;
  const icon=$('#detail-icon');icon.src=iconUrl(entry);icon.onerror=()=>{icon.onerror=null;icon.src='/mark.svg';};
  $('#detail-description').textContent=entry.description;$('#detail-source-specifier').textContent=entry.source.specifier;$('#detail-file-path').textContent=`entries/${entry.id}.json`;
  $('#detail-install').href=installUrl(entry);$('#copy-status').textContent='';$('#copy-install').textContent='复制安装链接';$('#copy-fallback-label').hidden=true;$('#copy-fallback').value=installUrl(entry);
  const tags=$('#detail-tags');tags.replaceChildren();for(const tag of entry.categories)tags.append(element('span','',tag));
  const links=$('#detail-links');links.replaceChildren(external('作者仓库 ↗',entry.repository));if(entry.homepage&&entry.homepage!==entry.repository)links.append(external('使用文档 ↗',entry.homepage));links.append(external('修改收录资料 ↗',`https://github.com/Astrmira/Varin-plugins/edit/main/entries/${encodeURIComponent(entry.id)}.json`));
  renderJson($('#detail-json'),entry);renderJson($('#detail-source-json'),entry.source);switchCodeTab('listing');highlightGroup('identity');
  dialog.showModal();dialog.scrollTop=0;document.body.classList.add('dialog-open');$('#close-dialog').focus();
}
function closeDetails(){if(dialog.open)dialog.close();}
function showCopyFallback(){ $('#copy-fallback-label').hidden=false;$('#copy-fallback').focus();$('#copy-fallback').select();$('#copy-status').textContent='浏览器不允许自动复制。请选择上方链接并手动复制。'; }
dialog.addEventListener('close',()=>{document.body.classList.remove('dialog-open');selected=null;if(opener?.isConnected)opener.focus();});
let pointerOutside=false;
const outside=event=>{const bounds=dialog.getBoundingClientRect();return event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom;};
dialog.addEventListener('pointerdown',event=>{pointerOutside=event.target===dialog&&outside(event);});
dialog.addEventListener('click',event=>{if(pointerOutside&&event.target===dialog&&outside(event))closeDetails();pointerOutside=false;});
$('#close-dialog').addEventListener('click',closeDetails);
$('#copy-install').addEventListener('click',async()=>{const entry=selected;if(!entry)return;try{await navigator.clipboard.writeText(installUrl(entry));if(selected===entry){$('#copy-install').textContent='已复制 ✓';$('#copy-status').textContent='安装链接已复制，在 Varin 的“插件”中打开即可。';}}catch{if(selected===entry)showCopyFallback();}});
for(const button of document.querySelectorAll('[data-inspector-group]')){
  const inspect=()=>{switchCodeTab('listing');highlightGroup(button.dataset.inspectorGroup);};button.addEventListener('click',inspect);button.addEventListener('focus',inspect);button.addEventListener('pointerenter',inspect);
}
for(const button of document.querySelectorAll('[data-code-tab]')){
  button.addEventListener('click',()=>switchCodeTab(button.dataset.codeTab));
  button.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();switchCodeTab(event.key==='Home'?'listing':event.key==='End'?'source':button.dataset.codeTab==='listing'?'source':'listing',true);}});
}
$('.market-search').addEventListener('submit',event=>event.preventDefault());query.addEventListener('input',()=>updateFilters({query:query.value}));
$('#clear-query').addEventListener('click',()=>{updateFilters({query:''});query.focus();});
for(const button of document.querySelectorAll('[data-source]'))button.addEventListener('click',()=>updateFilters({source:button.dataset.source}));
for(const button of document.querySelectorAll('[data-sort]'))button.addEventListener('click',()=>updateFilters({sort:button.dataset.sort}));
for(const button of document.querySelectorAll('[data-nav-source]'))button.addEventListener('click',()=>{updateFilters({source:button.dataset.navSource});window.scrollTo({top:0,behavior:motion()});});
$('#reset-filters').addEventListener('click',resetFilters);$('#clear-search').addEventListener('click',resetFilters);$('#retry').addEventListener('click',load);
window.addEventListener('popstate',()=>{closeDetails();Object.assign(filters,readFilters(location.search));syncFilterControls();render();});
function focusSearch(){closeMobileMenu();query.focus();query.scrollIntoView({block:'center',behavior:motion()});}
$('#focus-search').addEventListener('click',focusSearch);
window.addEventListener('keydown',event=>{const target=event.target;if(event.key==='/'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!dialog.open&&!target.isContentEditable&&!['INPUT','TEXTAREA','SELECT'].includes(target.tagName)){event.preventDefault();focusSearch();}if(event.key==='Escape'&&!$('#mobile-menu').hidden){closeMobileMenu();$('#mobile-menu-toggle').focus();}});
function closeMobileMenu(){$('#mobile-menu').hidden=true;$('#mobile-menu-toggle').setAttribute('aria-expanded','false');$('#mobile-menu-toggle').setAttribute('aria-label','打开导航');}
$('#mobile-menu-toggle').addEventListener('click',()=>{const open=$('#mobile-menu').hidden;$('#mobile-menu').hidden=!open;$('#mobile-menu-toggle').setAttribute('aria-expanded',String(open));$('#mobile-menu-toggle').setAttribute('aria-label',open?'关闭导航':'打开导航');});
for(const link of $('#mobile-menu').querySelectorAll('a'))link.addEventListener('click',closeMobileMenu);
document.addEventListener('click',event=>{if(!$('#navbar').contains(event.target))closeMobileMenu();});
matchMedia('(min-width: 1081px)').addEventListener('change',event=>{if(event.matches)closeMobileMenu();});
function navState(){$('#navbar').classList.toggle('is-scrolled',scrollY>16);}window.addEventListener('scroll',navState,{passive:true});navState();
const systemDark=matchMedia('(prefers-color-scheme: dark)');
function themeState(){const dark=document.documentElement.dataset.theme==='dark'||(!document.documentElement.dataset.theme&&systemDark.matches);$('#theme-toggle').classList.toggle('is-dark',dark);$('#theme-toggle').setAttribute('aria-label',dark?'切换浅色外观':'切换深色外观');$('#theme-toggle').title=dark?'切换浅色外观':'切换深色外观';}
function updateTheme(choice){if(choice==='system')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=choice;try{localStorage.setItem('varin-market-theme',choice);}catch{}themeState();}
$('#theme-toggle').addEventListener('click',()=>updateTheme($('#theme-toggle').classList.contains('is-dark')?'light':'dark'));
$('[data-theme-choice="system"]').addEventListener('click',()=>{updateTheme('system');toast('外观已跟随系统。');});systemDark.addEventListener('change',themeState);themeState();
for(const button of document.querySelectorAll('[data-info]'))button.addEventListener('click',()=>{for(const peer of document.querySelectorAll('[data-info]')){const active=peer===button;peer.classList.toggle('is-active',active);peer.setAttribute('aria-pressed',String(active));}$('#field-explanation').textContent=FIELD_INFO[button.dataset.info];});$('#field-explanation').textContent=FIELD_INFO.identity;
let template='surface';
function updateScaffold(){const result=scaffoldCommands({id:$('#scaffold-id').value,name:$('#scaffold-name').value,template});$('#scaffold-command').textContent=result.command||'';$('#copy-scaffold').disabled=Boolean(result.error);$('#scaffold-status').textContent=result.error||'只生成本地初始化命令，不安装、不发布。';$('#copy-scaffold').textContent='复制';}
for(const input of [$('#scaffold-id'),$('#scaffold-name')])input.addEventListener('input',updateScaffold);
for(const button of document.querySelectorAll('[data-template]'))button.addEventListener('click',()=>{template=button.dataset.template;for(const peer of document.querySelectorAll('[data-template]')){peer.classList.toggle('is-active',peer===button);peer.setAttribute('aria-pressed',String(peer===button));}updateScaffold();});
async function copyCode(button,target){try{await navigator.clipboard.writeText(target.textContent);button.textContent='已复制';}catch{button.textContent='请手动复制';const range=document.createRange();range.selectNodeContents(target);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);}}
$('#copy-scaffold').addEventListener('click',event=>copyCode(event.currentTarget,$('#scaffold-command')));$('#copy-checks').addEventListener('click',event=>copyCode(event.currentTarget,$('#check-commands')));updateScaffold();
const draftInput=$('#listing-input');
function checkDraft(){const result=inspectDraft(draftInput.value),output=$('#draft-result');output.replaceChildren();output.className=`draft-result ${result.errors.length?'invalid':'valid'}`;output.append(element('strong','',result.errors.length?`发现 ${result.errors.length} 项基础问题`:'基础结构通过 ✓'));if(result.errors.length){const list=element('ul');for(const error of result.errors)list.append(element('li','',error));output.append(list);}output.append(element('p','','此预检不验证发行是否存在、图标文件、SemVer 范围或包内契约，也不代表已收录或安全。请继续运行仓库校验与发行核验。'));}
$('#load-example').addEventListener('click',()=>{draftInput.value=JSON.stringify(EXAMPLE_LISTING,null,2);checkDraft();});$('#load-broken').addEventListener('click',()=>{draftInput.value=JSON.stringify({id:'Invalid_ID',displayName:'格式错误示例',source:{kind:'local',specifier:'./plugin'}},null,2);checkDraft();});$('#validate-draft').addEventListener('click',checkDraft);
draftInput.addEventListener('input',()=>{$('#draft-result').className='draft-result';$('#draft-result').replaceChildren(element('p','','资料已修改，请重新检查。'));});
$('#inspect-listing').addEventListener('click',()=>{if(!selected)return;draftInput.value=JSON.stringify(toListingDraft(selected),null,2);checkDraft();closeDetails();requestAnimationFrame(()=>{draftInput.focus({preventScroll:true});$('#authoring').scrollIntoView({behavior:motion(),block:'start'});});});
syncFilterControls();void load();mountScene($('.market-hero'));
