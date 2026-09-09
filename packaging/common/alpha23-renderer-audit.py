#!/usr/bin/env python3
import collections, json, pathlib, re, subprocess, sys, tempfile
from html.parser import HTMLParser
root = pathlib.Path(sys.argv[1]); overlay = root / 'app/server/overlay'
class Document(HTMLParser):
    def __init__(self): super().__init__(); self.ids=[]
    def handle_starttag(self, tag, attrs): self.ids += [v for k,v in attrs if k == 'id' and v]
scripts=0
with tempfile.TemporaryDirectory(prefix='alpha23-renderer-') as temp:
    for page in sorted(overlay.glob('*.html')):
        text=page.read_text(); doc=Document(); doc.feed(text)
        dup=[k for k,n in collections.Counter(doc.ids).items() if n>1]
        assert not dup, f'{page.name}: duplicate IDs {dup}'
        for attrs,body in re.findall(r'<script\b([^>]*)>(.*?)</script\s*>',text,re.S|re.I):
            if re.search(r'\bsrc\s*=',attrs) or not body.strip(): continue
            if re.search(r'type\s*=\s*["\']application/(?:ld\+)?json',attrs): json.loads(body); continue
            script=pathlib.Path(temp)/('inline.mjs' if 'module' in attrs else 'inline.cjs'); script.write_text(body)
            result=subprocess.run(['node','--check',str(script)],capture_output=True,text=True)
            assert result.returncode==0,f'{page.name}: {result.stderr}'; scripts+=1
    for file in overlay.glob('*.js'): subprocess.run(['node','--check',str(file)],check=True,capture_output=True)
    for file in overlay.glob('*.json'): json.loads(file.read_text())
main=(root/'app/electron/main.cjs').read_text(); preload=(root/'app/electron/preload.cjs').read_text()
registered=re.findall(r'ipcMain\.(handle|on|once)\(\s*["\']([^"\']+)',main)
dup=[k for k,n in collections.Counter(registered).items() if n>1]; assert not dup,f'duplicate IPC: {dup}'
for operation,channel in re.findall(r'ipcRenderer\.(invoke|send)\(\s*["\']([^"\']+)',preload):
    kinds=('handle',) if operation=='invoke' else ('on','once')
    assert any((kind,channel) in registered for kind in kinds),f'unhandled {operation}: {channel}'
functions=re.findall(r'^function\s+(\w+)\s*\(',main,re.M); assert len(functions)==len(set(functions))
for file in (root/'app/electron').rglob('*.cjs'):
    for dependency in re.findall(r'require\(\s*["\'](\.[^"\']+)["\']\s*\)',file.read_text()):
        target=file.parent/dependency; assert target.exists() or target.with_suffix('.js').exists(),f'{file.name}: missing {dependency}'
print(f'Alpha23 renderer/IPC audit passed: {scripts} inline scripts, {len(registered)} registrations')
