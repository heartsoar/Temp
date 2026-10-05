"""Rebuild the zero-dependency HTML from packaged source files."""
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def markdown_html(text):
    # Our own fixed methodology document, rendered without external libraries.
    import html
    rows=[];table=[];in_list=False
    def flush_table():
        nonlocal table
        if not table:return
        cells=[line.strip().strip('|').split('|') for line in table]
        rows.append('<div class="table-wrap"><table class="table"><thead><tr>'+''.join('<th>'+html.escape(c.strip())+'</th>' for c in cells[0])+'</tr></thead><tbody>')
        for row in cells[2:]:rows.append('<tr>'+''.join('<td>'+html.escape(c.strip())+'</td>' for c in row)+'</tr>')
        rows.append('</tbody></table></div>');table=[]
    for line in text.splitlines():
        if line.startswith('|'):table.append(line);continue
        flush_table()
        if not line.strip():continue
        escaped=html.escape(line)
        escaped=re.sub(r'(https://[^\s。]+)',lambda m:'<a target="_blank" rel="noopener noreferrer" href="'+m.group(1)+'">'+m.group(1)+'</a>',escaped)
        if line.startswith('# '):rows.append('<h2>'+html.escape(line[2:])+'</h2>')
        elif line.startswith('## '):rows.append('<h3>'+html.escape(line[3:])+'</h3>')
        else:rows.append('<p>'+escaped+'</p>')
    flush_table();return '<div class="box">'+''.join(rows)+'</div>'

source=(ROOT/'app-template.html').read_text(encoding='utf-8')
css=(ROOT/'base.css').read_text(encoding='utf-8')
state=json.loads((ROOT/'data/state.json').read_text(encoding='utf-8'))
source=source.replace('/* BASE_CSS */',css).replace('/* UX_CSS */',(ROOT/'ui.css').read_text(encoding='utf-8')).replace('/* PREMIUM_CSS */',(ROOT/'premium.css').read_text(encoding='utf-8')).replace('/* DESK_CSS */',(ROOT/'desk.css').read_text(encoding='utf-8')).replace('/* METHODOLOGY_HTML */',markdown_html((ROOT/'方法论.md').read_text(encoding='utf-8')+'\n\n'+(ROOT/'更新计划.md').read_text(encoding='utf-8'))).replace('/* BUNDLED_STATE */','const BUNDLED = '+json.dumps(state,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')+';').replace('/* APP_JS */',((ROOT/'app.js').read_text(encoding='utf-8')+'\n'+(ROOT/'ui.js').read_text(encoding='utf-8')+'\n'+(ROOT/'premium.js').read_text(encoding='utf-8')+'\n'+(ROOT/'desk.js').read_text(encoding='utf-8')).replace('</script','<\\/script'))
(ROOT/'index.html').write_text(source,encoding='utf-8')
print('Built index.html',len(source.encode()),'bytes')
