"""One-shot microphone capture + sherpa-onnx transcription.

Run by the guide-tutor host plugin: records a single utterance (energy based
endpointing, capped at --max-seconds), transcribes it with a local Paraformer
model and prints one JSON object on stdout.

    python asr.py --model model.int8.onnx --tokens tokens.txt --max-seconds 8

Exit code is always 0 when the JSON could be produced; the host inspects "ok".
"""

import argparse
import json
import sys
import time

import numpy as np


def emit(payload):
    # ASCII-escaped JSON: the parent process decodes stdout as UTF-8, while a
    # Windows child python would otherwise encode Chinese as GBK and turn the
    # transcript into mojibake / U+FFFD.
    sys.stdout.write(json.dumps(payload, ensure_ascii=True) + "\n")
    sys.stdout.flush()


def record(sample_rate, max_seconds, silence_ms, min_seconds):
    import sounddevice as sd

    block = int(sample_rate * 0.03)  # 30 ms
    threshold_floor = 0.006
    frames = []
    noise = []
    silent_blocks = max(1, int(silence_ms / 1000 / 0.03))
    started = False
    silent_run = 0
    speech_run = 0
    deadline = time.time() + max_seconds + 3.0

    stream = sd.InputStream(samplerate=sample_rate, channels=1, dtype="float32", blocksize=block)
    stream.start()
    try:
        while time.time() < deadline:
            data, _overflow = stream.read(block)
            chunk = np.asarray(data, dtype=np.float32).reshape(-1)
            frames.append(chunk)
            rms = float(np.sqrt(np.mean(np.square(chunk)) + 1e-12))
            if not started:
                noise.append(rms)
                if len(noise) <= 12:  # ~360 ms of room tone
                    continue
                base = float(np.median(noise))
                threshold = max(threshold_floor, base * 2.5)
                speech_run = speech_run + 1 if rms > threshold else 0
                if speech_run >= 3:
                    started = True
                continue
            if rms > threshold * 0.8:
                silent_run = 0
            else:
                silent_run += 1
                if silent_run >= silent_blocks:
                    break
            if len(frames) * 0.03 >= max_seconds:
                break
    finally:
        stream.stop()
        stream.close()

    if not frames:
        return None, 0.0
    audio = np.concatenate(frames)
    seconds = len(audio) / float(sample_rate)
    if not started or seconds < min_seconds:
        return None, seconds
    peak = float(np.max(np.abs(audio)))
    return audio, seconds if peak > 0 else (None, seconds)


def transcribe(audio, sample_rate, model, tokens, threads):
    import sherpa_onnx

    recognizer = sherpa_onnx.OfflineRecognizer.from_paraformer(
        paraformer=model,
        tokens=tokens,
        num_threads=threads,
        sample_rate=sample_rate,
        feature_dim=80,
        decoding_method="greedy_search",
        debug=False,
    )
    stream = recognizer.create_stream()
    stream.accept_waveform(sample_rate, audio)
    recognizer.decode_stream(stream)
    result = getattr(stream, "result", None)
    if result is not None:
        return getattr(result, "text", "") or ""
    return recognizer.get_result(stream).text


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--tokens", required=True)
    parser.add_argument("--max-seconds", type=float, default=8.0)
    parser.add_argument("--silence-ms", type=int, default=700)
    parser.add_argument("--min-seconds", type=float, default=0.5)
    parser.add_argument("--sample-rate", type=int, default=16000)
    parser.add_argument("--threads", type=int, default=2)
    args = parser.parse_args()

    try:
        audio, seconds = record(args.sample_rate, args.max_seconds, args.silence_ms, args.min_seconds)
    except Exception as error:  # no microphone, missing PortAudio, ...
        emit({"ok": False, "error": f"record failed: {error}"})
        return
    if audio is None:
        emit({"ok": False, "error": "no speech detected", "seconds": round(seconds, 2)})
        return
    try:
        text = transcribe(audio, args.sample_rate, args.model, args.tokens, args.threads)
    except Exception as error:
        emit({"ok": False, "error": f"transcribe failed: {error}", "seconds": round(seconds, 2)})
        return
    emit({"ok": True, "text": text.strip(), "seconds": round(seconds, 2)})


if __name__ == "__main__":
    main()
