"""Download and extract the offline ASR model used by guide-tutor.

    python download_model.py

Pulls the small Chinese Paraformer export from the sherpa-onnx GitHub release
and unpacks it next to this script under ../models.
"""

import pathlib
import sys
import tarfile
import urllib.request

URL = (
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"
    "sherpa-onnx-paraformer-zh-small-2024-03-09.tar.bz2"
)

root = pathlib.Path(__file__).resolve().parent.parent
models = root / "models"
models.mkdir(parents=True, exist_ok=True)
archive = models / "sherpa-onnx-paraformer-zh-small-2024-03-09.tar.bz2"


def report(done, total):
    if total:
        pct = done * 100 // total
        sys.stdout.write(f"\rdownloading {pct:3d}% ({done // 1048576} MiB)")
        sys.stdout.flush()


if not archive.exists():
    print(f"fetching {URL}")
    with urllib.request.urlopen(URL, timeout=60) as response, archive.open("wb") as out:
        total = int(response.headers.get("content-length") or 0)
        done = 0
        while True:
            chunk = response.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
            done += len(chunk)
            report(done, total)
    print()

with tarfile.open(archive, "r:bz2") as tar:
    tar.extractall(models)

for model in sorted(models.rglob("model*.onnx")):
    print("model:", model)
for tokens in sorted(models.rglob("tokens.txt")):
    print("tokens:", tokens)
