/* Offline workflow checks with a DOM stub. This does not test browser layout. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..'),template=fs.readFileSync(path.join(ROOT,'app-template.html'),'utf8');
const seed=JSON.parse(fs.readFileSync(path.join(ROOT,'data/state.json'),'utf8'));
seed.settings={...seed.settings,mode:'offline',autoStart:false,interval:0};
const nodes=new Map(),listeners=new Map(),storage=new Map();
const decode=x=>x.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
class Element{
 constructor(id){this.id=id;this.value='';this.textContent='';this.hidden=false;this.open=false;this.checked=false;this.dataset={};this.style={};this.attributes={};this.classList={toggle(){}};this.offsetTop=0;this.events={};this._html=''}
 set innerHTML(html){this._html=html;parseNodes(html)}get innerHTML(){return this._html}
 reset(){}showModal(){this.open=true}close(){this.open=false}focus(){}scrollIntoView(){}insertAdjacentHTML(position,html){this._html+=html;parseNodes(html)}click(){if(this.onclick)this.onclick()}
 setAttribute(k,v){this.attributes[k]=v}removeAttribute(k){delete this.attributes[k]}
 addEventListener(k,v){this.events[k]=v}contains(){return true}
 querySelector(){return new Element(this.id+'-child')}
}
function parseNodes(html){for(const m of html.matchAll(/<([a-z][a-z0-9]*)[^>]*\bid="([^"]+)"[^>]*>/g)){let n=nodes.get(m[2]);if(!n){n=new Element(m[2]);nodes.set(m[2],n)}const value=m[0].match(/\bvalue="([^"]*)"/);if(value)n.value=decode(value[1]);if(m[1]==='select'){const rest=html.slice(m.index+m[0].length),end=rest.indexOf('</select>'),option=rest.slice(0,end).match(/<option(?:[^>]*value="([^"]*)")?[^>]*>([^<]*)/);if(option)n.value=decode(option[1]??option[2])}if(m[1]==='textarea'){const rest=html.slice(m.index+m[0].length);n.value=decode(rest.slice(0,rest.indexOf('</textarea>')))}}}
parseNodes(template);
const ids=[...template.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'duplicate template IDs');
assert(template.indexOf('id="compareBar"')<template.indexOf('/* APP_JS */'),'all dynamic elements must precede bootstrap script');
const document={documentElement:new Element("html"),getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[],querySelector:()=>[...nodes.values()].find(n=>n.open)||null,addEventListener:(k,v)=>{if(!listeners.has(k))listeners.set(k,[]);listeners.get(k).push(v)}};
const scope={document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},structuredClone,URL,crypto:crypto.webcrypto,Intl,Date,JSON,Number,Math,Set,Map,console,location:{hostname:'',protocol:'file:'},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},scrollTo(){}};
vm.createContext(scope);const run=code=>vm.runInContext(code,scope);
run('const BUNDLED='+JSON.stringify(seed)+';'+fs.readFileSync(path.join(ROOT,'app.js'),'utf8')+'\n'+fs.readFileSync(path.join(ROOT,'ui.js'),'utf8')+'\n'+fs.readFileSync(path.join(ROOT,'premium.js'),'utf8')+'\n'+fs.readFileSync(path.join(ROOT,'desk.js'),'utf8'));
assert.equal(run('view'),'home');assert.equal(run('state.people.length'),41);
assert(nodes.get('homeContent').innerHTML.includes('研究工作台')&&nodes.get('homeContent').innerHTML.includes('优先阅读')&&nodes.get('homeContent').innerHTML.includes('关注人物动态'));
for(const view of ['home','board','timeline','review','predictions','brief','process','sources','settings','methods'])run('setView('+JSON.stringify(view)+')');
const plan=JSON.parse(run('JSON.stringify(smartQuery("关注 未读 近7天 AI"))'));
assert.equal(plan.focus,true);assert.equal(plan.unread,true);assert.equal(plan.days,7);assert.deepEqual(plan.terms,['AI']);
const fixture={id:'ui-fixture-a',rootId:'ui-fixture-a',person:'marks',title:'AI capex and credit',summary:'Fixture text',source:'Example',url:'https://example.org/article',kind:'lead',evidenceLevel:'L0',verification:'pending',publishedAt:'2026-10-04T00:00:00Z',recordedAt:'2026-10-05T00:00:00Z',statementDate:null};
scope.fixture=fixture;run('state.timeline.push(clone(fixture),{...clone(fixture),id:"ui-fixture-b",rootId:"ui-fixture-b",source:"Other example"});ux.cache=null');
assert.equal(run('groupRows([byId("ui-fixture-a"),byId("ui-fixture-b")]).length'),1);
assert.equal(run('state.timeline.filter(x=>x.id.startsWith("ui-fixture")).length'),2);
run('resetUxFilters();state.favorites=["marks"];ux.preset="focus"');
assert(run('uiRows().every(x=>x.person==="marks")'));
nodes.get('search').value='关注 未读 近7天 AI';
assert(run('uiRows().every(x=>x.person==="marks"&&!state.read.includes(x.id)&&suggestedTopics(x).includes("AI基建")&&uiAgeDays(x)<7)'));
run('resetUxFilters();readerOpen("ui-fixture-a",["ui-fixture-a","ui-fixture-b"])');
assert.equal(nodes.get('readerDialog').open,true);
nodes.get('readerNote').value='Unsaved research note';
for(const handler of listeners.get('input')||[])handler({target:nodes.get('readerNote')});
assert.equal(JSON.parse(storage.get('investor-research-ui-v3')).readerDrafts['ui-fixture-a'],'Unsaved research note');
run('toggleReaderFlag("saved")');assert.equal(nodes.get('readerNote').value,'Unsaved research note');
run('readerMove(1)');assert.equal(run('ux.readerIndex'),1,'checkpointed drafts should allow switching');
run('readerMove(-1)');assert.equal(nodes.get('readerNote').value,'Unsaved research note','draft must recover on return');
run('saveReaderChanges();readerMove(1)');assert.equal(run('ux.readerIndex'),1);
assert.equal(run('assessment("ui-fixture-a").interpretation'),'Unsaved research note');
assert.equal(JSON.parse(storage.get('investor-research-ui-v3')).readerDrafts['ui-fixture-a'],undefined);
assert.equal(run('verification(byId("ui-fixture-a"))'),'pending','notes must not verify source');
run('readerMove(-1)');nodes.get('readerNote').value='Storage failure fixture';const normalSetItem=scope.localStorage.setItem;scope.localStorage.setItem=()=>{throw Error('quota fixture')};run('readerMove(1)');assert.equal(run('ux.readerIndex'),0,'storage failure must block navigation');assert.equal(nodes.get('readerNote').value,'Storage failure fixture');scope.localStorage.setItem=normalSetItem;nodes.get('readerNote').value='Unsaved research note';
run('readerMove(-1);readerTriage("irrelevant")');assert.equal(run('latestTriage("ui-fixture-a").status'),'irrelevant');
assert(run('!!byId("ui-fixture-a")'));run('ux.undo()');assert.equal(run('latestTriage("ui-fixture-a").status'),'pending');
run('readerOpen("ui-fixture-a");appendPersonal(readerItem(),{topic:"AI基建",personal:"agree"})');
assert.equal(run('assessment("ui-fixture-a").topic'),'AI基建');assert.equal(run('assessment("ui-fixture-a").verification'),'pending');
assert(run('commandItems("马克斯").some(x=>x.kind==="person"&&x.value==="marks")'));
run('selected="marks";ux.preset="unread";favOnly=true;resetUxFilters()');assert.equal(run('selected'),'all');assert.equal(run('ux.preset'),'priority');assert.equal(nodes.get('search').value,'');
// Research views restore hidden conditions and preserve their exact query.
run('selected="marks";ux.preset="ai";ux.sort="date"');nodes.get('search').value='关注 未读 近7天 AI';nodes.get('kindFilter').value='lead';
const savedViewId=run('saveNamedView("AI研究 <视图>").id');
assert.equal(JSON.parse(storage.get('investor-research-desk-ui-v4')).views.length,1);
assert(!nodes.get('savedViews').innerHTML.includes('AI研究 <视图>'),'view names must be escaped');
run('resetUxFilters()');scope.savedViewId=savedViewId;assert(run('restoreView(savedViewId)'));
assert.equal(run('selected'),'marks');assert.equal(nodes.get('search').value,'关注 未读 近7天 AI');assert.equal(nodes.get('kindFilter').value,'lead');assert.equal(run('ux.sort'),'date');
assert(run('activeFilterChips().some(([k])=>k==="kindFilter")'));run('clearFilter("kindFilter")');assert.equal(nodes.get('kindFilter').value,'all');
assert(run('reviewRows().every(x=>x.person==="marks"&&!state.read.includes(x.id)&&suggestedTopics(x).includes("AI基建"))'));
run('resetUxFilters();desk.goal=5;beginSession()');
assert.equal(run('sessionInfo().total'),5);assert.equal(run('ux.readerIds.length'),5);assert(run('ux.readerIds.every(id=>!state.read.includes(id))'));
const sessionFirst=run('readerItem().id');run('toggleReaderFlag("read")');assert.equal(run('sessionInfo().done'),1);
nodes.get('readerDialog').close();run('beginSession()');assert.notEqual(run('readerItem().id'),sessionFirst,'resuming should skip read material');assert.equal(run('sessionInfo().total'),5);
const sessionCount=run('desk.session.ids.length');run('desk.goal=10');assert.equal(run('desk.session.ids.length'),sessionCount,'changing next goal must preserve current queue');
run('toggleFocus();toggleTheme()');assert.equal(run('desk.focus'),true);assert.equal(document.documentElement.dataset.theme,'dark');assert.equal(JSON.parse(storage.get('investor-research-desk-ui-v4')).theme,'dark');
assert(nodes.get('readerBody').innerHTML.includes('下一步补齐什么'));
run('desk.compare=[];comparePick("ui-fixture-a");comparePick("ui-fixture-b")');assert.equal(run('desk.compare.length'),2);assert.equal(nodes.get('openComparison').disabled,false);
assert.equal(run('comparePick(state.timeline.find(x=>!desk.compare.includes(x.id)).id)'),false,'third comparison must be rejected');
run('openComparison()');assert.equal(nodes.get('comparisonDialog').open,true);assert(nodes.get('comparisonBody').innerHTML.includes('不自动判断作者观点冲突'));
assert.equal(run('uiVerification(byId("ui-fixture-b"))'),'pending');
nodes.get('readerDialog').close();run('openCommands()');const initialCommand=run('commandItems()[0].kind');assert.equal(initialCommand,'session');
nodes.get('commandSearch').onkeydown({key:'ArrowDown',preventDefault(){}});assert.equal(run('desk.commandIndex'),1);
nodes.get('commandSearch').onkeydown({key:'Enter',preventDefault(){}});assert.equal(nodes.get('saveViewDialog').open,true,'Enter should execute selected command, not first');
assert.equal(run('state.timeline.filter(x=>x.id.startsWith("ui-fixture")).length'),2);
const scopeRows=run('uiRows().map(x=>x.id)');
// Export a static shell for optional layout inspection, without changing records.
if(process.env.UI_STATIC_PREVIEW){run('resetUxFilters();setView("home")');let html=template.replace('/* BASE_CSS */',fs.readFileSync(path.join(ROOT,'base.css'),'utf8')).replace('/* UX_CSS */',fs.readFileSync(path.join(ROOT,'ui.css'),'utf8')).replace('/* PREMIUM_CSS */',fs.readFileSync(path.join(ROOT,'premium.css'),'utf8')).replace('/* DESK_CSS */',fs.readFileSync(path.join(ROOT,'desk.css'),'utf8'));html=html.replace(/<script>[\s\S]*?<\/script>/g,'');for(const [id,n]of nodes){if(['homeContent','watchlist','readerBody','boardCards','feed'].includes(id))html=html.replace(new RegExp('(<div id="'+id+'"[^>]*>)(</div>)'),'$1'+n.innerHTML+'$2')}html=html.replace('<section id="home" class="view" hidden>','<section id="home" class="view">').replace('<section id="board" class="view">','<section id="board" class="view" hidden>');fs.writeFileSync(process.env.UI_STATIC_PREVIEW,html)}
console.log('PASS: initial workbench, 10 module render paths, smart query, focus scope, duplicate grouping without deletion, reader draft checkpoint and recovery, source-status separation, reversible triage, commands, filter reset, saved-view restore, query consistency, resumable sessions, focus/theme preferences, two-material comparison, palette keyboard selection. DOM stubs only.');
