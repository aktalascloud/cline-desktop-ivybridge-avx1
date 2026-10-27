"""Conservative license inventory including build and optional dependencies."""
import json,re,shutil,os,urllib.request,subprocess,tomllib
from pathlib import Path
base=Path(__file__).resolve().parents[1];root=base;out=root/'apps/examples/desktop-app/src-tauri/licenses';out.mkdir(exist_ok=True)
rows=[]
# Cached packages from earlier cycles must not enter a new package inventory.
lock_script = '''import ts from "typescript";const x=ts.parseConfigFileTextToJson("bun.lock",await Bun.file("bun.lock").text());if(x.error)throw Error("Invalid lockfile");console.log(JSON.stringify(Object.values(x.config.packages).map(v=>v[0])));'''
npm_specs=json.loads(subprocess.check_output(['bun','-e',lock_script],cwd=root,text=True,encoding='utf-8'))
allowed_npm={tuple(spec.rsplit('@',1)) for spec in npm_specs if isinstance(spec,str) and '@' in spec}
cargo_lock=tomllib.loads((root/'apps/examples/desktop-app/src-tauri/Cargo.lock').read_text('utf-8'))
allowed_cargo={(p['name'],p['version']) for p in cargo_lock['package']}
if out.is_symlink() or not out.resolve().is_relative_to(root.resolve()):raise RuntimeError('License output redirects outside source')
managed=[]
def collect(package,version,directory,kind):
 texts=[]
 for p in directory.iterdir():
  if p.is_file() and re.match(r'(?i)^(licen[cs]e|copying|notice|authors|copyright)([.\-_]|$)',p.name):
   try:texts.append(p.name+'\n'+p.read_text('utf-8',errors='replace'))
   except OSError:pass
 rows.append({'package':package,'version':version,'scope':kind,'notice_files':len(texts)})
 if texts:
  name=re.sub(r'[^a-zA-Z0-9._-]','_',package+'-'+version+'-'+kind)+'.txt'
  (out/name).write_text('\n\n'.join(texts),encoding='utf-8');managed.append(name)
for store in sorted((root/'node_modules/.bun').iterdir()):
 deps=store/'node_modules'
 if not deps.is_dir():continue
 for d in sorted(deps.iterdir()):
  candidates=list(d.iterdir()) if d.is_dir() and d.name.startswith('@') else [d]
  for package in candidates:
   p=package/'package.json'
   if not p.is_file() or package.is_symlink():continue
   try:meta=json.loads(p.read_text('utf-8'))
   except (OSError,ValueError):continue
   if (meta.get('name'),meta.get('version')) not in allowed_npm:continue
   if not any(r['package']==meta.get('name') and r['version']==meta.get('version') and r['scope']=='npm' for r in rows):collect(meta.get('name',package.name),meta.get('version','unknown'),package,'npm')
for registry in (Path(os.environ.get('CARGO_HOME',str(Path.home()/'.cargo')))/'registry/src').glob('*'):
 for crate in sorted(registry.iterdir()):
  if crate.is_dir():
   name,_,version=crate.name.rpartition('-')
   if (name,version) in allowed_cargo:collect(name,version,crate,'cargo')
for old in out.iterdir():
 if old.is_file() and old.name.endswith(('-npm.txt','-cargo.txt')) and old.name not in managed:
  if old.is_symlink() or not old.resolve().is_relative_to(out.resolve()):raise RuntimeError('Managed notice path escape')
  old.unlink()
shutil.copyfile(root/'LICENSE',out/'Cline-Apache-2.0.txt')
shutil.copyfile(root/'apps/examples/desktop-app/src-tauri/nsis/LICENSE.tauri-MIT',out/'Tauri-installer-MIT.txt')
(out/'INDEX.json').write_text(json.dumps(rows,indent=2)+'\n',encoding='utf-8')
(out/'README.txt').write_text('Cline Desktop AVX1 RU is an unofficial Apache-2.0 fork of https://github.com/cline/cline.\nCorresponding source: https://github.com/aktalascloud/cline-desktop-ivybridge-avx1\nThis conservative notice inventory includes build, test and optional dependencies; listing does not imply that all are redistributed.\nBun is a prebuilt upstream runtime; see Bun-NOTICE.txt for its bundled third-party notices. WebView2 is a Microsoft system runtime and is not rebuilt here.\n',encoding='utf-8')
print('License inventory',len(rows),'packages',sum(r['notice_files']>0 for r in rows),'with notices')

# Upstream's own runtime license statement and corresponding source/relinking notes.
for name,url in {
 'Bun-LICENSE.md':'https://raw.githubusercontent.com/oven-sh/bun/744846f844374847c902b5e7fd59b4342a51ef99/LICENSE.md',
 'JavaScriptCore-LGPL-2.0.txt':'https://raw.githubusercontent.com/oven-sh/WebKit/2e2aa2290fac856d6f451ceacb58f7f5b44dd057/Source/JavaScriptCore/COPYING.LIB',
 'Bun-uSockets-Apache-2.0.txt':'https://raw.githubusercontent.com/oven-sh/bun/744846f844374847c902b5e7fd59b4342a51ef99/packages/bun-usockets/LICENSE',
 'Bun-uWebSockets-Apache-2.0.txt':'https://raw.githubusercontent.com/oven-sh/bun/744846f844374847c902b5e7fd59b4342a51ef99/packages/bun-uws/LICENSE'
 ,'Rust-MIT.txt':'https://raw.githubusercontent.com/rust-lang/rust/1.97.0/LICENSE-MIT'
 ,'Rust-Apache-2.0.txt':'https://raw.githubusercontent.com/rust-lang/rust/1.97.0/LICENSE-APACHE'
 ,'Rust-COPYRIGHT.txt':'https://raw.githubusercontent.com/rust-lang/rust/1.97.0/COPYRIGHT'
}.items():
 request=urllib.request.Request(url,headers={'User-Agent':'Cline-AVX1-build'})
 with urllib.request.urlopen(request,timeout=60) as response: (out/name).write_bytes(response.read())
(out/'Bun-NOTICE.txt').write_text('Bun 1.4.2 (744846f84) is embedded unchanged. Its upstream license statement, linked-library inventory and WebKit relinking instructions are in Bun-LICENSE.md.\nCorresponding Bun source: https://github.com/oven-sh/bun/tree/bun-v1.4.2\nCorresponding WebKit/JSC source: https://github.com/oven-sh/WebKit/tree/2e2aa2290fac856d6f451ceacb58f7f5b44dd057\nTo replace the runtime, build that Bun source with your modified WebKit and rerun the CLI embedding recipe from this fork. All application and CLI source is available in this fork. No local Ivy Bridge compilation flags are attributed to prebuilt Bun/JSC.\n',encoding='utf-8')
