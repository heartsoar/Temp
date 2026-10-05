"""Versioned local data store; Python standard library only."""
from __future__ import annotations
import contextlib
import csv
import io
import json
import os
import tempfile
import time
import uuid
from urllib.parse import urlsplit, urlunsplit
from datetime import datetime, date, timedelta, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'
ARRAYS=('timeline','assessments','predictions','settlements','observations')

def now(): return datetime.now(timezone.utc).isoformat()
def today(): return datetime.now(timezone(timedelta(hours=8))).date()
def uid(prefix): return prefix+'-'+uuid.uuid4().hex
def fnv(text):
    result=2166136261
    b=str(text).encode('utf-16-le',errors='surrogatepass')
    for n in range(0,len(b),2): result=((result ^ (b[n]+256*b[n+1]))*16777619)&0xffffffff
    digits='0123456789abcdefghijklmnopqrstuvwxyz';s=''
    while result:s=digits[result%36]+s;result//=36
    return s or '0'
def fingerprint(item):
    return fnv('\x1f'.join(str(item.get(k) or '') for k in ('title','summary','publishedAt','statementDate')))

@contextlib.contextmanager
def file_lock(data=DATA, timeout=5):
    data.mkdir(parents=True,exist_ok=True);path=data/'.write-lock';deadline=time.monotonic()+timeout
    while True:
        try:
            fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
            os.write(fd,json.dumps({'pid':os.getpid(),'time':time.time()}).encode());os.close(fd);break
        except FileExistsError:
            try:
                info=json.loads(path.read_text());os.kill(info['pid'],0)
            except ProcessLookupError:
                path.unlink(missing_ok=True);continue
            except (ValueError,KeyError,OSError):
                try:
                    if time.time()-path.stat().st_mtime>300:path.unlink(missing_ok=True);continue
                except FileNotFoundError:continue
            if time.monotonic()>deadline:raise RuntimeError('Data file is busy; retry shortly')
            time.sleep(.05)
    try:yield
    finally:path.unlink(missing_ok=True)

def read_state(data=DATA):
    path=data/'state.json'
    if path.exists():return json.loads(path.read_text(encoding='utf-8'))
    return {'schema':2,'revision':0,'people':json.loads((data/'people.json').read_text()),'sources':json.loads((data/'sources.json').read_text()),'timeline':json.loads((data/'timeline.json').read_text()),'assessments':[],'scorecard':json.loads((data/'scorecard.json').read_text()),'favorites':[],'saved':[],'read':[],'sourceStatuses':{},'settings':{}}

def atomic_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    fd,name=tempfile.mkstemp(prefix=path.name+'.',dir=path.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as f:
            json.dump(value,f,ensure_ascii=False,indent=2);f.flush();os.fsync(f.fileno())
        os.replace(name,path)
    finally:
        if os.path.exists(name):os.unlink(name)

def write_state(state,data=DATA):
    """Call under file_lock. state.json is the authoritative commit point."""
    prev=data/'state.json'
    if prev.exists():atomic_json(data/'state.previous.json',json.loads(prev.read_text(encoding='utf-8')))
    state['revision']=int(state.get('revision',0))+1;state['updatedAt']=now()
    for name in ('people','sources','timeline','scorecard'):atomic_json(data/(name+'.json'),state[name])
    atomic_json(data/'state.json',state)

def append_records(existing,incoming):
    """Immutable IDs: identical repeats are ignored; changed IDs are rejected."""
    seen={x['id']:x for x in existing};added=0
    for item in incoming:
        if item['id'] in seen:
            if item!=seen[item['id']]:raise ValueError('Immutable record changed: '+item['id'])
            continue
        seen[item['id']]=item;existing.append(item);added+=1
    return added

def ingest(state,records):
    known={(x.get('rootId',x['id']),fingerprint(x)) for x in state['timeline']}
    latest={}
    for item in state['timeline']:latest[item.get('rootId',item['id'])]=item
    added=0
    for item in records:
        root=item['rootId'];key=(root,fingerprint(item))
        if key in known:continue
        if root in latest:item['revisionOf']=latest[root]['id']
        if any(x['id']==item['id'] for x in state['timeline']):item['id']=uid('revision')
        state['timeline'].append(item);latest[root]=item;known.add(key);added+=1
    return added

def validate_state(candidate,current):
    if candidate.get('schema')!=2:raise ValueError('Expected schema 2')
    if len(candidate.get('people',[]))!=41:raise ValueError('Expected 41-person registry')
    ids={p['id'] for p in current['people']}
    if {p.get('id') for p in candidate['people']}!=ids:raise ValueError('Person IDs cannot be replaced')
    people={p['id']:p for p in candidate['people']}
    for person in current['people']:
        for key in ('facts','conflicts'):
            rows=people[person['id']].get(key,[])
            if not isinstance(rows,list):raise ValueError('Invalid person history')
            indexed={x.get('id'):x for x in rows if x.get('id')}
            for item in person.get(key,[]):
                if item.get('id') and indexed.get(item['id'])!=item:raise ValueError('Person fact history cannot be overwritten')
                if not item.get('id') and item not in rows:raise ValueError('Original person facts must be retained')
    for key in ('timeline','assessments','triage'):
        rows=candidate.get(key,[])
        if not isinstance(rows,list) or len(rows)>100000:raise ValueError('Invalid '+key)
        if len({x.get('id') for x in rows})!=len(rows):raise ValueError('Duplicate IDs in '+key)
        existing={x['id']:x for x in rows}
        for x in current.get(key,[]):
            if existing.get(x['id'])!=x:raise ValueError('History cannot be removed or overwritten: '+key)
    for key in ('predictions','settlements','observations'):
        rows=candidate.get('scorecard',{}).get(key,[])
        if not isinstance(rows,list) or len({x.get('id') for x in rows})!=len(rows):raise ValueError('Invalid '+key)
        indexed={x['id']:x for x in rows}
        for x in current['scorecard'][key]:
            if indexed.get(x['id'])!=x:raise ValueError('Scorecard history cannot be overwritten')
    for item in candidate['timeline']:
        if item.get('person') not in ids:raise ValueError('Unknown person')
    item_ids={x['id'] for x in candidate['timeline']}
    for item in candidate.get('triage',[]):
        if item.get('itemId') not in item_ids or item.get('status') not in ('pending','followup','irrelevant','duplicate'):raise ValueError('Invalid review queue marker')
    return candidate

def observation_key(row):
    """Compare content independently of historical IDs and collection time."""
    return (row['symbol'].strip().upper(), row['date'], float(row['value']),
            row['currency'].strip().upper(), row.get('adjustment') or 'source_close', row['sourceUrl'])

def merge_observations(existing, incoming):
    known={observation_key(row) for row in existing};added=0
    for row in incoming:
        key=observation_key(row)
        if key in known:continue
        if any(old['id']==row['id'] for old in existing):row={**row,'id':uid('obs')}
        existing.append(row);known.add(key);added+=1
    return added

def csv_observations(text):
    rows=[]
    reader=csv.DictReader(io.StringIO(text.lstrip('\ufeff')))
    required={'symbol','date','value','currency','sourceUrl'}
    if not required.issubset(set(reader.fieldnames or [])):raise ValueError('CSV needs symbol,date,value,currency,sourceUrl columns')
    for r in reader:
        value=float(r['value'])
        if not (float('-inf')<value<float('inf')):raise ValueError('Price must be finite')
        d=date.fromisoformat(r['date']);url=r['sourceUrl'].strip()
        if d>today():raise ValueError('Observation date cannot be in the future')
        parsed=urlsplit(url)
        if parsed.scheme not in ('https','http') or not parsed.hostname or parsed.username or parsed.password:raise ValueError('Observation needs a public source URL')
        url=urlunsplit((parsed.scheme,parsed.netloc,parsed.path or '/',parsed.query,parsed.fragment))
        if not r['symbol'].strip() or not r['currency'].strip():raise ValueError('Observation needs symbol and currency/unit')
        numeric=str(int(value)) if value.is_integer() else str(value)
        symbol=r['symbol'].strip().upper();currency=r['currency'].strip().upper();adjustment=(r.get('adjustment') or '').strip() or 'source_close'
        rows.append({'id':'obs-'+fnv('|'.join((symbol,str(d),numeric,currency,adjustment,url))),'symbol':symbol,'date':str(d),'value':value,'currency':currency,'sourceUrl':url,'recordedAt':now(),'adjustment':adjustment})
    return rows

def trial_settlement(prediction,observations,as_of=None):
    due=date.fromisoformat(prediction['dueDate']);as_of=as_of or today()
    if as_of<due:return {'status':'not_due','reason':'尚未到期'}
    rule=prediction['rule'];start=due-timedelta(days=7)
    matches=[x for x in observations if x['symbol']==prediction['symbol'] and x.get('currency')==prediction['currency'] and x.get('adjustment','source_close')==rule.get('adjustment','source_close') and start<=date.fromisoformat(x['date'])<=due]
    if not matches:return {'status':'missing_data','reason':'没有到期日前7天内、同币种及同口径的结果数据'}
    end=max(matches,key=lambda x:(x['date'],x.get('recordedAt','')))
    value=end['value'];operator=rule['operator']
    if operator.startswith('return_'):
        base=rule.get('baseline')
        if base is None or base<=0:return {'status':'missing_data','reason':'缺少有效基准值'}
        value=(value/base-1)*100
    hit=value>=rule['threshold'] if operator.endswith('gte') else value<=rule['threshold']
    return {'status':'proposed','hit':hit,'value':value,'observationId':end['id'],'observationDate':end['date'],'sourceUrl':end['sourceUrl'],'reason':'按登记规则自动试算，待人工复核'}
