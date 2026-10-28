"""Frozen Node runtime for reliable process-owned Chromium pipe transport."""
import hashlib,json,os,pathlib,shutil,subprocess,sys,zipfile
root=pathlib.Path(__file__).resolve().parents[1];source=root/'fork/browser-login';target=root/'apps/examples/desktop-app/src-tauri/bin/browser-login';cache=pathlib.Path(os.environ.get('CLINE_BROWSER_DOWNLOAD_CACHE',root/'.build-cache/browser-login'))
lock=json.loads((source/'runtime-lock.json').read_text(encoding='utf8'));cache.mkdir(parents=True,exist_ok=True)
archive=cache/'node-v24.20.0-win-x64.zip'
subprocess.run([sys.executable,str(root/'fork/download.py'),lock['archive']['url'],str(archive),lock['archive']['sha256']],check=True)
target.mkdir(parents=True,exist_ok=True)
if target.is_symlink() or target.is_junction():raise RuntimeError('Browser runtime target must not be a link')
with zipfile.ZipFile(archive) as package:
 for name in ('node.exe','LICENSE'):
  incoming=package.read('node-v24.20.0-win-x64/'+name);(target/name).write_bytes(incoming)
(target/'login.mjs').write_bytes((source/'login.mjs').read_bytes().replace(b'\r\n',b'\n'))
subprocess.run([str(target/'node.exe'),'--version'],check=True)
files={path.name:hashlib.file_digest(path.open('rb'),'sha256').hexdigest() for path in target.iterdir() if path.is_file() and path.name!='manifest.json'}
(target/'manifest.json').write_text(json.dumps({'node':lock,'files':files,'browser':'Windows default Chromium browser; isolated private profile; inherited pipes only','local_optimization_flags':[]},indent=2),encoding='utf8')
print('Frozen browser-login runtime prepared; no system browser/settings modified')
