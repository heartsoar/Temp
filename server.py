#!/usr/bin/env python3
"""Local-only research desk server; Python 3.9+, standard library only."""
from __future__ import annotations
import argparse
import json
import secrets
import socketserver
import sys
import threading
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'tools'))
from model import DATA,read_state,write_state,file_lock,validate_state
from fetch_feeds import download,fetch_source

TOKEN=secrets.token_urlsafe(32)
CACHE={};LOCK=threading.Lock()

class Handler(BaseHTTPRequestHandler):
    server_version='InvestorRadar/2.0'
    def allowed(self,write=False):
        port=self.server.server_port
        if self.headers.get('Host') not in (f'127.0.0.1:{port}',f'localhost:{port}'):
            self.reply(403,{'error':'Host not allowed'},cors=False);return False
        origin=self.headers.get('Origin')
        if origin not in (None,'null',f'http://127.0.0.1:{port}',f'http://localhost:{port}'):
            self.reply(403,{'error':'Origin not allowed'},cors=False);return False
        if write and not secrets.compare_digest(self.headers.get('X-Radar-Token',''),TOKEN):
            self.reply(403,{'error':'Local session token missing; reconnect the local service'});return False
        return True
    def reply(self,code,value,mime='application/json; charset=utf-8',cors=True,extra=None):
        body=value if isinstance(value,bytes) else json.dumps(value,ensure_ascii=False).encode('utf-8')
        self.send_response(code);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
        if cors and self.headers.get('Origin'):
            self.send_header('Access-Control-Allow-Origin',self.headers['Origin']);self.send_header('Vary','Origin')
        self.send_header('Access-Control-Allow-Private-Network','true')
        for k,v in (extra or {}).items():self.send_header(k,v)
        self.end_headers()
        try:self.wfile.write(body)
        except (BrokenPipeError,ConnectionResetError):pass
    def do_OPTIONS(self):
        if self.allowed():self.reply(204,b'','text/plain',extra={'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Radar-Token'})
    def do_GET(self):
        if not self.allowed():return
        path=urllib.parse.urlsplit(self.path)
        if path.path in ('/','/index.html','/investor-radar.html'):
            self.reply(200,(ROOT/'index.html').read_bytes(),'text/html; charset=utf-8')
        elif path.path=='/api/health':self.reply(200,{'service':'investor-radar','version':'2.0','token':TOKEN})
        elif path.path=='/api/state':
            try:self.reply(200,read_state())
            except Exception as e:self.reply(500,{'error':str(e)})
        elif path.path=='/api/feed':
            url=urllib.parse.parse_qs(path.query).get('url',[''])[0]
            try:
                with LOCK:cached=CACHE.get(url)
                import time
                if cached and time.time()-cached[0]<600:body=cached[1]
                else:
                    state=read_state();host=urllib.parse.urlsplit(url).hostname
                    body,_,_=download(url,state['settings'].get('secUserAgent','') if host in ('www.sec.gov','data.sec.gov') else '')
                    with LOCK:
                        if len(CACHE)>=200:CACHE.pop(next(iter(CACHE)))
                        CACHE[url]=(time.time(),body)
                self.reply(200,body,'application/xml; charset=utf-8')
            except Exception as e:self.reply(502,{'error':str(e)})
        elif path.path=='/favicon.ico':self.reply(204,b'','image/x-icon')
        else:self.reply(404,{'error':'Not found'})
    def do_POST(self):
        if not self.allowed(write=True):return
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size<=0 or size>25*1024*1024:raise ValueError('Request size exceeds limit')
            payload=json.loads(self.rfile.read(size))
            if self.path=='/api/state':
                with file_lock():
                    current=read_state()
                    if payload.get('expectedRevision')!=current['revision']:
                        self.reply(409,{'error':'本地文件版本已有更新；先同步档案再保存，旧文件未覆盖','revision':current['revision']});return
                    candidate=validate_state(payload.get('state',{}),current)
                    candidate['revision']=current['revision'];write_state(candidate)
                    self.reply(200,{'revision':candidate['revision']})
            elif self.path=='/api/source':
                source=payload.get('source',{})
                if source.get('type')!='edgar':raise ValueError('Only the EDGAR source adapter is supported here')
                if source.get('person') not in {p['id'] for p in read_state()['people']}:raise ValueError('Unknown person')
                if not source.get('expectedName') or not source.get('cik'):raise ValueError('SEC source needs legal entity name and CIK')
                expected='https://data.sec.gov/submissions/CIK'+str(source['cik']).zfill(10)+'.json'
                if source.get('url')!=expected:raise ValueError('SEC CIK and URL do not match')
                state=read_state();state['settings']['secUserAgent']=payload.get('userAgent','');self.reply(200,fetch_source(source,state))
            else:self.reply(404,{'error':'Not found'})
        except Exception as e:self.reply(400,{'error':str(e)})
    def log_message(self,format,*args):print(self.command+' '+urllib.parse.urlsplit(self.path).path,flush=True)

class Server(ThreadingHTTPServer):
    daemon_threads=True
    def server_bind(self):
        socketserver.TCPServer.server_bind(self);self.server_name='localhost';self.server_port=self.socket.getsockname()[1]

def main():
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8765);p.add_argument('--no-browser',action='store_true');a=p.parse_args()
    try:server=Server(('127.0.0.1',a.port),Handler)
    except OSError as e:print('Unable to start:',e);return 1
    url=f'http://127.0.0.1:{a.port}/';print('Investor Research Desk 2.0:',url,flush=True);print('Keep this window open. Ctrl+C stops the service.',flush=True)
    if not a.no_browser:threading.Timer(.5,lambda:webbrowser.open(url)).start()
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
    return 0
if __name__=='__main__':sys.exit(main())
