"""Run the daily collector with a local log, without shell command construction."""
import subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
with (root/'fetch-log.txt').open('w',encoding='utf-8') as log:
    result=subprocess.run([sys.executable,str(root/'tools/fetch_feeds.py'),'--all','--prices','--brief'],cwd=root,stdout=log,stderr=subprocess.STDOUT)
sys.exit(result.returncode)
