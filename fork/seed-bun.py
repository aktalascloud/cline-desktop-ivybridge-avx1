import hashlib,shutil,subprocess,zipfile,os
from pathlib import Path
root=Path(__file__).resolve().parents[1]
python=__import__('sys').executable
for target,sha in [('linux-x64-baseline','c678040f14fe0440eb839d37cbd0ce4c051a32da72806ac97de6a6aab6bf728f'),('linux-aarch64','54328bbc2d9c8e0c9f892c544d66c57a83b84139e34909e5ee81758f1ac8fda7')]:
 archive=root/'.build-cache/downloads'/f'bun-{target}-1.4.2.zip'
 subprocess.run([python,str(root/'fork/download.py'),f'https://github.com/oven-sh/bun/releases/download/bun-v1.4.2/bun-{target}.zip',str(archive),sha],check=True)
 destination=Path(os.environ.get('BUN_INSTALL_CACHE_DIR', str(root/'.build-cache/bun')))/f'bun-{target}-v1.4.2';destination.parent.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(archive) as z, z.open(f'bun-{target}/bun') as src, destination.open('wb') as dst:shutil.copyfileobj(src,dst)
 if destination.read_bytes()[:4]!=b'\x7fELF':raise RuntimeError('Not ELF')
 print('Seeded',destination.name,hashlib.sha256(destination.read_bytes()).hexdigest(),flush=True)
