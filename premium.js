/* Presentation and deliberate research workflows. No inferred fact verification. */
const DESKKEY='investor-research-desk-ui-v4';
const presetLabels={priority:'优先阅读',focus:'只看关注',unread:'未读',ai:'AI基建',saved:'我的收藏',checked:'已核验出处',all:'全部材料'};
let desk={theme:'light',focus:false,goal:5,views:[],session:null,compare:[],commandIndex:0,persisted:true};
try{
  const saved=JSON.parse(localStorage.getItem(DESKKEY)||'null');
  if(saved){
    desk.theme=saved.theme==='dark'?'dark':'light';desk.focus=!!saved.focus;
    if([5,10,15].includes(saved.goal))desk.goal=saved.goal;
    desk.views=Array.isArray(saved.views)?saved.views.filter(v=>v&&typeof v.id==='string'&&typeof v.name==='string'&&v.filters&&typeof v.filters==='object').slice(0,12):[];
    if(saved.session&&Array.isArray(saved.session.ids)&&typeof saved.session.day==='string')desk.session={day:saved.session.day,ids:saved.session.ids.filter(id=>typeof id==='string'&&byId(id)),index:Math.max(0,Number(saved.session.index)||0)};
  }
}catch{}
function deskSave(){try{localStorage.setItem(DESKKEY,JSON.stringify({theme:desk.theme,focus:desk.focus,goal:desk.goal,views:desk.views,session:desk.session}));desk.persisted=true;return true}catch{desk.persisted=false;return false}}
function icon(name){
  const paths={home:'<path d="M3 10 12 3l9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',inbox:'<path d="M5 4h14l3 11v5H2v-5Z"/><path d="M2 15h6l2 3h4l2-3h6"/>',people:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',trend:'<path d="M3 19h18M4 15l6-6 4 4 7-9M15 4h6v6"/>',brief:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',source:'<path d="m9 15 6-6M8 17l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 7l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 -1) scale(.92)"/>',settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17h.01"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/>',moon:'<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',focus:'<path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',compare:'<rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/>',bookmark:'<path d="M6 3h12v18l-6-4-6 4Z"/>',radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 19 5"/><circle cx="12" cy="12" r="1"/>'};
  return `<svg viewBox="0 0 24 24" class="desk-icon" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.arrow}</svg>`;
}
function sessionInfo(){
  const s=desk.session;if(!s||s.day!==uiToday())return null;
  const ids=s.ids.filter(id=>byId(id)&&!uiExcluded(byId(id)));
  const done=ids.filter(id=>state.read.includes(id)).length;
  return{ids,done,total:ids.length,next:ids.find(id=>!state.read.includes(id))||ids[Math.min(s.index,ids.length-1)],complete:done===ids.length&&ids.length>0};
}
function beginSession(restart=false){
  if($('readerDialog').open&&readerNavigationBlocked())return toast('请先正式保存阅读笔记。');
  let info=sessionInfo();
  if(restart||!info||!info.ids.length||info.complete){
    const ids=groupRows(uiRows({prioritySort:true}).filter(x=>x.kind!=='draft'&&!state.read.includes(x.id))).slice(0,desk.goal).map(g=>g.item.id);
    if(!ids.length)return toast('当前范围没有未读材料，可以调整筛选。');
    desk.session={day:uiToday(),ids,index:0};deskSave();info=sessionInfo();
  }
  readerOpen(info.next,info.ids);
}
// Drafts are checkpoints, not formal assessments. Only block navigation on storage failure.
function checkpointReaderDraft(){
  const x=readerItem(),note=$('readerNote');if(!x||!note)return true;
  if(note.value===(assessment(x.id)?.interpretation||''))ux.drafts.delete(x.id);else ux.drafts.set(x.id,note.value);
  return uxSave();
}
function evidenceGaps(x){
  const a=assessment(x.id),gaps=[];
  if(!safeUrl(x.url))gaps.push('原始出处链接');
  if(!x.statementDate)gaps.push('本人表态日期');
  if(!['verified','source_checked'].includes(uiVerification(x)))gaps.push('出处与上下文核验');
  if(!a?.target)gaps.push('明确标的或指标');
  if(!a?.horizon)gaps.push('期限与适用条件');
  return gaps;
}
function focusedCard(group){
  const x=group.item,p=pBy(x.person),gaps=evidenceGaps(x);
  return `<article class="lead-card"><div class="lead-top"><span class="editorial-label">01 / 优先阅读</span>${statusPill(x)}</div><div class="lead-person">${esc(p?.name)} <span>${esc(p?.en||'')} · ${esc(materialDay(x)||'日期未知')}</span></div><h2><button data-reader="${esc(x.id)}">${esc(x.title)}</button></h2><p>${esc(shortSummary(x))}</p><div class="lead-bottom"><button class="primary" data-reader="${esc(x.id)}">打开阅读 ${icon('arrow')}</button><span>${esc(gaps.length?'待补齐 '+gaps.length+' 项研究字段':'主要研究字段已填写')}</span></div><div class="lead-rationale">${esc(priorityReasons(x).filter(r=>r!=='尚未阅读').slice(0,3).join(' · ')||'按材料日期排列')}<span>排序依据，不代表正确率</span></div></article>`;
}
homeMarkup=function(){
  const rows=uiRows({prioritySort:true}),publicRows=rows.filter(x=>x.kind!=='draft'),groups=groupRows(publicRows),unread=publicRows.filter(x=>!state.read.includes(x.id)),checked=publicRows.filter(x=>['verified','source_checked'].includes(uiVerification(x))),scope=new Set(state.people.filter(matchPerson).map(p=>p.id));
  const recent=publicRows.filter(x=>uiAgeDays(x)!==null&&uiAgeDays(x)>=0&&uiAgeDays(x)<7),due=state.scorecard.predictions.filter(p=>scope.has(p.person)&&p.dueDate<=uiToday()&&!['confirmed','unresolvable'].includes(lastSettlement(p.id)?.status));
  const first=groups.find(g=>!state.read.includes(g.item.id))||groups[0],remaining=groups.filter(g=>g!==first).slice(0,5),info=sessionInfo(),fraction=info?.total?info.done/info.total:0;
  const topics=topicRules.map(([topic])=>{const items=publicRows.filter(x=>suggestedTopics(x).includes(topic));return{topic,count:items.length,unread:items.filter(x=>!state.read.includes(x.id)).length,checked:items.filter(x=>['verified','source_checked'].includes(uiVerification(x))).length}}).filter(t=>t.count).sort((a,b)=>b.count-a.count).slice(0,3);
  const broken=state.sources.filter(s=>scope.has(s.person)&&s.enabled&&state.sourceStatuses[s.id]?.ok===false).length;
  return `<div class="desk-heading"><div><div class="editorial-label">${esc(uiToday())} <span>·</span> RESEARCH DESK</div><h1>${selected==='all'?'研究，从清晰的信号开始。':esc(pBy(selected)?.name)+'的研究视野。'}</h1><p>${unread.length?'从 '+unread.length+' 条未读线索中，先处理与你相关的材料。':'当前范围已读完，继续核验或沉淀你的判断。'}</p></div><button class="quiet" data-view="brief">今日简报 ${icon('arrow')}</button></div>
  <div class="desk-overview"><div><span>覆盖人物</span><b>${scope.size}<small>位</small></b></div><button data-view="timeline" data-search-days="7"><span>近7天发布</span><b>${recent.length}<small>条</small></b></button><button data-preset="checked"><span>出处有核验记录</span><b>${checked.length}<small>/ ${publicRows.length}</small></b></button><button data-view="predictions"><span>到期复盘</span><b>${due.length}<small>条</small></b></button></div>
  <div class="desk-hero">${first?focusedCard(first):emptyState('当前没有匹配材料','调整筛选，或更新关注人物的公开来源。')}<section class="session-card"><div class="session-top"><span class="editorial-label">一轮专注阅读</span>${icon('focus')}</div><div class="session-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="ring-track"/><circle cx="60" cy="60" r="52" class="ring-value" stroke-dasharray="${(fraction*326.73).toFixed(2)} 326.73"/></svg><div><strong>${info?info.done:'—'}<small> / ${info?info.total:desk.goal}</small></strong><span>${info?.complete?'本轮已读完':info?'本轮已标记已读':'先读一小组'}</span></div></div><p>${info?.complete?'阅读完成。你的笔记与核验记录仍可继续补齐。':info?(desk.persisted?'阅读队列已保留，可以随时继续。':'队列暂未保存，请检查浏览器存储空间。'):'按当前范围与优先级生成队列，减轻信息负担。'}</p><button class="primary session-start" data-session="continue">${info&&!info.complete?'继续这轮阅读':'开始一轮阅读'} ${icon('arrow')}</button><div class="session-options"><label>每轮 <select id="sessionGoal" aria-label="每轮阅读条数">${[5,10,15].map(n=>`<option value="${n}" ${desk.goal===n?'selected':''}>${n}条</option>`).join('')}</select></label>${info?'<button data-session="new">按当前筛选重新开始</button>':'<span>仅标记已读才计入进度</span>'}</div></section></div>
  ${topics.length?`<section class="research-lenses" aria-label="研究主题">${topics.map((t,i)=>`<button data-topic-search="${esc(t.topic)}"><div><span class="lens-symbol">0${i+1}</span><strong>${esc(t.topic)}</strong>${icon('arrow')}</div><p>${t.count} 条线索<span>${t.unread} 未读 · ${t.checked} 有核验记录</span></p><div class="lens-track"><i style="width:${Math.round(t.count/publicRows.length*100)}%"></i></div></button>`).join('')}</section><p class="lens-caption">主题依据标题与摘要关键词识别；可交叉计数。</p>`:''}
  <div class="desk-lower"><section><div class="section-top"><div><h2>接下来，值得你看</h2><p class="small">优先阅读 · ${groups.length} 组材料</p></div><button class="quiet" data-view="timeline">完整收件箱 ${icon('arrow')}</button></div><div class="reading-list">${remaining.map(readingRow).join('')||'<div class="subtle-empty">当前范围没有更多材料。</div>'}</div>${rows.some(x=>x.kind==='draft')?`<div class="archive-note">${rows.filter(x=>x.kind==='draft').length} 条原稿备忘已保留<button data-originals="true">查看原稿 →</button></div>`:''}</section><aside class="desk-context"><section class="context-note"><span class="editorial-label">研究提示</span><h3>${checked.length<publicRows.length?'先核对，再形成判断。':'把判断写成可复盘的条件。'}</h3><p>${publicRows.length-checked.length} 条材料尚无出处核验记录。来源摘要可帮助发现线索，原文中的人物、时间与条件仍需核对。</p><button data-view="review">进入核验队列 ${icon('arrow')}</button></section><section class="context-health"><h3>来源状态</h3><p>${broken?'已记录 '+broken+' 个启用来源检查失败':'当前未记录启用来源失败'}</p><p class="small">最近成功：${esc($('lastUpdate').textContent)}。此时间不代表所有来源都已更新。</p><button data-view="sources">检查来源 →</button></section></aside></div>`;
};
const deskReadingRow=readingRow;
readingRow=function(group){return deskReadingRow(group).replace('<div class="reading-actions">',`<div class="reading-actions"><button class="compare-pick ${desk.compare.includes(group.item.id)?'picked':''}" data-compare-pick="${esc(group.item.id)}" aria-pressed="${desk.compare.includes(group.item.id)}" title="材料并排对照" aria-label="${desk.compare.includes(group.item.id)?'取消对照选择':'加入对照'}">${icon('compare')}</button>`)};
function filterSnapshot(){return{query:$('search').value,selected,favOnly,preset:ux.preset,sort:ux.sort,groupFilter:$('groupFilter').value,ageFilter:$('ageFilter').value,marketFilter:$('marketFilter').value,domainFilter:$('domainFilter').value,period:$('period').value,kindFilter:$('kindFilter').value,versionFilter:$('versionFilter').value}}
function restoreView(id){
  const entry=desk.views.find(v=>v.id===id);if(!entry)return false;
  resetUxFilters();const f=entry.filters;
  selected=f.selected==='all'||pBy(f.selected)?f.selected:'all';favOnly=!!f.favOnly;
  ux.preset=Object.hasOwn(presetLabels,f.preset)?f.preset:'all';ux.sort=f.sort==='date'?'date':'priority';
  $('search').value=String(f.query||'').slice(0,500);
  for(const key of ['groupFilter','ageFilter','marketFilter','domainFilter','period','kindFilter','versionFilter']){
    const el=$(key),value=String(f[key]||'all');el.value=value;if(!el.value)el.value=key==='versionFilter'?'latest':'all';
  }
  $('inboxSort').value=ux.sort;uxSave();setView('timeline');return true;
}
function saveNamedView(name){
  name=String(name||'').trim().slice(0,40);if(!name)return false;
  if(desk.views.length>=12){toast('最多保留12个视图，请先删除一个。');return false}
  const entry={id:uid('view'),name,filters:filterSnapshot()};desk.views.push(entry);
  if(!deskSave()){desk.views.pop();toast('视图保存失败，请检查浏览器存储空间。');return false}
  renderDeskChrome();return entry;
}
function renderSavedViews(){
  $('savedViews').innerHTML=desk.views.map(v=>`<button data-saved-view="${esc(v.id)}" title="应用已保存的筛选条件">${icon('bookmark')}${esc(v.name)}</button>`).join('');
  $('savedViewList').innerHTML=desk.views.map(v=>`<div class="saved-view-item"><button data-saved-view="${esc(v.id)}">${esc(v.name)}<small>${esc(presetLabels[v.filters.preset]||'全部材料')} · ${esc(v.filters.query||'无关键词')}</small></button><button data-delete-view="${esc(v.id)}" aria-label="删除视图 ${esc(v.name)}">删除</button></div>`).join('')||'<p class="small">把常用的人物、主题和日期组合保存下来，下次一键恢复。</p>';
}
function activeFilterChips(){
  const chips=[];if(selected!=='all')chips.push(['person',pBy(selected)?.name||'人物']);
  if(favOnly)chips.push(['favorite','仅关注人物']);
  for(const key of ['groupFilter','ageFilter','marketFilter','domainFilter'])if($(key).value!=='all')chips.push([key,$(key).selectedOptions?.[0]?.textContent||$(key).value]);
  if(view==='timeline')for(const key of ['period','kindFilter','versionFilter'])if($(key).value!==(key==='versionFilter'?'latest':'all'))chips.push([key,$(key).selectedOptions?.[0]?.textContent||$(key).value]);
  if($('search').value.trim())chips.push(['query','搜索：'+$('search').value.trim().slice(0,65)]);
  return chips;
}
function clearFilter(key){
  if(key==='person')selected='all';else if(key==='favorite')favOnly=false;else if(key==='query')$('search').value='';else if($(key))$(key).value=key==='versionFilter'?'latest':'all';
  limit=30;render();
}
function renderDeskChrome(){
  desk.compare=desk.compare.filter(id=>byId(id));
  renderSavedViews();const chips=activeFilterChips();$('activeFilters').hidden=!chips.length;
  $('activeFilters').innerHTML=chips.map(([key,label])=>`<button data-clear-filter="${key}" aria-label="移除筛选：${esc(label)}">${esc(label)} <span>×</span></button>`).join('');
  $('compareBar').hidden=!desk.compare.length;$('compareCount').textContent='已选择 '+desk.compare.length+' / 2 条材料';$('openComparison').disabled=desk.compare.length!==2;
  $('readerFocus').innerHTML=icon('focus');$('readerFocus').setAttribute('aria-pressed',desk.focus);$('readerFocus').title=desk.focus?'退出专注阅读 F':'专注阅读 F';$('readerDialog').classList.toggle('reader-focused',desk.focus);
  $('themeToggle').innerHTML=icon(desk.theme==='light'?'moon':'sun');$('themeToggle').setAttribute('aria-label',desk.theme==='light'?'切换深色界面':'切换浅色界面');
  document.documentElement.dataset.theme=desk.theme;
  if($('sessionGoal')){$('sessionGoal').value=desk.goal;$('sessionGoal').onchange=()=>{desk.goal=Number($('sessionGoal').value);deskSave()}}
}
const previousChrome=renderUxChrome;
renderUxChrome=function(){previousChrome();renderDeskChrome()};
// The same query semantics apply to latest records, full history and review queues.
filteredRecords=function(){return uiRows({applyContentFilters:true,allVersions:$('versionFilter').value==='all',includeExcluded:true})};
reviewRows=function(){
  const mode=$('reviewStatus').value;
  return uiRows({includeExcluded:true}).filter(x=>(!$('reviewFav').checked||state.favorites.includes(x.person))&&(mode==='excluded'?['irrelevant','duplicate'].includes(latestTriage(x.id)?.status):mode==='followup'?needsReview(x)&&latestTriage(x.id)?.status==='followup':needsReview(x))).sort((a,b)=>reviewPriority(b)-reviewPriority(a)||timelineTime(b)-timelineTime(a));
};
function comparePick(id){
  if(!byId(id))return false;
  if(desk.compare.includes(id))desk.compare=desk.compare.filter(x=>x!==id);
  else{if(desk.compare.length>=2){toast('已选两条。请先取消一条，再选择新材料。');return false}desk.compare.push(id)}
  render();return true;
}
function comparisonMarkup(){
  const items=desk.compare.map(byId).filter(Boolean);if(items.length!==2)return '';
  const fields=[['人物',x=>pBy(x.person)?.name],['来源发布',x=>materialDay(x)||'未知'],['本人表态',x=>x.statementDate||'未知'],['出处状态',x=>statusNames[uiVerification(x)]||'待核验'],['研究主题',x=>assessment(x.id)?.topic||'未填写'],['标的／指标',x=>assessment(x.id)?.target||'未填写'],['期限／条件',x=>assessment(x.id)?.horizon||'未填写'],['我的立场',x=>({agree:'认同',uncertain:'存疑',disagree:'反对'}[assessment(x.id)?.personal]||'未判断')]];
  const differences=fields.filter(([,get])=>get(items[0])!==get(items[1])).length;
  return `<p class="comparison-note">${differences} 项已记录字段不同。差异高亮仅比较字段值，不自动判断作者观点冲突。</p><div class="comparison-heads">${items.map(x=>`<article><div class="editorial-label">${esc(pBy(x.person)?.name)}</div><h3>${esc(x.title)}</h3>${link(x.url,'打开原始出处 ↗')}</article>`).join('')}</div><div class="table-wrap"><table class="table comparison-table"><thead><tr><th>比较维度</th>${items.map(x=>`<th>${esc(pBy(x.person)?.name)}</th>`).join('')}</tr></thead><tbody>${fields.map(([label,get])=>`<tr class="${get(items[0])!==get(items[1])?'field-difference':''}"><th scope="row">${esc(label)}</th>${items.map(x=>`<td>${esc(get(x))}</td>`).join('')}</tr>`).join('')}<tr><th scope="row">来源摘要</th>${items.map(x=>`<td class="compare-summary">${esc(x.summary||'无摘要')}</td>`).join('')}</tr><tr><th scope="row">我的笔记</th>${items.map(x=>`<td>${esc(assessment(x.id)?.interpretation||'尚无正式保存笔记')}</td>`).join('')}</tr></tbody></table></div>`;
}
function openComparison(){if(desk.compare.length!==2)return;$('comparisonBody').innerHTML=comparisonMarkup();$('comparisonDialog').showModal()}
const originalDeskReader=renderReader;
renderReader=function(){
  originalDeskReader();const x=readerItem();if(!x)return;
  $('readerDraftStatus').textContent=ux.drafts.has(x.id)?'已恢复草稿 · 可安心切换，正式保存后归档':'草稿自动保留 · 可安心切换，正式保存后归档';
  const gaps=evidenceGaps(x),related=(uiIndex().perPerson.get(x.person)||[]).filter(y=>y.id!==x.id&&y.kind!=='draft'&&!uiExcluded(y)).sort((a,b)=>timelineTime(b)-timelineTime(a)).slice(0,3);
  $('readerBody').insertAdjacentHTML('beforeend',`<aside class="reader-context"><div class="editorial-label">研究导航</div><h3>下一步补齐什么</h3><ul>${gaps.map(g=>`<li>${esc(g)}</li>`).join('')||'<li>主要字段已有记录，继续检查证据与适用条件。</li>'}</ul><button data-context-analyze="true">进入深入评估 ${icon('arrow')}</button><section><h3>同一人物的其他材料</h3>${related.map(y=>`<button data-reader="${esc(y.id)}"><small>${esc(materialDay(y)||'日期未知')}</small>${esc(y.title)}</button>`).join('')||'<p class="small">暂无其他公开材料。</p>'}</section><p class="context-footnote">材料按日期列出，不推断立场变化。核验状态由人工记录决定。</p></aside>`);
  const info=sessionInfo();$('readerSession').hidden=!info||!info.ids.includes(x.id);$('readerSession').textContent=info?`本轮 ${info.done}/${info.total} 已读`:'';
  if(desk.session?.ids.includes(x.id)){desk.session.index=desk.session.ids.indexOf(x.id);deskSave()}
  renderDeskChrome();
};
const originalCommands=commandItems;
commandItems=function(query=''){
  const extra=[{label:'开始或继续专注阅读',detail:'按当前筛选生成小组阅读队列',kind:'session',value:''},{label:'保存当前研究视图',detail:'下次一键恢复筛选组合',kind:'saveview',value:''},{label:'切换深色／浅色界面',detail:'记住你的显示偏好',kind:'theme',value:''},...desk.views.map(v=>({label:v.name,detail:'已保存的研究视图',kind:'savedview',value:v.id}))];
  const needle=query.trim().toLowerCase();return[...extra.filter(x=>(x.label+' '+x.detail).toLowerCase().includes(needle)),...originalCommands(query)].slice(0,20);
};
renderCommands=function(){
  const rows=commandItems($('commandSearch').value);desk.commandIndex=Math.min(Math.max(0,desk.commandIndex),Math.max(0,rows.length-1));
  $('commandSearch').setAttribute('aria-activedescendant',rows.length?'command-option-'+desk.commandIndex:'');
  $('commandList').innerHTML=rows.map((x,i)=>`<button id="command-option-${i}" role="option" aria-selected="${i===desk.commandIndex}" class="${i===desk.commandIndex?'command-selected':''}" data-command="${x.kind}" data-command-value="${esc(x.value)}"><span>${esc(x.label)}<small>${esc(x.detail)}</small></span>${i===desk.commandIndex?'<kbd>Enter ↵</kbd>':icon('arrow')}</button>`).join('')||'<p class="empty">没有匹配结果，试试人物中文名或英文名。</p>';
  $('command-option-'+desk.commandIndex)?.scrollIntoView({block:'nearest'});
};
const originalExecute=executeCommand;
executeCommand=function(kind,value){
  $('commandDialog').close();
  if(kind==='session')return beginSession();
  if(kind==='saveview')return openSaveView();
  if(kind==='theme')return toggleTheme();
  if(kind==='savedview')return restoreView(value);
  return originalExecute(kind,value);
};
openCommands=function(){
  if($('readerDialog').open){toast('请先关闭阅读面板，再打开快捷操作。');return}
  desk.commandIndex=0;$('commandSearch').value='';renderCommands();$('commandDialog').showModal();$('commandSearch').focus();
};
$('commandSearch').oninput=()=>{desk.commandIndex=0;renderCommands()};
$('commandSearch').onkeydown=e=>{
  const rows=commandItems($('commandSearch').value);
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();if(e.key==='Home')desk.commandIndex=0;else if(e.key==='End')desk.commandIndex=rows.length-1;else desk.commandIndex=(desk.commandIndex+(e.key==='ArrowDown'?1:-1)+Math.max(1,rows.length))%Math.max(1,rows.length);renderCommands()}
  if(e.key==='Enter'){e.preventDefault();const entry=rows[desk.commandIndex];if(entry)executeCommand(entry.kind,entry.value)}
};
function openSaveView(){$('viewName').value='';renderSavedViews();$('saveViewDialog').showModal();$('viewName').focus()}
function toggleTheme(){desk.theme=desk.theme==='light'?'dark':'light';deskSave();renderDeskChrome()}
function toggleFocus(){desk.focus=!desk.focus;deskSave();renderDeskChrome()}
$('themeToggle').onclick=toggleTheme;$('readerFocus').onclick=toggleFocus;$('saveCurrentView').onclick=openSaveView;
$('saveViewForm').onsubmit=e=>{e.preventDefault();if(saveNamedView($('viewName').value)){$('saveViewDialog').close();toast('研究视图已保存。')}};
$('openComparison').onclick=openComparison;$('clearComparison').onclick=()=>{desk.compare=[];render()};
document.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;const d=button.dataset;
  if(d.session)beginSession(d.session==='new');
  if(d.savedView){$('saveViewDialog').close();restoreView(d.savedView)}
  if(d.deleteView){const previous=desk.views;desk.views=desk.views.filter(v=>v.id!==d.deleteView);if(!deskSave()){desk.views=previous;toast('视图删除未能保存，请检查浏览器存储空间。')}renderSavedViews()}
  if(d.clearFilter)clearFilter(d.clearFilter);
  if(d.comparePick)comparePick(d.comparePick);
  if(d.contextAnalyze)processReader();
});
document.addEventListener('keydown',e=>{
  if(e.target?.matches('input,textarea,select,[contenteditable="true"]'))return;
  if(!$('readerDialog').open||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key.toLowerCase()==='f'){e.preventDefault();toggleFocus()}
  if(e.key.toLowerCase()==='s'){e.preventDefault();toggleReaderFlag('saved')}
  if(e.key.toLowerCase()==='r'){e.preventDefault();toggleReaderFlag('read')}
});
const previousDeskView=setView;
setView=function(value){const changed=view!==value;previousDeskView(value);if(changed)scrollTo({top:0,behavior:'auto'})};
const navIcons={home:'home',timeline:'inbox',board:'people',review:'check',predictions:'trend',brief:'brief',sources:'source',settings:'settings',methods:'help'};
document.querySelectorAll('.app-rail .nav [data-view]').forEach(b=>{const span=b.querySelector('span');if(span)span.innerHTML=icon(navIcons[b.dataset.view])});
const brandMark=document.querySelector('.brand-symbol');if(brandMark)brandMark.innerHTML=icon('radar');
$('openCommands').onclick=openCommands;
render();
