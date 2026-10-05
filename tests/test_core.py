"""Offline regression checks: python -m unittest discover -s tests -v."""
import copy
import json
import sys
import tempfile
import unittest
import threading
import urllib.request
import urllib.error
from datetime import date
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
sys.path.insert(0,str(ROOT))
from model import (read_state, validate_state, write_state, file_lock, ingest,
                   csv_observations, merge_observations, trial_settlement)
from fetch_feeds import parse_feed, fetch_source, run_prices

class CoreChecks(unittest.TestCase):
    def setUp(self):
        self.state=read_state(ROOT/'data')

    def test_registry_and_history(self):
        self.assertEqual(len(self.state['people']),41)
        validate_state(copy.deepcopy(self.state),self.state)
        broken=copy.deepcopy(self.state);broken['timeline'].pop()
        with self.assertRaises(ValueError):validate_state(broken,self.state)
        broken=copy.deepcopy(self.state);broken['timeline'][0]['summary']='replaced'
        with self.assertRaises(ValueError):validate_state(broken,self.state)

    def test_revision_and_previous_snapshot(self):
        with tempfile.TemporaryDirectory() as folder:
            data=Path(folder);state=copy.deepcopy(self.state);revision=state['revision']
            with file_lock(data):write_state(state,data)
            self.assertEqual(read_state(data)['revision'],revision+1)
            with file_lock(data):write_state(state,data)
            previous=json.loads((data/'state.previous.json').read_text())
            self.assertEqual(previous['revision'],revision+1)
            for name in ('people','sources','timeline','scorecard'):
                self.assertEqual(json.loads((data/(name+'.json')).read_text()),state[name])

    def test_rss_repeats_and_revision(self):
        source={'id':'test-rss','person':'marks','name':'Test','type':'rss'}
        xml=b'<rss><channel><item><title>Example</title><link>https://example.org/article</link><description>Original</description></item></channel></rss>'
        rows=parse_feed(xml,source);state={'timeline':[]}
        self.assertEqual(ingest(state,rows),1)
        self.assertEqual(ingest(state,parse_feed(xml,source)),0)
        changed=parse_feed(xml.replace(b'Original',b'Revised'),source)
        self.assertEqual(ingest(state,changed),1)
        self.assertEqual(state['timeline'][1]['revisionOf'],state['timeline'][0]['id'])
        self.assertIn('Original',state['timeline'][0]['summary'])
        source['authorFilter']='Howard Marks'
        self.assertEqual(parse_feed(xml,source),[])
        with self.assertRaises(ValueError):parse_feed(b'<html>not RSS</html>',source)

    def test_failed_fetch_preserves_success_time(self):
        source=self.state['sources'][0]
        self.state['sourceStatuses'][source['id']]={'ok':True,'lastSuccess':'2026-09-01T00:00:00Z'}
        with patch('fetch_feeds.download',side_effect=OSError('offline')):
            result=fetch_source(source,self.state)
        self.assertFalse(result['status']['ok'])
        self.assertEqual(result['status']['lastSuccess'],'2026-09-01T00:00:00Z')
        self.assertEqual(result['records'],[])

    def test_currency_and_adjustment_deduplication(self):
        header='symbol,date,value,currency,sourceUrl,adjustment\n'
        rows=csv_observations(header+
            ' spy ,2026-01-02,100, usd ,https://example.org/data,source_close\n'+
            'SPY,2026-01-02,100,CNY,https://example.org/data,source_close\n'+
            'SPY,2026-01-02,100,USD,https://example.org/data,adjusted_close\n')
        self.assertEqual(len({r['id'] for r in rows}),3)
        existing=[];self.assertEqual(merge_observations(existing,rows),3)
        existing[0]['id']='old-format-id';original=copy.deepcopy(existing)
        self.assertEqual(merge_observations(existing,copy.deepcopy(rows)),0)
        self.assertEqual(existing,original)
        with self.assertRaises(ValueError):csv_observations(header+'SPY,2026-01-02,100,USD,https://,source_close\n')

    def test_settlement_uses_currency_and_locked_calendar(self):
        pred={'id':'test-pred','symbol':'SPY','currency':'USD','dueDate':'2026-01-05',
              'rule':{'operator':'gte','threshold':100,'adjustment':'source_close'}}
        rows=csv_observations('symbol,date,value,currency,sourceUrl,adjustment\n'+
            'SPY,2026-01-04,99,USD,https://example.org/price,source_close\n'+
            'SPY,2026-01-05,500,CNY,https://example.org/price,source_close\n')
        self.assertEqual(trial_settlement(pred,rows,date(2026,1,4))['status'],'not_due')
        result=trial_settlement(pred,rows,date(2026,1,5))
        self.assertFalse(result['hit']);self.assertEqual(result['value'],99)
        pred['currency']='JPY'
        self.assertEqual(trial_settlement(pred,rows,date(2026,1,5))['status'],'missing_data')

    def test_scheduled_prices_retains_unresolvable(self):
        state=copy.deepcopy(self.state)
        pred={'id':'test-pred','person':'marks','symbol':'SPY','currency':'USD','dueDate':'2026-01-05',
              'rule':{'operator':'gte','threshold':100,'adjustment':'source_close'}}
        state['scorecard']={'predictions':[pred],'observations':csv_observations(
            'symbol,date,value,currency,sourceUrl,adjustment\nSPY,2026-01-05,101,USD,https://example.org/price,source_close\n'),
            'settlements':[{'id':'reviewed','predictionId':'test-pred','status':'unresolvable','note':'noncomparable'}]}
        state['settings']['priceSources']=[]
        with tempfile.TemporaryDirectory() as folder:
            data=Path(folder)
            with file_lock(data):write_state(state,data)
            result=run_prices(data)
            self.assertEqual(result['added'],0)
            self.assertEqual(read_state(data)['scorecard']['settlements'],state['scorecard']['settlements'])

    def test_local_api_revision_conflict_and_history_guard(self):
        import server
        with tempfile.TemporaryDirectory() as folder:
            data=Path(folder)
            with file_lock(data):write_state(copy.deepcopy(self.state),data)
            with patch.object(server,'read_state',lambda:read_state(data)), \
                 patch.object(server,'file_lock',lambda:file_lock(data)), \
                 patch.object(server,'write_state',lambda state:write_state(state,data)):
                service=server.Server(('127.0.0.1',0),server.Handler)
                worker=threading.Thread(target=service.serve_forever,daemon=True);worker.start()
                base='http://127.0.0.1:'+str(service.server_port)
                def request(path,payload=None,token=server.TOKEN):
                    headers={'X-Radar-Token':token,'Content-Type':'application/json'}
                    req=urllib.request.Request(base+path,headers=headers,data=json.dumps(payload).encode() if payload is not None else None)
                    try:
                        with urllib.request.urlopen(req) as response:return response.status,json.load(response)
                    except urllib.error.HTTPError as error:return error.code,json.load(error)
                try:
                    code,state=request('/api/state');self.assertEqual(code,200)
                    revision=state['revision']
                    code,result=request('/api/state',{'expectedRevision':revision,'state':state})
                    self.assertEqual(code,200);self.assertEqual(result['revision'],revision+1)
                    self.assertEqual(request('/api/state',{'expectedRevision':revision,'state':state})[0],409)
                    current=read_state(data);broken=copy.deepcopy(current);broken['timeline'].pop()
                    self.assertEqual(request('/api/state',{'expectedRevision':current['revision'],'state':broken})[0],400)
                    self.assertEqual(read_state(data),current)
                    self.assertEqual(request('/api/state',{'expectedRevision':0,'state':{}},token='wrong')[0],403)
                finally:
                    service.shutdown();service.server_close();worker.join()

if __name__=='__main__':unittest.main()
