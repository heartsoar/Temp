/* 5.0 desk refinements: calmer chrome, faster list and review handling. Every rule stays local and visible; nothing here verifies facts on its own. */
const REFINEKEY='investor-research-desk-ui-v5';
const LONG_GAP=30*60000;
let refine={inboxDensity:'cards',autoNext:false,sourceFilter:'all',boardSort:'focus',cursor:null,selection:new Set(),since:null,triage:null,flashUntil:0,wasBusy:false,scrollY:0};
try{
  const saved=JSON.parse(localStorage.getItem(REFINEKEY)||'null');
  if(saved){
    if(['cards','list'].includes(saved.inboxDensity))refine.inboxDensity=saved.inboxDensity;
    refine.autoNext=!!saved.autoNext;
    if(['focus','recent','unread','name'].includes(saved.boardSort))refine.boardSort=saved.boardSort;
    const last=Date.parse(saved.lastSeen||''),since=Date.parse(saved.since||'');
    // A new visit starts after a long gap; reloads within a session keep the same baseline.
    if(Number.isFinite(last)&&Date.now()-last>LONG_GAP)refine.since=new Date(last).toISOString();
    else if(Number.isFinite(since))refine.since=new Date(since).toISOString();
  }
}catch{}
function refineSave(){try{localStorage.setItem(REFINEKEY,JSON.stringify({inboxDensity:refine.inboxDensity,autoNext:refine.autoNext,boardSort:refine.boardSort,since:refine.since,lastSeen:now()}));return true}catch{return false}}
refineSave();

const deskIcon=icon;
icon=function(name){
  const extra={more:'<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',external:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',star:'<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',starFilled:'<path fill="currentColor" d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',sync:'<path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5M20 20v-4h-4"/>',filter:'<path d="M4 5h16l-6 7v6l-4 2v-8Z"/>',list:'<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'};
  if(!extra[name])return deskIcon(name);
  return `<svg viewBox="0 0 24 24" class="desk-icon" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${extra[name]}</svg>`;
};

// Aggregator titles end with " - Media"; the media name is shown separately.
function cleanTitle(x){
  const title=String(x?.title||'').trim(),source=String(x?.source||'').trim();
  if(source&&title.length>source.length+3&&title.endsWith(' - '+source))return title.slice(0,-(source.length+3)).trim();
  return title;
}
function normText(s){return String(s||'').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'')}
// Returns '' when the source summary only repeats the headline, so lists do not show the same line twice.
function displaySummary(x){
  let text=String(x?.summary||'').replace(/^(公开报道摘要：|订阅摘要：)/,'').trim();
  const source=String(x?.source||'').trim();
  if(source&&text.endsWith(source))text=text.slice(0,-source.length).trim();
  const a=normText(text),b=normText(cleanTitle(x));
  if(!a||a===b||b.startsWith(a)||(a.startsWith(b)&&a.length-b.length<12))return '';
  return text;
}
function shortDay(d){return d?d.slice(5).replace('-','/'):'日期待核验'}
function isChecked(x){return ['verified','source_checked'].includes(uiVerification(x))}

/* ---------- Lists: cards, one-line rows, cursor and selection ---------- */
function rowActions(x){
  const saved=state.saved.includes(x.id),picked=desk.compare.includes(x.id),url=safeUrl(x.url);
  return `<div class="reading-actions"><button class="compare-pick ${picked?'picked':''}" data-compare-pick="${esc(x.id)}" aria-pressed="${picked}" title="${picked?'取消对照选择':'加入并排对照（最多两条）'}" aria-label="${picked?'取消对照选择':'加入对照'}">${icon('compare')}</button><button data-save="${esc(x.id)}" class="${saved?'is-on':''}" title="${saved?'取消收藏':'收藏'} S" aria-label="${saved?'取消收藏':'收藏'}">${icon(saved?'starFilled':'star')}</button>${url?`<a class="icon-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="打开原文" aria-label="打开原文">${icon('external')}</a>`:''}</div>`;
}
function rowCheck(x){const on=refine.selection.has(x.id);return `<label class="row-check" title="勾选以批量处理 X"><input type="checkbox" data-select="${esc(x.id)}" ${on?'checked':''} aria-label="勾选：${esc(cleanTitle(x))}"></label>`}
readingRow=function(group){
  const x=group.item,p=pBy(x.person),read=state.read.includes(x.id),summary=displaySummary(x),topics=suggestedTopics(x),reasons=priorityReasons(x).filter(r=>r!=='尚未阅读');
  return `<article class="reading-row ${read?'is-read':'is-unread'} ${refine.selection.has(x.id)?'is-selected':''} ${refine.cursor===x.id?'is-cursor':''}" data-row="${esc(x.id)}">${rowCheck(x)}<div class="reading-avatar ${state.favorites.includes(x.person)?'focused':''}" aria-hidden="true">${esc((p?.name||'?').slice(0,1))}</div><div class="reading-main"><div class="reading-meta"><span class="unread-dot" title="${read?'已读':'未读'}"></span><button class="person-link" data-person="${esc(x.person)}" title="只看${esc(p?.name)}">${esc(p?.name)}</button><span>${esc(materialDay(x)||'日期待核验')}</span>${statusPill(x)}${topics.slice(0,1).map(t=>`<span class="topic-tag">${esc(t)}</span>`).join('')}${group.ids.length>1?`<span class="topic-tag">合并${group.ids.length}条</span>`:''}</div><button class="reading-title" data-reader="${esc(x.id)}">${esc(cleanTitle(x))}</button>${summary?`<p>${esc(summary.slice(0,240))}</p>`:''}<div class="reading-source"><span>${esc(x.source||'未知出处')}</span>${reasons.length?`<span class="why" title="排序依据：${esc(reasons.join(' · '))}。不代表正确率。">${esc(reasons[0])}${reasons.length>1?' 等'+reasons.length+'项':''}</span>`:''}</div></div>${rowActions(x)}</article>`;
};
function listRow(group){
  const x=group.item,p=pBy(x.person),read=state.read.includes(x.id);
  return `<article class="list-row ${read?'is-read':'is-unread'} ${refine.selection.has(x.id)?'is-selected':''} ${refine.cursor===x.id?'is-cursor':''}" data-row="${esc(x.id)}">${rowCheck(x)}<span class="unread-dot" title="${read?'已读':'未读'}"></span><button class="list-person" data-person="${esc(x.person)}" title="只看${esc(p?.name)}">${esc(p?.name)}</button><button class="list-title" data-reader="${esc(x.id)}" title="${esc(cleanTitle(x))}">${esc(cleanTitle(x))}${group.ids.length>1?`<small> · 合并${group.ids.length}条</small>`:''}</button>${statusPill(x)}<span class="list-source" title="${esc(x.source)}">${esc(x.source||'')}</span><time>${esc(shortDay(materialDay(x)))}</time>${rowActions(x)}</article>`;
}
renderTimeline=function(){
  if($('versionFilter').value==='all'){legacyTimeline();$('inboxCount').textContent='正在查看全部历史版本；点击标题旁操作查看详情。';return}
  const rows=uiRows({applyContentFilters:true}),groups=groupRows(rows),list=refine.inboxDensity==='list';
  $('timelineTitle').textContent=selected==='all'?'观点收件箱':pBy(selected)?.name+' · 收件箱';$('refreshSelected').hidden=selected==='all';
  const unread=groups.filter(g=>!state.read.includes(g.item.id)).length;
  $('inboxCount').textContent=`${groups.length}组材料 · ${unread}组未读 · 已显示${Math.min(limit,groups.length)}组`;
  $('feed').classList.toggle('feed-list',list);
  $('feed').innerHTML=groups.slice(0,limit).map(list?listRow:readingRow).join('')||emptyState('没有符合条件的材料','日期未知的原稿不会进入最近几天筛选；可清除筛选重试。');
  $('more').hidden=groups.length<=limit;
};
function visibleRowIds(){
  const box=view==='timeline'?'#feed':view==='home'?'#homeContent':view==='review'?'#reviewList':null;
  if(!box||typeof document.querySelectorAll!=='function')return [];
  return [...document.querySelectorAll(box+' [data-row]')].map(n=>n.dataset.row);
}
function paintCursor(scroll=true){
  if(typeof document.querySelectorAll!=='function')return;
  document.querySelectorAll('[data-row]').forEach(n=>{const on=n.dataset.row===refine.cursor;n.classList.toggle('is-cursor',on);if(on&&scroll&&n.scrollIntoView)n.scrollIntoView({block:'nearest'})});
}
function moveCursor(delta){
  const ids=visibleRowIds();if(!ids.length)return;
  const at=ids.indexOf(refine.cursor);
  refine.cursor=ids[at<0?(delta>0?0:ids.length-1):Math.max(0,Math.min(ids.length-1,at+delta))];
  paintCursor();
}
function toggleFlag(key,ids,on){
  const before=new Set(state[key]),changed=ids.filter(id=>on?!before.has(id):before.has(id));
  if(!changed.length)return 0;
  state[key]=on?[...new Set([...state[key],...changed])]:state[key].filter(id=>!changed.includes(id));
  persist();render();
  const n=changed.length,message=key==='read'?(on?`已将 ${n} 条标为已读`:`已将 ${n} 条设为未读`):(on?`已收藏 ${n} 条`:`已取消收藏 ${n} 条`);
  offerUndo(message,()=>{state[key]=on?state[key].filter(id=>!changed.includes(id)):[...new Set([...state[key],...changed])];persist();render()});
  return changed.length;
}
function groupIdsFor(id){const g=groupRows(uiRows({applyContentFilters:view==='timeline',includeExcluded:true})).find(g=>g.ids.includes(id));return g?g.ids:[id]}
function cursorToggle(key){
  const id=refine.cursor;if(!id||!byId(id))return;
  toggleFlag(key,key==='read'?groupIdsFor(id):[id],!state[key].includes(id));
}
function setSelection(id,on){if(on)refine.selection.add(id);else refine.selection.delete(id);renderBulk()}
function renderBulk(){
  for(const id of [...refine.selection])if(!byId(id))refine.selection.delete(id);
  const n=refine.selection.size;$('bulkBar').hidden=!n;$('bulkCount').textContent=`已选 ${n} 条`;
  const compare=$('bulkBar').querySelector?.('[data-bulk="compare"]');if(compare){compare.disabled=n>2;compare.title=n>2?'并排对照最多两条':'并排对照所选材料'}
  if(typeof document.querySelectorAll==='function')document.querySelectorAll('[data-row]').forEach(r=>r.classList.toggle('is-selected',refine.selection.has(r.dataset.row)));
}
function bulkAction(kind){
  const ids=[...refine.selection];if(!ids.length)return;
  if(kind==='clear'){refine.selection.clear();renderBulk();if(typeof document.querySelectorAll==='function')document.querySelectorAll('[data-select]').forEach(i=>i.checked=false);return}
  if(kind==='compare'){if(ids.length>2)return toast('并排对照最多两条。');desk.compare=ids.slice(0,2);refine.selection.clear();render();if(desk.compare.length===2)openComparison();return}
  const all=ids.flatMap(id=>kind==='save'?[id]:groupIdsFor(id));
  toggleFlag(kind==='save'?'saved':'read',[...new Set(all)],kind!=='unread');
  refine.selection.clear();renderBulk();
}

/* ---------- Home ---------- */
function weekdayName(day){return '周'+'日一二三四五六'[new Date(day+'T12:00:00+08:00').getUTCDay()]}
function sinceRows(rows){
  if(!refine.since)return null;const t=Date.parse(refine.since);
  return rows.filter(x=>Date.parse(x.recordedAt||'')>t);
}
function watchCard(p,publicRows,fresh){
  const rows=publicRows.filter(x=>x.person===p.id),unread=rows.filter(x=>!state.read.includes(x.id)).length,latest=[...rows].sort((a,b)=>timelineTime(b)-timelineTime(a))[0],added=fresh?fresh.filter(x=>x.person===p.id).length:null;
  return `<button class="watch-card" data-person-inbox="${esc(p.id)}" title="打开${esc(p.name)}的收件箱"><span class="watch-top"><span class="profile-symbol" aria-hidden="true">${esc(p.name.slice(0,1))}</span><span class="watch-name"><b>${esc(p.name)}</b><small>${esc(p.en)}</small></span>${added?`<span class="new-badge">+${added} 新</span>`:''}</span><span class="watch-latest">${esc(latest?cleanTitle(latest):'暂无公开材料')}</span><span class="watch-foot"><span>${latest?esc(shortDay(materialDay(latest))):''}</span><span>${unread?unread+' 未读':'已读完'}</span></span></button>`;
}
homeMarkup=function(){
  const rows=uiRows({prioritySort:true}),publicRows=rows.filter(x=>x.kind!=='draft'),groups=groupRows(publicRows),unread=publicRows.filter(x=>!state.read.includes(x.id)),scope=new Set(state.people.filter(matchPerson).map(p=>p.id));
  const recent=publicRows.filter(x=>uiAgeDays(x)!==null&&uiAgeDays(x)>=0&&uiAgeDays(x)<7),due=state.scorecard.predictions.filter(p=>scope.has(p.person)&&p.dueDate<=uiToday()&&!['confirmed','unresolvable'].includes(lastSettlement(p.id)?.status));
  const focusReview=rows.filter(x=>needsReview(x)&&state.favorites.includes(x.person)).length,fresh=sinceRows(publicRows),info=sessionInfo(),day=uiToday();
  const watched=state.people.filter(p=>state.favorites.includes(p.id)&&scope.has(p.id));
  const topics=topicRules.map(([topic])=>({topic,count:publicRows.filter(x=>suggestedTopics(x).includes(topic)).length})).filter(t=>t.count).sort((a,b)=>b.count-a.count);
  const failing=state.sources.filter(s=>scope.has(s.person)&&s.enabled&&s.type!=='manual'&&state.sourceStatuses[s.id]?.ok===false).length;
  const headline=selected!=='all'?esc(pBy(selected)?.name)+' · 研究视野':fresh&&fresh.length?`自上次打开，新增 ${fresh.length} 条材料`:unread.length?`今天从 ${unread.length} 条未读开始`:'当前范围已读完';
  const sub=selected!=='all'?`${unread.length} 条未读 · ${publicRows.length} 条材料`:fresh?(fresh.length?`上次打开于 ${esc(fmt(refine.since))}。关注人物的新材料排在前面。`:`上次打开于 ${esc(fmt(refine.since))}，之后没有新收录；可以继续未读或核验。`):`近7天发布 ${recent.length} 条。先看关注人物，再核对出处、留下判断。`;
  const progress=info?.total?Math.round(info.done/info.total*100):0;
  return `<div class="home-head"><div><div class="editorial-label">${esc(day)} · ${weekdayName(day)} · 研究工作台</div><h1>${headline}</h1><p>${sub}</p></div><div class="home-actions"><button class="primary" data-session="continue">${info&&!info.complete?`继续阅读 ${info.done}/${info.total}`:'开始一轮阅读'} ${icon('arrow')}</button><button data-view="brief">今日简报</button></div></div>
  <div class="kpi-strip" role="list"><button role="listitem" data-view="timeline" data-preset="unread"><span>未读</span><b>${unread.length}</b></button><button role="listitem" data-start-triage="focus"><span>关注人物待核验</span><b>${focusReview}</b></button><button role="listitem" data-view="timeline" data-search-days="7"><span>近7天发布</span><b>${recent.length}</b></button><button role="listitem" data-view="predictions"><span>到期复盘</span><b>${due.length}</b></button><button role="listitem" data-open-sync="true" class="${failing?'is-warn':''}"><span>来源状态</span><b>${failing?failing+' 异常':'正常'}</b></button></div>
  ${selected==='all'?`<section class="watch-section"><div class="section-top"><div><h2>关注人物动态</h2><p class="small">${fresh?'“新”指上次打开后收录的材料':'按最新材料排列'} · 点击查看该人物收件箱</p></div><button class="quiet" data-view="board">管理关注 ${icon('arrow')}</button></div>${watched.length?`<div class="watch-grid">${watched.sort((a,b)=>{const la=publicRows.filter(x=>x.person===a.id).reduce((m,x)=>Math.max(m,timelineTime(x)),0),lb=publicRows.filter(x=>x.person===b.id).reduce((m,x)=>Math.max(m,timelineTime(x)),0);return lb-la}).map(p=>watchCard(p,publicRows,fresh)).join('')}</div>`:'<div class="subtle-empty">还没有关注人物。在人物研究中点击☆，这里会显示他们的最新动态。<button data-view="board">去关注人物 →</button></div>'}</section>`:''}
  <div class="home-split"><section><div class="section-top"><div><h2>优先阅读</h2><p class="small">按关注、未读、出处记录与时效排序 · 排序不代表正确率</p></div><button class="quiet" data-view="timeline">完整收件箱 · ${groups.length}组 ${icon('arrow')}</button></div><div class="reading-list">${groups.slice(0,8).map(readingRow).join('')||emptyState('当前没有匹配材料','调整筛选，或更新关注人物的公开来源。')}</div>${rows.some(x=>x.kind==='draft')?`<div class="archive-note">${rows.filter(x=>x.kind==='draft').length} 条原稿备忘已保留<button data-originals="true">查看原稿 →</button></div>`:''}</section>
  <aside class="home-side"><section class="side-card session-mini"><div class="editorial-label">专注阅读</div><h3>${info?.complete?'本轮已读完':info?`本轮已读 ${info.done} / ${info.total}`:'一次读一小组'}</h3><div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}" aria-label="本轮阅读进度"><i style="width:${progress}%"></i></div><p>${info?.complete?'笔记与核验可以继续补齐。':info?'队列保留到今天结束；只有标记已读才计入进度。':'按当前筛选与优先级挑出未读材料，读完再看下一组。'}</p><div class="session-options"><label>每轮 <select id="sessionGoal" aria-label="每轮阅读条数">${[5,10,15].map(n=>`<option value="${n}" ${desk.goal===n?'selected':''}>${n}条</option>`).join('')}</select></label>${info?'<button data-session="new">重新挑选</button>':''}</div></section>
  ${topics.length?`<section class="side-card"><div class="editorial-label">主题分布</div><div class="topic-list">${topics.map(t=>`<button data-topic-search="${esc(t.topic)}"><span>${esc(t.topic)}</span><b>${t.count}</b><i style="width:${Math.max(4,Math.round(t.count/publicRows.length*100))}%"></i></button>`).join('')}</div><p class="small">依据标题与摘要关键词识别，可交叉计数。</p></section>`:''}
  <section class="side-card"><div class="editorial-label">核验</div><h3>${focusReview?`关注人物有 ${focusReview} 条待核验`:'关注人物没有待核验材料'}</h3><p>连续核验一次处理一条：打开原文、做出判断、自动进入下一条。</p><button data-start-triage="focus">开始连续核验 ${icon('arrow')}</button></section></aside></div>`;
};

/* ---------- Review queue and continuous triage ---------- */
function reviewCard(x){
  const t=latestTriage(x.id),label=t?.status==='followup'?'稍后复核':t?.status==='irrelevant'?'已排除无关':t?.status==='duplicate'?'疑似重复':'未处理',url=safeUrl(x.url),summary=displaySummary(x);
  return `<article class="review-card" data-row="${esc(x.id)}"><div class="reading-meta"><button class="person-link" data-person="${esc(x.person)}">${esc(pBy(x.person)?.name)}</button>${statusPill(x)}<span class="pill">${esc(kindNames[x.kind]||'记录')}</span><span class="queue-state">${esc(label)}</span><span>${esc(freshness(x))}</span></div><button class="reading-title" data-reader="${esc(x.id)}">${esc(cleanTitle(x))}</button>${summary?`<p>${esc(summary.slice(0,300))}</p>`:''}<div class="review-foot"><span class="small">${esc(x.source||'')} · 收录 ${esc(fmt(x.recordedAt))}${t?.note?' · 备注：'+esc(t.note):''}</span><div class="review-actions">${url?`<a class="button-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">核对原文 ${icon('external')}</a>`:''}<button data-process="${esc(x.id)}">深入评估</button><button data-edit="${esc(x.id)}">整理／修订</button><button data-triage="${esc(x.id)}">标记…</button></div></div></article>`;
}
renderReview=function(){
  const rows=reviewRows(),active=!!refine.triage;
  $('reviewCount').textContent=`${rows.length}条 · 关注人物、争议及重大事项优先`;
  $('triageMode').hidden=!active;document.documentElement.dataset.triage=active?'true':'';
  if(active){renderTriage();$('reviewList').innerHTML='';$('reviewMore').hidden=true;return}
  $('reviewList').innerHTML=rows.slice(0,reviewLimit).map(reviewCard).join('')||'<div class="empty">没有符合条件的待核验记录。排除只改变复核队列，原始档案仍可在收件箱查看。</div>';
  $('reviewMore').hidden=rows.length<=reviewLimit;
};
function startTriage(scope){
  if(scope==='focus'&&state.favorites.length)$('reviewFav').checked=true;
  $('reviewStatus').value=$('reviewStatus').value==='excluded'?'pending':$('reviewStatus').value;
  const ids=reviewRows().map(x=>x.id);
  if(!ids.length){setView('review');return toast('当前队列没有待处理记录。')}
  refine.triage={ids,index:0,done:0};setView('review');
}
function triageItem(){const t=refine.triage;return t?byId(t.ids[t.index]):null}
function renderTriage(){
  const t=refine.triage;if(!t)return;
  const x=triageItem();
  if(!x){$('triageMode').innerHTML=`<div class="triage-done"><div class="editorial-label">连续核验</div><h3>本轮处理完成</h3><p>处理 ${t.done} 条，跳过 ${t.ids.length-t.done} 条。所有标记都以追加记录保存，原始材料没有改动。</p><div class="actions"><button class="primary" data-triage-exit="true">返回队列</button><button data-start-triage="again">按当前筛选再来一轮</button></div></div>`;return}
  const p=pBy(x.person),url=safeUrl(x.url),summary=displaySummary(x),pct=Math.round(t.index/t.ids.length*100);
  $('triageMode').innerHTML=`<div class="triage-top"><div><div class="editorial-label">连续核验</div><b>第 ${t.index+1} / ${t.ids.length} 条</b><span class="small">已处理 ${t.done}</span></div><div class="meter" aria-hidden="true"><i style="width:${pct}%"></i></div><button class="quiet" data-triage-exit="true">退出 Esc</button></div>
  <article class="triage-card"><div class="reading-meta"><b>${esc(p?.name)}</b><span>${esc(p?.en||'')}</span>${statusPill(x)}<span class="pill">${esc(kindNames[x.kind]||'记录')}</span><span class="pill">${esc(assessment(x.id)?.evidenceLevel||x.evidenceLevel||'L0')}</span></div><h2>${esc(cleanTitle(x))}</h2><div class="reader-dates"><span>本人表态 <b>${esc(x.statementDate||'未知')}</b></span><span>来源发布 <b>${esc(materialDay(x)||'未知')}</b></span><span>系统收录 <b>${esc(localDay(x.recordedAt)||'未知')}</b></span><span>出处 <b>${esc(x.source||'未知')}</b></span></div>${summary?`<p class="triage-summary">${esc(summary)}</p>`:`<p class="triage-summary is-thin">来源只提供标题。请打开原文确认是否为${esc(p?.name)}本人的表态、日期与上下文。</p>`}${url?`<a class="triage-open" href="${esc(url)}" target="_blank" rel="noopener noreferrer" id="triageOpen">打开原文核对 ${icon('external')}<kbd>O</kbd></a>`:'<p class="warning">缺少可打开的原始出处，建议排除或补录出处。</p>'}
  <div class="triage-decisions"><button data-decide="verified" class="decide-ok"><kbd>1</kbd>我已核对原文与上下文</button><button data-decide="followup"><kbd>2</kbd>稍后复核</button><button data-decide="irrelevant"><kbd>3</kbd>排除无关</button><button data-decide="duplicate"><kbd>4</kbd>疑似重复</button></div>
  <label class="field triage-note">备注（可选；排除或重复时未填写则记录默认原因）<input id="triageQuickNote" maxlength="500" placeholder="例如：报道主体不是本人／与另一条同源"></label>
  <div class="triage-nav"><button data-triage-move="-1" ${t.index?'':'disabled'}>← 上一条</button><button data-process="${esc(x.id)}">深入评估 E</button><button data-reader="${esc(x.id)}">在阅读面板打开</button><button data-triage-move="1">跳过 →</button></div>
  <p class="small">“已核对”追加一条用户核验记录，不修改原始材料；排除与重复只改变队列状态。每一步都可以用 Z 撤销。</p></article>`;
}
function triageDecide(kind){
  const t=refine.triage,x=triageItem();if(!t||!x)return;
  const note=($('triageQuickNote')?.value||'').trim();
  if(kind==='verified'){
    const previous=assessment(x.id),a=defaultAssessment(x);a.id=uid('assessment');a.previousAssessment=previous?.id||null;a.recordedAt=now();a.verification='verified';if(note)a.interpretation=[previous?.interpretation,note].filter(Boolean).join('\n');
    state.assessments.push(a);persist();
    offerUndo('已记录：已核对原文',()=>{const b=defaultAssessment(x);b.id=uid('assessment');b.previousAssessment=assessment(x.id)?.id||null;b.recordedAt=now();b.verification=previous?.verification||x.verification||'pending';if(previous)b.interpretation=previous.interpretation||'';state.assessments.push(b);persist();triageBack()});
  }else{
    const previous=latestTriage(x.id),defaults={followup:'连续核验：稍后复核',irrelevant:'连续核验：与研究无关',duplicate:'连续核验：疑似重复报道'};
    state.triage.push({id:uid('triage'),itemId:x.id,status:kind,note:note||defaults[kind],recordedAt:now(),previous:previous?.id||null});persist();
    offerUndo({followup:'已加入稍后复核',irrelevant:'已排除无关，原始记录保留',duplicate:'已标为疑似重复'}[kind],()=>{state.triage.push({id:uid('triage'),itemId:x.id,status:previous?.status||'pending',note:'撤销连续核验标记',recordedAt:now(),previous:latestTriage(x.id)?.id||null});persist();triageBack()});
  }
  t.done++;t.index++;render();
}
function triageBack(){const t=refine.triage;if(t){t.index=Math.max(0,t.index-1);t.done=Math.max(0,t.done-1)}render()}
function triageMove(delta){const t=refine.triage;if(!t)return;t.index=Math.max(0,Math.min(t.ids.length,t.index+delta));renderTriage()}
function exitTriage(){refine.triage=null;render()}

/* ---------- People ---------- */
function weeklyCounts(rows,weeks=8){
  const end=Date.parse(uiToday()+'T12:00:00Z'),counts=Array(weeks).fill(0);
  for(const x of rows){const d=materialDay(x);if(!d)continue;const w=Math.floor((end-Date.parse(d+'T12:00:00Z'))/(7*86400000));if(w>=0&&w<weeks)counts[weeks-1-w]++}
  return counts;
}
function sparkline(counts){
  const max=Math.max(1,...counts),w=6,gap=3;
  return `<svg class="spark" viewBox="0 0 ${counts.length*(w+gap)-gap} 22" role="img" aria-label="近8周材料数：${counts.join('、')}">${counts.map((n,i)=>`<rect x="${i*(w+gap)}" y="${22-Math.max(2,Math.round(n/max*22))}" width="${w}" height="${Math.max(2,Math.round(n/max*22))}" rx="1.5" class="${n?'':'is-zero'}"><title>${n}条</title></rect>`).join('')}</svg>`;
}
renderBoard=function(){
  const info=new Map(state.people.map(p=>{const rows=(uiIndex().perPerson.get(p.id)||[]).filter(x=>!uiExcluded(x)),publicRows=rows.filter(x=>x.kind!=='draft'),sorted=[...publicRows].sort((a,b)=>timelineTime(b)-timelineTime(a));return [p.id,{rows,publicRows,latest:sorted[0]||rows[0],last:sorted[0]?timelineTime(sorted[0]):0,unread:publicRows.filter(x=>!state.read.includes(x.id)).length}]}));
  const sorters={focus:(a,b)=>Number(state.favorites.includes(b.id))-Number(state.favorites.includes(a.id))||info.get(b.id).last-info.get(a.id).last,recent:(a,b)=>info.get(b.id).last-info.get(a.id).last,unread:(a,b)=>info.get(b.id).unread-info.get(a.id).unread,name:(a,b)=>a.name.localeCompare(b.name,'zh-CN')};
  const people=state.people.filter(matchPerson).sort(sorters[refine.boardSort]||sorters.focus);
  $('boardTitle').textContent='人物研究 · '+people.length+'人';$('boardSort').value=refine.boardSort;
  $('boardCards').classList.toggle('compact-people',ux.density==='compact');
  $('boardCards').innerHTML=people.map(p=>{const d=info.get(p.id),x=d.latest,fav=state.favorites.includes(p.id);return `<article class="person-card ${fav?'is-followed':''}"><div class="person-head"><div class="profile-symbol" aria-hidden="true">${esc(p.name.slice(0,1))}</div><div><h3>${esc(p.name)}</h3><span class="small">${esc(p.en)}</span></div><button data-star="${esc(p.id)}" class="star-toggle ${fav?'is-on':''}" aria-pressed="${fav}" aria-label="${fav?'取消关注':'关注'}${esc(p.name)}" title="${fav?'取消关注':'关注'}">${icon(fav?'starFilled':'star')}</button></div><div class="badges">${p.domains.slice(0,3).map(t=>`<span class="topic-tag">${esc(t)}</span>`).join('')}<span class="small">${esc(ageText(p))}</span></div><div class="person-activity"><div><span class="small">近8周材料</span>${sparkline(weeklyCounts(d.publicRows))}</div><div class="person-numbers"><span><b>${d.unread}</b> 未读</span><span><b>${d.publicRows.length}</b> 材料</span><span>最近 <b>${esc(x?shortDay(materialDay(x)):'—')}</b></span></div></div><p class="quote">${x?`<button class="quote-link" data-reader="${esc(x.id)}">${esc(cleanTitle(x))}</button>`:'暂无材料'}</p><div class="actions"><button class="primary" data-person-inbox="${esc(p.id)}">收件箱${d.unread?` · ${d.unread}`:''}</button><button data-timeline="${esc(p.id)}">观点演进</button><button data-details="${esc(p.id)}">档案</button></div></article>`}).join('')||emptyState('没有匹配人物','清除筛选，或用快捷操作搜索人物名称。');
};

/* ---------- Sources ---------- */
const sourceTypeNames={manual:'人工入口',rss:'RSS / Atom',news:'报道发现',edgar:'机构备案'};
function sourceState(s){const st=state.sourceStatuses[s.id];if(s.type==='manual')return 'manual';if(!s.enabled)return 'paused';if(!st)return 'unchecked';return st.ok?'ok':'failed'}
function hostOf(u){try{return new URL(u).hostname.replace(/^www\./,'')}catch{return u||''}}
renderSources=function(){
  const ids=new Set(state.people.filter(matchPerson).map(p=>p.id)),all=state.sources.filter(s=>ids.has(s.person)),f=refine.sourceFilter;
  const count=k=>all.filter(s=>sourceState(s)===k).length,auto=all.filter(s=>s.type!=='manual'&&s.enabled).length;
  $('sourceSummary').innerHTML=`<div><b>${all.length}</b><span>登记来源</span></div><div><b>${auto}</b><span>自动采集</span></div><div class="is-ok"><b>${count('ok')}</b><span>最近成功</span></div><div class="${count('failed')?'is-warn':''}"><b>${count('failed')}</b><span>最近失败</span></div><div><b>${count('unchecked')}</b><span>尚未检查</span></div><div><b>${count('manual')}</b><span>人工入口</span></div>`;
  if(typeof document.querySelectorAll==='function')document.querySelectorAll('[data-source-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.sourceFilter===f);b.setAttribute('aria-pressed',b.dataset.sourceFilter===f)});
  const keep=s=>f==='all'||(f==='failed'&&sourceState(s)==='failed')||(f==='enabled'&&s.type!=='manual'&&s.enabled)||(f==='manual'&&s.type==='manual')||(f==='paused'&&sourceState(s)==='paused');
  const people=state.people.filter(p=>ids.has(p.id)).map(p=>({p,rows:all.filter(s=>s.person===p.id&&keep(s))})).filter(g=>g.rows.length).sort((a,b)=>b.rows.filter(s=>sourceState(s)==='failed').length-a.rows.filter(s=>sourceState(s)==='failed').length||Number(state.favorites.includes(b.p.id))-Number(state.favorites.includes(a.p.id))||a.p.name.localeCompare(b.p.name,'zh-CN'));
  const labels={ok:'正常',failed:'失败',unchecked:'未检查',paused:'已暂停',manual:'人工阅读'};
  $('sourceCards').innerHTML=people.map(({p,rows})=>`<section class="source-group"><div class="source-group-head"><b>${esc(p.name)}</b><span class="small">${esc(p.en)} · ${rows.length}个来源</span>${rows.some(s=>sourceState(s)==='failed')?`<span class="pill disputed">${rows.filter(s=>sourceState(s)==='failed').length} 个失败</span>`:''}</div>${rows.map(s=>{const st=state.sourceStatuses[s.id],k=sourceState(s);return `<div class="source-row"><span class="status-dot is-${k}" title="${labels[k]}"></span><div class="source-name"><b>${esc(s.name)}</b><span class="pill">${esc(sourceTypeNames[s.type]||s.type)}</span></div><div class="source-host">${safeUrl(s.url)?`<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer" title="${esc(s.url)}">${esc(hostOf(s.url))} ↗</a>`:esc(s.url||'')}</div><div class="source-result ${k==='failed'?'error':''}">${k==='manual'?esc(s.status||'需人工阅读'):st?esc(st.ok?`${fmt(st.lastSuccess)} · ${st.count||0}条 / 新增${st.added||0}`:`${st.error||'失败'}${st.lastSuccess?' · 上次成功 '+fmt(st.lastSuccess):''}`):esc(s.enabled?'尚未检查':'未启用')}</div><div class="source-actions">${s.type!=='manual'?`<button data-source-fetch="${esc(s.id)}" ${s.enabled?'':'disabled'}>检查</button><button data-source-toggle="${esc(s.id)}">${s.enabled?'暂停':'启用'}</button>`:''}</div></div>`}).join('')}</section>`).join('')||'<div class="empty">没有符合这个筛选的来源。</div>';
};

/* ---------- Brief ---------- */
function briefColumn(title,rows,kind){
  const byPerson=new Map();for(const x of rows){if(!byPerson.has(x.person))byPerson.set(x.person,[]);byPerson.get(x.person).push(x)}
  let shown=0;const blocks=[];
  for(const [person,items] of [...byPerson].sort((a,b)=>Number(state.favorites.includes(b[0]))-Number(state.favorites.includes(a[0]))||b[1].length-a[1].length)){
    if(shown>=20)break;const take=items.slice(0,Math.min(4,20-shown));shown+=take.length;
    blocks.push(`<div class="brief-person"><div class="brief-person-head"><b>${esc(pBy(person)?.name)}</b><span class="small">${items.length}条</span></div>${take.map(x=>`<div class="brief-item"><button class="reading-title" data-reader="${esc(x.id)}">${esc(cleanTitle(x))}</button><span class="small">${esc(shortDay(localDay(x.statementDate||x.publishedAt)))} · ${esc(x.source||'')}${x.statementDate?'':' · 表态日未知'}</span></div>`).join('')}${items.length>take.length?`<button class="quiet more-link" data-timeline="${esc(person)}">其余 ${items.length-take.length} 条 →</button>`:''}</div>`);
  }
  return `<section class="brief-col ${kind}"><h3>${title}<span>${rows.length}</span></h3>${blocks.join('')||'<p class="small">暂无符合条件的材料。</p>'}${rows.length>shown?`<p class="small">共 ${rows.length} 条，这里按人物展示前 ${shown} 条；完整记录在收件箱。</p>`:''}</section>`;
}
renderBrief=function(){
  const day=$('briefDate').value||today();
  if(!validDate(day)||day>today()){$('briefContent').innerHTML='<div class="empty">请选择有效日期，不能晚于今天。</div>';return}
  const d=briefData(day),unchecked=d.sources.length-d.success.length-d.failed.length;
  $('briefContent').innerHTML=`<div class="brief-stats"><div><span>当日收录</span><b>${d.newRows.length}</b><small>系统收录日期</small></div><div><span>当日表态／发布</span><b>${d.fresh.length}</b><small>材料日期为当天</small></div><div><span>历史补录</span><b>${d.backfill.length}</b><small>不冒充新观点</small></div><div><span>日期未知</span><b>${d.unknown}</b><small>需核对原文</small></div><div class="${d.failed.length?'is-warn':''}"><span>来源状态</span><b>${d.success.length}<small> 成功</small> · ${d.failed.length}<small> 失败</small></b><small>${unchecked} 未检查 · 当前最近状态</small></div><div><span>到期待复核</span><b>${d.due.length}</b><small>缺数据时不结算</small></div></div>
  <div class="brief-cols">${briefColumn('近7天 · 已核查出处／用户核验',d.checked,'is-checked')}${briefColumn('近7天 · 公开线索（尚未认证为本人观点）',d.leads,'is-leads')}</div>
  ${d.failed.length||d.due.length?`<div class="box brief-alerts"><h3>需要留意</h3>${d.failed.map(s=>`<div class="status-row"><span><b>${esc(pBy(s.person)?.name)}</b> · ${esc(s.name)}</span><span class="error">${esc(state.sourceStatuses[s.id].error)} · 上次成功 ${esc(fmt(state.sourceStatuses[s.id].lastSuccess))}</span></div>`).join('')}${d.due.slice(0,20).map(p=>`<div class="status-row"><span>${esc(pBy(p.person)?.name)} · ${esc(p.symbol)} · 到期 ${esc(p.dueDate)}</span><button data-result="${esc(p.id)}">查看／复核</button></div>`).join('')}</div>`:''}`;
};

/* ---------- Predictions empty state ---------- */
const deskPredictions=renderPredictions;
renderPredictions=function(){
  deskPredictions();
  const ids=new Set(state.people.filter(matchPerson).map(p=>p.id)),any=state.scorecard.predictions.some(p=>ids.has(p.person)),bar=$('rankDomain').parentElement;
  if(bar)bar.hidden=!any;
  if(any)return;
  $('ranking').innerHTML='';
  $('forecastList').innerHTML=`<div class="guide-empty"><div class="editorial-label">还没有登记预测</div><h3>把明确的判断变成可复盘的记录</h3><ol class="guide-steps"><li><b>登记</b><span>写清标的、到期日、成功条件与证据链接；登记后规则锁定。</span></li><li><b>到期</b><span>到期前不结算；到期日前7天内的同口径数据才用于试算。</span></li><li><b>导入结果</b><span>下载CSV模板，填入公开结果与出处后导入。</span></li><li><b>人工复核</b><span>确认试算后才进入统计；同领域、同期限样本足够才排名。</span></li></ol><div class="actions"><button class="primary" data-proxy="newPrediction">登记第一条预测</button><button data-proxy="priceTemplate">下载结果CSV模板</button></div><p class="small">原稿中的模糊观点不会自动变成作者的量化承诺。可以在阅读面板点击“登记预测”，从具体材料出发。</p></div>`;
};

/* ---------- Sync status ---------- */
function syncSnapshot(){
  const auto=state.sources.filter(s=>s.type!=='manual'&&s.enabled),failed=auto.filter(s=>state.sourceStatuses[s.id]?.ok===false),ok=auto.filter(s=>state.sourceStatuses[s.id]?.ok===true);
  const last=Object.values(state.sourceStatuses).map(x=>x.lastSuccess).filter(Boolean).sort().at(-1);
  return{auto,failed,ok,last,offline:state.settings.mode==='offline'};
}
function compactTime(iso){if(!iso)return '';const d=localDay(iso);return d===uiToday()?fmt(iso).slice(-5):shortDay(d)}
function renderSync(){
  const s=syncSnapshot(),root=document.documentElement,flashing=Date.now()<refine.flashUntil;
  if(refine.wasBusy&&!busy){refine.flashUntil=Date.now()+6000;setTimeout(renderSync,6100)}
  refine.wasBusy=busy;
  let mode='ok',label=s.last?'已同步 · '+compactTime(s.last):'尚未更新';
  if(busy){mode='busy';label='正在更新…'}else if(s.offline){mode='offline';label='离线阅读'}else if(s.failed.length){mode='warn';label=`${s.failed.length}个来源异常`}else if(!s.last)mode='idle';
  $('connection').dataset.sync=mode;$('connection').textContent=label;$('connection').title=`同步状态：${label}。点击查看详情或更新。`;
  root.dataset.busy=busy?'true':'';root.dataset.flash=!busy&&(flashing||Date.now()<refine.flashUntil)?'true':'';
  if($('syncDialog').open||typeof document.querySelectorAll!=='function')renderSyncBody(s);
}
function renderSyncBody(s=syncSnapshot()){
  $('syncBody').innerHTML=`<div class="sync-grid"><div><span>最近成功</span><b>${s.last?esc(fmt(s.last)):'尚未更新'}</b></div><div><span>自动来源</span><b>${s.ok.length} 正常 · ${s.failed.length} 失败</b></div><div><span>联网模式</span><b>${esc($('mode').selectedOptions?.[0]?.textContent?.split('：')[0]||state.settings.mode)}</b></div><div><span>档案</span><b>${esc($('storeStatus').textContent||'浏览器缓存')}</b></div></div>${busy?`<p class="sync-live">${esc($('status').textContent)}</p>`:''}${s.failed.length?`<div class="sync-failures"><h4>最近失败的来源</h4>${s.failed.slice(0,5).map(x=>`<div><b>${esc(pBy(x.person)?.name)} · ${esc(x.name)}</b><span class="error">${esc(state.sourceStatuses[x.id].error||'失败')}</span></div>`).join('')}${s.failed.length>5?`<p class="small">另有 ${s.failed.length-5} 个，见来源管理。</p>`:''}<p class="small">失败不会删除旧记录，也不会刷新“最近成功”时间。</p></div>`:'<p class="small">没有已记录的来源失败。最近成功时间不代表所有来源都已更新。</p>'}`;
}
function openSync(){renderSyncBody();if(!$('syncDialog').open)$('syncDialog').showModal()}
const deskRefresh=refresh;
refresh=async function(...args){
  const pending=deskRefresh(...args);
  renderSync();if($('syncDialog').open)renderSyncBody();
  try{return await pending}finally{renderSync();if($('syncDialog').open)renderSyncBody()}
};

/* ---------- Chrome ---------- */
function renderRefineChrome(){
  const root=document.documentElement;root.dataset.view=view;
  const focusCount=uiRows().filter(x=>needsReview(x)&&state.favorites.includes(x.person)).length;
  for(const id of ['railReviewCount','tabReviewCount']){$(id).textContent=focusCount||'';$(id).title='关注人物待核验 '+focusCount+' 条'}
  if(typeof document.querySelectorAll==='function'){
    document.querySelectorAll('[data-inbox-density]').forEach(b=>{b.classList.toggle('active',b.dataset.inboxDensity===refine.inboxDensity);b.setAttribute('aria-pressed',b.dataset.inboxDensity===refine.inboxDensity)});
    document.querySelectorAll('.tab-icon[data-icon]').forEach(n=>{if(!n.firstChild)n.innerHTML=icon(n.dataset.icon)});
  }
  $('readerAutoNext').checked=refine.autoNext;
  renderBulk();renderSync();
}
const deskChrome=renderUxChrome;
renderUxChrome=function(){deskChrome();renderRefineChrome()};
const deskSetView=setView;
setView=function(value){if(value!=='review'&&refine.triage)refine.triage=null;if(value!==view){refine.cursor=null;refine.selection.clear()}deskSetView(value);document.documentElement.dataset.view=view};

// Reader: L for later, optional advance after marking read.
const deskToggleReaderFlag=toggleReaderFlag;
toggleReaderFlag=function(key){
  const x=readerItem(),wasRead=x&&state.read.includes(x.id);
  deskToggleReaderFlag(key);
  if(key==='read'&&x&&!wasRead&&refine.autoNext&&ux.readerIndex<ux.readerIds.length-1)readerMove(1);
};

// Commands: keep the first two entries stable, add triage and list density.
const deskCommandItems=commandItems;
commandItems=function(query=''){
  const base=deskCommandItems(query),needle=query.trim().toLowerCase();
  const mine=[{label:'连续核验',detail:'一次处理一条待核验材料',kind:'triage',value:''},{label:'打开同步状态',detail:'更新关注人物或查看失败来源',kind:'sync',value:''},{label:refine.inboxDensity==='list'?'收件箱改为卡片':'收件箱改为列表',detail:'切换收件箱显示密度',kind:'density',value:''}].filter(x=>(x.label+' '+x.detail).toLowerCase().includes(needle));
  return [...base.slice(0,2),...mine,...base.slice(2)].slice(0,20);
};
const deskExecute=executeCommand;
executeCommand=function(kind,value){
  if(kind==='triage'){$('commandDialog').close();return startTriage()}
  if(kind==='sync'){$('commandDialog').close();return openSync()}
  if(kind==='density'){$('commandDialog').close();setInboxDensity(refine.inboxDensity==='list'?'cards':'list');return setView('timeline')}
  return deskExecute(kind,value);
};
function setInboxDensity(value){refine.inboxDensity=value;refineSave();if(view==='timeline')renderTimeline();renderRefineChrome()}

/* ---------- Events ---------- */
$('reviewNext').onclick=()=>startTriage();
$('connection').onclick=openSync;
$('closeFilters').onclick=()=>{$('filterPanel').hidden=true;$('toggleFilters').setAttribute('aria-expanded',false)};
$('boardSort').onchange=()=>{refine.boardSort=$('boardSort').value;refineSave();renderBoard()};
$('readerAutoNext').onchange=()=>{refine.autoNext=$('readerAutoNext').checked;refineSave()};
$('tabMore').onclick=()=>$('moreDialog').showModal();
document.addEventListener('click',e=>{
  const el=e.target.closest?.('button,a,[data-row]');if(!el)return;const d=el.dataset||{};
  if(el.tagName==='BUTTON'){
    if(d.view&&$('moreDialog').open)$('moreDialog').close();
    if(d.view&&$('syncDialog').open)$('syncDialog').close();
    if(d.personInbox){selected=d.personInbox;limit=30;if(!['priority','all'].includes(ux.preset))ux.preset='priority';setView('timeline')}
    if(d.inboxDensity)setInboxDensity(d.inboxDensity);
    if(d.startTriage)startTriage(d.startTriage);
    if(d.triageExit)exitTriage();
    if(d.decide)triageDecide(d.decide);
    if(d.triageMove)triageMove(Number(d.triageMove));
    if(d.bulk)bulkAction(d.bulk);
    if(d.sourceFilter){refine.sourceFilter=d.sourceFilter;renderSources()}
    if(d.openSync)openSync();
    if(d.more==='commands'){$('moreDialog').close();openCommands()}
    if(d.proxy&&$(d.proxy))$(d.proxy).click();
    return;
  }
  // A click on the empty part of a one-line row opens it, like a mail list.
  if(el.dataset?.row&&el.classList?.contains('list-row')&&!e.target.closest('input,label'))readerOpen(el.dataset.row);
});
document.addEventListener('change',e=>{const id=e.target?.dataset?.select;if(id)setSelection(id,e.target.checked)});
document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  const typing=e.target?.matches?.('input,textarea,select,[contenteditable="true"]'),key=e.key.length===1?e.key.toLowerCase():e.key;
  if(typing)return;
  const openDialog=document.querySelector?.('dialog[open]');
  if(openDialog){
    if(openDialog.id==='readerDialog'&&key==='l'){e.preventDefault();readerTriage('followup')}
    return;
  }
  if(key==='z'&&ux.undo){e.preventDefault();$('undoAction').click();return}
  if(view==='review'&&refine.triage){
    const map={'1':'verified','2':'followup','3':'irrelevant','4':'duplicate'};
    if(map[key]&&triageItem()){e.preventDefault();triageDecide(map[key])}
    else if(key==='o'&&$('triageOpen')){e.preventDefault();$('triageOpen').click()}
    else if(key==='e'&&triageItem()){e.preventDefault();openProcess(triageItem().id)}
    else if(key==='ArrowRight'){e.preventDefault();triageMove(1)}
    else if(key==='ArrowLeft'){e.preventDefault();triageMove(-1)}
    else if(key==='Escape'){e.preventDefault();exitTriage()}
    return;
  }
  if(!['home','timeline','review'].includes(view))return;
  if(key==='j'||key==='ArrowDown'&&refine.cursor){e.preventDefault();moveCursor(1)}
  else if(key==='k'||key==='ArrowUp'&&refine.cursor){e.preventDefault();moveCursor(-1)}
  else if((key==='Enter'||key==='o')&&refine.cursor){e.preventDefault();readerOpen(refine.cursor)}
  else if(key==='x'&&refine.cursor){e.preventDefault();setSelection(refine.cursor,!refine.selection.has(refine.cursor));const box=document.querySelector?.(`[data-select="${CSS.escape(refine.cursor)}"]`);if(box)box.checked=refine.selection.has(refine.cursor)}
  else if(key==='r'&&refine.cursor){e.preventDefault();cursorToggle('read')}
  else if(key==='s'&&refine.cursor){e.preventDefault();cursorToggle('saved')}
  else if(key==='Escape'&&refine.selection.size){e.preventDefault();bulkAction('clear')}
});
// Keep the cursor on screen after re-renders triggered by list actions.
const deskRender=render;
render=function(){deskRender();if(refine.cursor)paintCursor(false)};
// On phones the top bar slides away while scrolling down and returns when scrolling up.
if(typeof addEventListener==='function')addEventListener('scroll',()=>{const y=scrollY,root=document.documentElement;root.dataset.scrolled=y>refine.scrollY&&y>120?'down':'';refine.scrollY=y},{passive:true});
document.documentElement.dataset.view=view;
render();
