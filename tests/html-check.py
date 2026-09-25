from html.parser import HTMLParser
from pathlib import Path
import re
class Page(HTMLParser):
 def __init__(self):super().__init__();self.ids=[];self.scripts=[];self.labels=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if 'id' in a:self.ids.append(a['id'])
  if tag=='script' and 'src' in a:self.scripts.append(a['src'])
  if tag=='label' and 'for' in a:self.labels.append(a['for'])
for file in Path('.').glob('*.html'):
 p=Page();p.feed(file.read_text());assert len(p.ids)==len(set(p.ids)),f'Duplicate IDs: {file}'
 assert all(x in p.ids for x in p.labels),f'Broken labels: {file}'
 if any(x.startswith(('app.js','admin.js')) for x in p.scripts):
  assert next(i for i,s in enumerate(p.scripts) if s.startswith('store-core.js'))<next(i for i,s in enumerate(p.scripts) if s.startswith(('app.js','admin.js')))
 for script in p.scripts:
  if not script.startswith('https:'):assert Path(script.split('?')[0]).is_file(),script
print('PASS: unique IDs, label targets, script presence and dependency order on every page')
