"""Resumable HTTPS download with a required SHA-256."""
import argparse, hashlib, os, time, urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('url'); p.add_argument('destination'); p.add_argument('sha256')
a = p.parse_args()
dest = Path(a.destination); dest.parent.mkdir(parents=True, exist_ok=True)
def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024*1024), b''): h.update(block)
    return h.hexdigest()
if dest.exists() and digest(dest) == a.sha256.lower():
    print('Already verified:', dest.name); raise SystemExit(0)
part = dest.with_name(dest.name + '.part')
for attempt in range(5):
    try:
        offset = part.stat().st_size if part.exists() else 0
        headers = {'User-Agent': 'Cline-AVX1-build', 'Accept-Encoding': 'identity'}
        if offset: headers['Range'] = f'bytes={offset}-'
        with urllib.request.urlopen(urllib.request.Request(a.url, headers=headers), timeout=90) as r:
            if offset and r.status == 206:
                if not r.headers.get('Content-Range', '').startswith(f'bytes {offset}-'):
                    raise RuntimeError('Invalid Content-Range')
            elif offset: offset = 0
            with part.open('ab' if offset else 'wb') as f:
                while block := r.read(1024*1024): f.write(block)
        break
    except Exception:
        if attempt == 4: raise
        time.sleep(2**attempt)
actual = digest(part)
if actual != a.sha256.lower(): raise RuntimeError(f'SHA-256 mismatch: {actual}')
os.replace(part, dest)
print('Verified:', dest.name, actual)
