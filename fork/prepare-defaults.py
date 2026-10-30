from pathlib import Path
import hashlib,json,stat,subprocess,sys,zipfile
root=Path(__file__).resolve().parents[1];source=root/'fork/defaults';dest=root/'apps/examples/desktop-app/src-tauri/bin/defaults';dest.mkdir(exist_ok=True)
files={}
for name in ('ponytail.md','PONYTAIL-LICENSE.txt','ponytail-source.json','free-web-search.py','defaults.json','python-runtime.json'):
 path=source/name
 if path.is_symlink() or path.is_junction() or not path.is_file():raise RuntimeError('Invalid bundled default resource')
 data=path.read_bytes().replace(b'\r\n',b'\n');(dest/name).write_bytes(data);files[name]=hashlib.sha256(data).hexdigest()
runtime=json.loads((source/'python-runtime.json').read_text('utf8'))
archive=root/'.build-cache/python'/runtime['url'].rsplit('/',1)[-1];archive.parent.mkdir(parents=True,exist_ok=True)
subprocess.run([sys.executable,str(root/'fork/download.py'),runtime['url'],str(archive),runtime['sha256']],check=True)
python=dest/'python';python.mkdir(exist_ok=True)
if python.is_symlink() or python.is_junction() or any(p.is_symlink() or p.is_junction() for p in python.rglob('*')):raise RuntimeError('Python resource link refused')
with zipfile.ZipFile(archive) as zipped:
 for entry in zipped.infolist():
  if Path(entry.filename).is_absolute() or '..' in Path(entry.filename).parts or ':' in entry.filename or stat.S_ISLNK(entry.external_attr>>16):raise RuntimeError('Unsafe Python archive member')
  target=python/entry.filename
  if not target.resolve().is_relative_to(python.resolve()):raise RuntimeError('Python archive path escape')
  if entry.is_dir():target.mkdir(parents=True,exist_ok=True)
  else:target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(zipped.read(entry))
(python/'python314._pth').write_text('python314.zip\n.\n',encoding='utf8')
subprocess.run([str(python/'python.exe'),'-I','-B','-c','import ssl,json; print("Bundled Python stdlib ready")'],check=True)
for path in python.rglob('*'):
 if path.is_file():files[path.relative_to(dest).as_posix()]=hashlib.sha256(path.read_bytes()).hexdigest()
(dest/'files.json').write_text(json.dumps({'files':files,'source_normalization':'CRLF to LF for source text; official prebuilt Python unchanged except isolated search path'},indent=2),encoding='utf8')
print('Bundled Ponytail and stdlib-only free search prepared')
