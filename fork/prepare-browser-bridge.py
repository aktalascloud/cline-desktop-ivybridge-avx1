import hashlib,json,pathlib,shutil,subprocess
root=pathlib.Path(__file__).resolve().parents[1];source=root/'fork/browser-bridge';target=root/'apps/examples/desktop-app/src-tauri/bin/browser-bridge';target.mkdir(parents=True,exist_ok=True)
flags=['--edition=2021','-C','opt-level=3','-C','lto=thin','-C','codegen-units=1','-C','target-cpu=ivybridge','-C','target-feature=-avx2,-fma,+crt-static','-C','strip=debuginfo',f'--remap-path-prefix={root}=/src/cline']
subprocess.run(['rustc',*flags,str(source/'native-host.rs'),'-o',str(target/'native-host.exe')],check=True)
pdb=target/'native-host.pdb'
if pdb.exists():pdb.unlink()
for name in ('native-host.mjs','privacy.mjs'):(target/name).write_bytes((source/name).read_bytes().replace(b'\r\n',b'\n'))
shutil.copytree(source/'extension',target/'extension',dirs_exist_ok=True)
files={path.relative_to(target).as_posix():hashlib.file_digest(path.open('rb'),'sha256').hexdigest() for path in target.rglob('*') if path.is_file() and path.name!='files.json'}
(target/'files.json').write_text(json.dumps({'files':files,'extension_id':'jaljomgoclehkemckjhifflhmlllfopc','host':'cloud.aktalas.cline_dsw','source_built_host_flags':[flag.replace(str(root),'<checkout>') for flag in flags],'credentials':'DPAPI CurrentUser encrypted inbox; no plaintext credential files'},indent=2),encoding='utf8')
print('Browser extension and restricted native host prepared')
