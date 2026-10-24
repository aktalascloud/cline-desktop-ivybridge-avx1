import os,subprocess,sys,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
archive=root/'.build-cache/downloads/nsis-3.13.zip'
subprocess.run([sys.executable,str(root/'fork/download.py'),'https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.13/nsis-3.13.zip',str(archive),'ba63dffc4410ee89193e1cb5a41989991bd77c61068da17e3156d136b7b0b3d8'],check=True)
directory=root/'.build-cache/nsis'
directory.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(archive) as z:
 for item in z.infolist():
  target=(directory/item.filename).resolve()
  if not target.is_relative_to(directory.resolve()):raise RuntimeError('Archive path leaves tool directory')
 z.extractall(directory)
print('NSIS 3.13 archive verified; compiler is in .build-cache/nsis/nsis-3.13/')
