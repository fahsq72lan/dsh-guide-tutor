"""Fetch the two runtime wheels and unpack them into py/libs.

pip cannot write its unpack metadata inside this sandbox (EACCES) and the
default files.pythonhosted.org host stalls here, so the wheels are pulled from
a domestic mirror's simple index and unzipped by hand. asr.py picks them up
through PYTHONPATH.
"""

import html.parser
import json
import pathlib
import platform
import re
import sys
import time
import urllib.request
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
libs = root / "py" / "libs"
wheels = root / "py" / "wheels"
libs.mkdir(parents=True, exist_ok=True)
wheels.mkdir(parents=True, exist_ok=True)

python_tag = f"cp{sys.version_info.major}{sys.version_info.minor}"
target_arch = "win_amd64"

MIRRORS = [
    "https://pypi.tuna.tsinghua.edu.cn/simple/{name}/",
    "https://mirrors.aliyun.com/pypi/simple/{name}/",
    "https://pypi.org/simple/{name}/",
]


class Links(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        for key, value in attrs:
            if key == "href" and value:
                self.hrefs.append(value)


def index(name):
    last = None
    for template in MIRRORS:
        url = template.format(name=name)
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "python-urllib"})
            with urllib.request.urlopen(request, timeout=20) as response:
                text = response.read().decode("utf-8", "replace")
            parser = Links()
            parser.feed(text)
            if parser.hrefs:
                print(f"index {name} <- {url} ({len(parser.hrefs)} links)")
                return parser.hrefs
        except Exception as error:  # try the next mirror
            last = f"{type(error).__name__}: {error}"
            print(f"index failed {url}: {last}")
    raise SystemExit(f"no index for {name}: {last}")


def pick(name):
    hrefs = index(name)
    matches = []
    pure = []
    for href in hrefs:
        filename = href.split("#")[0].split("/")[-1]
        if not filename.endswith(".whl"):
            continue
        if target_arch not in filename:
            if "none-any" in filename and (python_tag in filename or "py3-none" in filename or "py2.py3" in filename):
                pure.append((filename, href.split("#")[0]))
            continue
        if python_tag in filename or "py3-none" in filename or "py2.py3" in filename:
            matches.append((filename, href.split("#")[0]))
    if not matches:
        matches = pure
    if not matches:
        raise SystemExit(f"{name}: no {target_arch}/{python_tag} wheel in index")

    def version_key(entry):
        parts = re.findall(r"\d+", entry[0].replace(name.replace("-", "_"), "", 1).split("-")[1] if "-" in entry[0] else "")
        return [int(p) for p in parts]

    preferred = [m for m in matches if python_tag in m[0]] or matches
    preferred.sort(key=version_key)
    return preferred[-1]


for package in ("sherpa-onnx", "sounddevice", "cffi", "pycparser"):
    filename, url = pick(package)
    if url.startswith("../"):
        url = "https://pypi.tuna.tsinghua.edu.cn/simple/" + url[3:]
    elif url.startswith("/"):
        url = "https://pypi.tuna.tsinghua.edu.cn" + url
    target = wheels / filename
    if target.exists() and target.stat().st_size > 0:
        try:
            with zipfile.ZipFile(target) as archive:
                archive.extractall(libs)
            print(f"skip {filename} (already downloaded)")
            continue
        except zipfile.BadZipFile:
            print(f"re-download {filename} (corrupt cached wheel, {target.stat().st_size} B)")
            target.unlink()
    print(f"download {filename}")
    print(f"         from {url[:140]}")
    started = time.time()
    with urllib.request.urlopen(url, timeout=60) as response, target.open("wb") as out:
        total = int(response.headers.get("content-length") or 0)
        done = 0
        while True:
            chunk = response.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
            done += len(chunk)
            if total:
                print(f"  {done/1048576:6.1f} / {total/1048576:6.1f} MiB", flush=True)
    print(f"  saved {target.name} {done/1048576:.1f} MiB in {time.time()-started:.0f}s")
    with zipfile.ZipFile(target) as archive:
        archive.extractall(libs)
    print(f"  unpacked into {libs}")

print(json.dumps({"libs": sorted(p.name for p in libs.iterdir())}, ensure_ascii=False))
