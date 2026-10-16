#!/usr/bin/env bash
# Reproducible Ghidra 12.1.4 installation for an isolated REA research host.
# Official assets only; strict checksum validation. Never upload analyzed binaries.
set -euo pipefail
VERSION=12.1.4
TAG=Ghidra_12.1.4_build
SHA256=ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db
DEST="${GHIDRA_INSTALL_ROOT:-$HOME/.local/opt/ghidra}"
command -v python3 >/dev/null || { echo 'Python 3 required' >&2; exit 2; }
command -v java >/dev/null || { echo 'JDK 25 required; java not found' >&2; exit 2; }
java_major="$(java -version 2>&1 | sed -n '1s/.*version "\([0-9]*\).*/\1/p')"
if [[ "$java_major" != 25 ]]; then
  echo "JDK 25 required for this official release; detected ${java_major:-unknown}." >&2
  exit 2
fi
python3 - "$DEST" "$TAG" "$VERSION" "$SHA256" <<'PY'
import hashlib, json, os, pathlib, re, shutil, sys, tempfile, urllib.request, zipfile
dest, tag, version, expected = sys.argv[1:]
root = pathlib.Path(dest).expanduser().resolve()
if root.exists():
    raise SystemExit(f'Refusing to overwrite existing destination: {root}')
api = 'https://api.github.com/repos/NationalSecurityAgency/ghidra/releases/tags/' + tag
with urllib.request.urlopen(urllib.request.Request(api, headers={'User-Agent':'itmounts-ghidra-installer'}), timeout=25) as resp:
    release = json.load(resp)
assets = [a for a in release.get('assets', []) if re.fullmatch(r'ghidra_' + re.escape(version) + r'_PUBLIC_\d{8}\.zip', a.get('name',''))]
if len(assets) != 1:
    raise SystemExit(f'Expected exactly one official release binary, got {len(assets)}')
asset = assets[0]
url = asset['browser_download_url']
if not url.startswith('https://github.com/NationalSecurityAgency/ghidra/releases/download/' + tag + '/'):
    raise SystemExit('Unexpected artifact download origin')
root.parent.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='itmounts-ghidra-') as temp:
    zpath = pathlib.Path(temp, 'release.zip')
    sha = hashlib.sha256()
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent':'itmounts-ghidra-installer'}), timeout=180) as response, zpath.open('wb') as out:
        while block := response.read(1024*1024):
            out.write(block)
            sha.update(block)
    if sha.hexdigest() != expected:
        raise SystemExit('Ghidra archive SHA-256 differs from official release checksum; aborted')
    with zipfile.ZipFile(zpath) as archive:
        entries = archive.infolist()
        if not entries or any(not pathlib.PurePosixPath(e.filename).parts or '..' in pathlib.PurePosixPath(e.filename).parts or e.filename.startswith('/') for e in entries):
            raise SystemExit('Unsafe archive paths')
        roots = {pathlib.PurePosixPath(e.filename).parts[0] for e in entries}
        if len(roots) != 1:
            raise SystemExit('Unexpected archive structure')
        extracted = pathlib.Path(temp, 'unpack')
        archive.extractall(extracted)
        source = extracted / next(iter(roots))
        if not (source/'support'/'analyzeHeadless').is_file():
            raise SystemExit('Missing official Ghidra headless analyzer')
        shutil.move(str(source), str(root))
print('Installed verified Ghidra at', root)
print('Run headless:', root/'support'/'analyzeHeadless')
PY
