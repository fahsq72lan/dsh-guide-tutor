import glob, sys, wave, array, pathlib
import sherpa_onnx
root = str(pathlib.Path(__file__).resolve().parent.parent / "models" / "paraformer-small")
rec = sherpa_onnx.OfflineRecognizer.from_paraformer(
    paraformer=root + r"\model.int8.onnx",
    tokens=root + r"\tokens.txt",
    num_threads=2, sample_rate=16000, feature_dim=80, decoding_method="greedy_search",
)
files = sorted(glob.glob(root + r"\test_wavs\*.wav"))
print("wavs:", len(files))
for path in files[:2]:
    with wave.open(path, "rb") as f:
        rate = f.getframerate(); frames = f.readframes(f.getnframes()); channels = f.getnchannels()
    samples = array.array("h", frames)
    if channels == 2:
        samples = samples[::2]
    audio = [s / 32768.0 for s in samples]
    stream = rec.create_stream()
    stream.accept_waveform(rate, audio)
    rec.decode_stream(stream)
    print(path.split("\\")[-1], "->", repr(stream.result.text))
