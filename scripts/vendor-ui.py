import json, pathlib, subprocess, concurrent.futures
root=pathlib.Path(__file__).resolve().parents[1]
seen=set(); dependencies=set(); css=[]
urls=[f'https://www.fluidfunctionalism.com/r/{n}.json' for n in ['button','select','dialog','tabs','table']]+[f'https://tripwire.sh/r/{n}.json' for n in ['area-chart','bar-chart','radar-chart','avatar']]+['https://ui.nexvyn.dev/r/ratio-slider.json']
while urls:
 batch=list(dict.fromkeys(u for u in urls if u not in seen));urls=[]
 if not batch:break
 seen.update(batch)
 def fetch(u):
  raw=subprocess.check_output(['curl','-fLs','--max-time','25',u]);return u,json.loads(raw)
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
  for url,d in ex.map(fetch,batch):
   print(d['name'],flush=True);dependencies.update(d.get('dependencies',[]))
   for dep in d.get('registryDependencies',[]):
    if dep.startswith('http'):urls.append(dep)
   if d.get('css'):css.append(d['css'])
   for f in d.get('files',[]):
    p=f.get('target') or f['path']
    if p.startswith('registry/') and '/hooks/' in p:p='hooks/'+p.split('/')[-1]
    elif p.startswith('registry/radix/'):p='components/ui/'+p.split('/')[-1]
    elif p.startswith('registry/'):
     p=('lib/' if '/lib/' in p else 'components/ui/')+p.split('/')[-1]
    p=p.replace('@/','')
    dest=root/'frontend/src'/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(f['content'])
(root/'frontend/src/registry-css.json').write_text(json.dumps(css,indent=2))
p=root/'frontend/package.json';d=json.loads(p.read_text());d['dependencies'].update({dep:'latest' for dep in dependencies if dep not in d['dependencies']});p.write_text(json.dumps(d,indent=2)+'\n')
