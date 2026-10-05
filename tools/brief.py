"""Evidence-labelled daily digest from the existing store; no network or messaging."""
from __future__ import annotations
import argparse
from datetime import datetime,date,timedelta,timezone
from pathlib import Path
from model import DATA,ROOT,read_state
ZONE=timezone(timedelta(hours=8))

def local_day(value):
    if not value:return None
    try:
        if len(value)==10:return date.fromisoformat(value).isoformat()
        dt=datetime.fromisoformat(value.replace('Z','+00:00'))
        if dt.tzinfo is None:dt=dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(ZONE).date().isoformat()
    except (ValueError,TypeError):return None

def current_records(state):
    replaced={x.get('revisionOf') for x in state['timeline'] if x.get('revisionOf')}
    return [x for x in state['timeline'] if x['id'] not in replaced]

def daily_data(state,day=None):
    day=day or datetime.now(ZONE).date().isoformat();target=date.fromisoformat(day)
    start=(target-timedelta(days=6)).isoformat();rows=current_records(state)
    assessments={x['itemId']:x for x in state.get('assessments',[])}
    triage={x['itemId']:x for x in state.get('triage',[])}
    def verification(x):return assessments.get(x['id'],{}).get('verification',x.get('verification','pending'))
    visible=[x for x in rows if triage.get(x['id'],{}).get('status') not in ('irrelevant','duplicate')]
    new=[x for x in visible if x.get('kind')!='draft' and local_day(x.get('recordedAt'))==day]
    recent=[x for x in visible if x.get('kind')!='draft' and start<=(local_day(x.get('statementDate') or x.get('publishedAt')) or '')<=day]
    recent.sort(key=lambda x:x.get('statementDate') or x.get('publishedAt') or '',reverse=True)
    fresh_today=[x for x in new if local_day(x.get('statementDate') or x.get('publishedAt'))==day]
    backfill=[x for x in new if local_day(x.get('statementDate') or x.get('publishedAt')) and local_day(x.get('statementDate') or x.get('publishedAt'))<day]
    enabled=[s for s in state['sources'] if s.get('enabled') and s['type']!='manual']
    checked=[(s,state.get('sourceStatuses',{}).get(s['id'])) for s in enabled]
    failures=[(s,st) for s,st in checked if st and st.get('ok') is False]
    successes=[(s,st) for s,st in checked if st and st.get('ok') is True]
    due=[]
    for p in state['scorecard']['predictions']:
        if p['dueDate']>day:continue
        latest=next((s for s in reversed(state['scorecard']['settlements']) if s['predictionId']==p['id']),None)
        if not latest or latest['status'] not in ('confirmed','unresolvable'):due.append(p)
    return {'day':day,'new':new,'freshToday':fresh_today,'backfill':backfill,'unknownDate':len(new)-len(fresh_today)-len(backfill),'recent':recent,'checked':[x for x in recent if verification(x) in ('verified','source_checked')],'leads':[x for x in recent if verification(x) not in ('verified','source_checked')],'failures':failures,'successes':successes,'unattempted':len(enabled)-len(failures)-len(successes),'due':due,'verification':verification}

def digest_markdown(state,day=None):
    d=daily_data(state,day);names={p['id']:p['name'] for p in state['people']}
    def clean(s):return str(s or '').replace('\n',' ').replace('\r',' ').replace('[','\\[').replace(']','\\]')
    lines=[f"# 投资观点每日简报 · {d['day']}（北京时间）",'',f"生成时间：{datetime.now(ZONE).isoformat(timespec='seconds')}", '统计全部41人；“收录”是进入档案的时间，不能当作本人表态时间。','',f"今天新增收录 {len(d['new'])}条；其中当天表态／发布 {len(d['freshToday'])}条，历史补录 {len(d['backfill'])}条，材料日期未知 {d['unknownDate']}条。",f"启用来源当前最近状态（不随日期回溯）：成功 {len(d['successes'])}，失败 {len(d['failures'])}，未检查 {d['unattempted']}。成功包括作者筛选后0条，不等于发现新观点。",f"到期未完成复核预测 {len(d['due'])}条。",'','## 近7天已核查出处／用户核验材料','']
    def render(rows):
        if not rows:return ['暂无符合条件的材料。','']
        out=[]
        for x in rows[:20]:
            label='用户已核验' if d['verification'](x)=='verified' else '出处已核查'
            if x in d['leads']:label='待核验公开线索'
            date_value=local_day(x.get('statementDate') or x.get('publishedAt')) or '日期未知'
            out.extend([f"- {clean(names.get(x['person'],x['person']))}｜{label}｜{date_value}｜{clean(x['title'])}",f"  出处：{x.get('url') or '尚未附出处'}"])
        if len(rows)>20:out.append(f"其余{len(rows)-20}条请在网页查看；简报只展示前20条。")
        return out+['']
    lines+=render(d['checked'])+['## 近7天公开线索（尚未认证为本人观点）','']+render(d['leads'])
    lines+=['## 来源失败与待处理','']
    if not d['failures']:lines+=['最近检查无已记录失败；未检查来源另计。']
    for s,st in d['failures']:lines.append(f"- {clean(names.get(s['person']))}｜{clean(s['name'])}｜{clean(st.get('error'))}｜上次成功 {st.get('lastSuccess') or '无'}")
    for p in d['due'][:20]:lines.append(f"- 到期预测：{clean(names.get(p['person']))}｜{clean(p['symbol'])}｜{p['dueDate']}；有合格数据才可试算和人工确认。")
    lines+=['','仅标题与来源摘要的整理，不自动生成投资建议；原稿待核验资料和未知日期不会伪装为当天观点。','']
    return '\n'.join(lines)

def write_digest(state,folder=None,day=None):
    import os,tempfile
    folder=Path(folder or ROOT/'reports');folder.mkdir(parents=True,exist_ok=True)
    day=day or datetime.now(ZONE).date().isoformat();path=folder/('daily-'+day+'.md')
    fd,name=tempfile.mkstemp(prefix='daily.',dir=folder)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as f:f.write(digest_markdown(state,day))
        os.replace(name,path)
    finally:
        if os.path.exists(name):os.unlink(name)
    return path

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--data-dir',type=Path,default=DATA);parser.add_argument('--output-dir',type=Path);parser.add_argument('--day');args=parser.parse_args()
    print(write_digest(read_state(args.data_dir),args.output_dir,args.day))
