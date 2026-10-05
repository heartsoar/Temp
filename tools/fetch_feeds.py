#!/usr/bin/env python3
"""Public RSS/Atom/EDGAR collector. Python 3.9+, no pip dependencies."""
from __future__ import annotations
import argparse
import concurrent.futures
import email.utils
import ipaddress
import json
import re
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from model import DATA, now, fnv, fingerprint, read_state, write_state, file_lock, ingest, csv_observations, merge_observations, trial_settlement, uid

MAX_BYTES=3*1024*1024
SEC_LOCK=threading.Lock();SEC_LAST=0.0
KNOWN={('nav.al','/feed'),('awealthofcommonsense.com','/feed/'),('feeds.feedburner.com','/collabfund'),('data.sec.gov','/submissions/CIK0001067983.json')}

def validate_url(url):
    u=urllib.parse.urlsplit(url)
    if u.scheme!='https' or not u.hostname or u.username or u.password or u.port not in (None,443):raise ValueError('只支持不带凭据的公开HTTPS地址')
    host=u.hostname.lower()
    if host=='localhost' or host.endswith(('.local','.localhost')):raise ValueError('不支持私网地址')
    try:
        ip=ipaddress.ip_address(host)
        if not ip.is_global:raise ValueError('不支持私网或保留IP')
    except ValueError as e:
        if '不支持' in str(e):raise
    if (host,u.path) not in KNOWN and not (host=='news.google.com' and u.path.startswith('/rss/')) and not (host=='www.sec.gov' and u.path.startswith('/Archives/edgar/')) and not (host=='data.sec.gov' and re.fullmatch(r'/submissions/CIK\d{10}\.json',u.path)):
        addresses=socket.getaddrinfo(host,443,type=socket.SOCK_STREAM)
        if any(not ipaddress.ip_address(x[4][0]).is_global for x in addresses):raise ValueError('不支持私网或保留地址')
    return url

class Redirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        validate_url(newurl);return super().redirect_request(req,fp,code,msg,headers,newurl)

def download(url,ua='',previous=None,timeout=16):
    validate_url(url)
    if urllib.parse.urlsplit(url).hostname in ('www.sec.gov','data.sec.gov'):
        if '@' not in ua:raise ValueError('SEC采集需在设置中填写真实名称与联系邮箱的User-Agent')
        global SEC_LAST
        with SEC_LOCK:
            gap=1-(time.monotonic()-SEC_LAST)
            if gap>0:time.sleep(gap)
            SEC_LAST=time.monotonic()
    headers={'User-Agent':ua or 'InvestorRadar/2.0 (personal public RSS reader)','Accept-Encoding':'identity','Accept':'application/rss+xml, application/atom+xml, application/xml, application/json, text/csv, */*;q=0.1'}
    for key,header in [('etag','If-None-Match'),('lastModified','If-Modified-Since')]:
        if previous and previous.get(key):headers[header]=previous[key]
    request=urllib.request.Request(url,headers=headers)
    try:
        with urllib.request.build_opener(Redirects()).open(request,timeout=timeout) as r:
            b=r.read(MAX_BYTES+1)
            if len(b)>MAX_BYTES:raise ValueError('来源超过3MB')
            return b,{'etag':r.headers.get('ETag'),'lastModified':r.headers.get('Last-Modified')},False
    except urllib.error.HTTPError as e:
        if e.code==304:return b'',{},True
        raise

class TextOnly(HTMLParser):
    def __init__(self):super().__init__();self.parts=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'):self.skip+=1
    def handle_endtag(self,tag):
        if tag in ('script','style'):self.skip=max(0,self.skip-1)
    def handle_data(self,data):
        if not self.skip:self.parts.append(data)
def plain(s):
    p=TextOnly();p.feed(str(s or '')[:30000]);return re.sub(r'\s+',' ',' '.join(p.parts)).strip()
def date_text(s):
    if not s:return None
    try:
        d=email.utils.parsedate_to_datetime(s)
    except (TypeError,ValueError):
        try:d=datetime.fromisoformat(s.strip().replace('Z','+00:00'))
        except ValueError:return None
    if d.tzinfo is None:d=d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
def local(tag):return tag.rsplit('}',1)[-1]

def parse_feed(body,source):
    if b'<!ENTITY' in body.upper() or b'<!DOCTYPE' in body.upper():raise ValueError('RSS包含不支持的DTD声明')
    root=ET.fromstring(body)
    if local(root.tag) not in ('rss','feed','RDF'):raise ValueError('来源返回普通网页，非RSS / Atom')
    result=[]
    for item in root.iter():
        if local(item.tag) not in ('item','entry'):continue
        def field(*names):
            for name in names:
                for c in item:
                    if local(c.tag)==name:return ''.join(c.itertext()).strip()
            return ''
        title=plain(field('title'));url=field('link')
        for c in item:
            if local(c.tag)=='link' and c.get('rel','alternate')=='alternate' and c.get('href'):url=c.get('href');break
        if not title or not url.startswith(('http://','https://')):continue
        author=plain(field('creator','author'))
        if source.get('authorFilter') and (not author or source['authorFilter'].casefold() not in author.casefold()):continue
        pub=date_text(field('pubDate','published','updated','date'));desc=plain(field('description','summary','encoded','content'))[:1800]
        institution=source.get('attribution')=='institution';holding=bool(re.search(r'\b13[FDG]\b|holdings|持仓|增持|减持|清仓',title,re.I))
        summary=('公开报道摘要：' if source['type']=='news' else '订阅摘要：')+desc if desc else '来源未提供摘要，请阅读原文及上下文。'
        record={'person':source['person'],'sourceId':source['id'],'title':title,'summary':summary,'url':url,'source':field('source') or source['name'],'kind':'institution' if institution else 'holding' if holding else 'lead','evidenceLevel':source.get('evidenceLevel','L0'),'verification':'pending','statementDate':None,'publishedAt':pub,'recordedAt':now(),'author':author,'topic':'未分类','target':'','horizon':'','stance':'unassigned','revisionOf':None}
        record['rootId']=source['id']+'-'+fnv(url);record['id']=record['rootId']+'-'+fingerprint(record)
        result.append(record)
        if len(result)>=100:break
    return result

def edgar_records(body,source):
    data=json.loads(body);expected=source.get('expectedName','')
    if expected and data.get('name','').casefold()!=expected.casefold():raise ValueError('CIK与预期法律主体名称不匹配；请核对映射')
    cik=str(int(data['cik']));recent=data.get('filings',{}).get('recent',{});records=[]
    for i,form in enumerate(recent.get('form',[])):
        if form not in source.get('forms',['13F-HR','13F-HR/A']):continue
        accession=recent['accessionNumber'][i];primary=recent['primaryDocument'][i];pub=recent['filingDate'][i];report=recent.get('reportDate',['']*len(recent['form']))[i]
        url=f'https://www.sec.gov/Archives/edgar/data/{cik}/{accession.replace("-","")}/{primary}'
        rec={'id':source['id']+'-'+accession,'rootId':source['id']+'-'+accession,'person':source['person'],'sourceId':source['id'],'title':data['name']+' · '+form+' · '+pub,'summary':f'机构监管备案；报告期 {report or "未提供"}，提交日期 {pub}。此条不代表所关联人物的完整个人仓位或市场观点。13F不覆盖股票空头。','url':url,'source':'SEC EDGAR · '+data['name'],'kind':'institution','evidenceLevel':'L4','verification':'source_checked','statementDate':None,'publishedAt':pub+'T12:00:00.000Z','dateOnly':True,'reportDate':report or None,'recordedAt':now(),'topic':'监管披露','target':'','horizon':'','stance':'unassigned','revisionOf':None}
        records.append(rec)
        if len(records)>=30:break
    return records

def fetch_source(source,state,timeout=16):
    prev=state.get('sourceStatuses',{}).get(source['id'],{});attempt=now()
    try:
        body,meta,unchanged=download(source['url'],state['settings'].get('secUserAgent','') if source['type']=='edgar' else '',prev,timeout)
        rows=[] if unchanged else edgar_records(body,source) if source['type']=='edgar' else parse_feed(body,source)
        return {'sourceId':source['id'],'records':rows,'status':{**prev,**meta,'ok':True,'lastAttempt':attempt,'lastSuccess':now(),'count':len(rows),'unchanged':unchanged,'error':None}}
    except Exception as e:
        return {'sourceId':source['id'],'records':[],'status':{**prev,'ok':False,'lastAttempt':attempt,'error':type(e).__name__+': '+str(e)}}

def collect(ids=None,all_people=False,timeout=16,data=DATA):
    state=read_state(data);wanted=set(ids or (p['id'] for p in state['people']) if all_people else ids or state['favorites'])
    sources=[s for s in state['sources'] if s['person'] in wanted and s.get('enabled') and s['type'] in ('news','rss','edgar')]
    results=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures={pool.submit(fetch_source,s,state,timeout):s for s in sources}
        for fut in concurrent.futures.as_completed(futures):
            r=fut.result();results.append(r);print(r['sourceId']+': '+('OK '+str(len(r['records'])) if r['status']['ok'] else r['status']['error']),flush=True)
    with file_lock(data):
        current=read_state(data);added=0
        for r in results:
            n=ingest(current,r['records']);added+=n;current['sourceStatuses'][r['sourceId']]={**r['status'],'added':n}
        write_state(current,data)
    return {'sources':len(results),'succeeded':sum(r['status']['ok'] for r in results),'added':added,'results':results}

def run_prices(data=DATA):
    state=read_state(data);observations=[];errors=[]
    for source in state['settings'].get('priceSources',[]):
        if not source.get('enabled'):continue
        try:
            body,_,_=download(source['url']);observations+=csv_observations(body.decode('utf-8-sig'))
        except Exception as e:errors.append(source['name']+': '+str(e))
    with file_lock(data):
        state=read_state(data);added=merge_observations(state['scorecard']['observations'],observations)
        for pred in state['scorecard']['predictions']:
            settlements=[s for s in state['scorecard']['settlements'] if s.get('predictionId')==pred['id']]
            if settlements and settlements[-1].get('status') in ('confirmed','unresolvable'):continue
            result=trial_settlement(pred,state['scorecard']['observations'])
            if result['status']=='proposed' and not any(s.get('predictionId')==pred['id'] and s.get('observationId')==result['observationId'] for s in state['scorecard']['settlements']):state['scorecard']['settlements'].append({'id':uid('settle'),'predictionId':pred['id'],'recordedAt':now(),**result})
        state['priceStatus']={'checkedAt':now(),'added':added,'errors':errors};write_state(state,data)
    return {'added':added,'errors':errors}

def main():
    p=argparse.ArgumentParser();p.add_argument('--all',action='store_true');p.add_argument('--person',action='append');p.add_argument('--timeout',type=int,default=16);p.add_argument('--prices',action='store_true');p.add_argument('--brief',action='store_true');p.add_argument('--import-prices');p.add_argument('--data-dir',type=Path,default=DATA);a=p.parse_args()
    if a.import_prices:
        rows=csv_observations(Path(a.import_prices).read_text(encoding='utf-8-sig'))
        with file_lock(a.data_dir):
            state=read_state(a.data_dir);merge_observations(state['scorecard']['observations'],rows);write_state(state,a.data_dir)
    else:print(json.dumps({k:v for k,v in collect(a.person,a.all,a.timeout,a.data_dir).items() if k!='results'},ensure_ascii=False))
    if a.prices:print(json.dumps(run_prices(a.data_dir),ensure_ascii=False))
    if a.brief:
        from brief import write_digest
        print('Daily digest:',write_digest(read_state(a.data_dir),a.data_dir.parent/'reports'))
if __name__=='__main__':main()
