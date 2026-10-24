"""Fail before packaging if generated runtimes contain checkout paths or the signing secret."""
import base64, os, pathlib, sys
root=pathlib.Path(__file__).resolve().parents[1]
patterns=[]
for value in {str(root),str(root).replace('\\','/'),str(root).replace('\\','\\\\')}:
    patterns += [('checkout path',value.encode()),('checkout path',value.encode('utf-16le'))]
key=os.environ.get('TAURI_SIGNING_PRIVATE_KEY','').strip()
if key:
    patterns.append(('signing secret',key.encode()))
    try:patterns.append(('decoded signing secret',base64.b64decode(key,validate=True)))
    except ValueError:pass
overlap=max(len(value) for _,value in patterns)
count=0
for path in (root/'apps/examples/desktop-app/src-tauri/bin').rglob('*'):
    if not path.is_file():continue
    count+=1;tail=b''
    with path.open('rb') as stream:
        while block:=stream.read(4*1024*1024):
            data=tail+block
            for kind,value in patterns:
                if value and value in data:raise SystemExit(f'Bundle rejected: {kind} in {path.name}')
            tail=data[-overlap:]
print(f'Generated runtime privacy check passed ({count} files)')
