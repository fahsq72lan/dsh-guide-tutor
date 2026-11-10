"""Edge TTS 合成器：把一句话合成为 mp3，供 native/tts.ps1 播放。

文本走环境变量（`GUIDE_TTS_TEXT`），不走命令行——Windows 上命令行参数会被
某些启动器按控制台代码页解码，中文会坏掉。

用法（由 tts.ps1 调用）：
    GUIDE_TTS_TEXT=... GUIDE_TTS_VOICE=zh-CN-XiaoxiaoNeural \\
    python tts_edge.py --out C:\\temp\\x.mp3 --rate 0

成功：stdout 一行 {"type":"file","path":"..."}，退出码 0
失败：stdout 一行 {"type":"error","message":"..."}，退出码 1
"""

import argparse
import asyncio
import json
import os
import sys

DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural"


def emit(payload):
    # ensure_ascii=True：路径里可能有中文用户名，输出纯 ASCII 的 \\uXXXX，
    # 就不会被 Windows 控制台代码页（GBK）二次编码成乱码。
    sys.stdout.write(json.dumps(payload, ensure_ascii=True) + "\n")
    sys.stdout.flush()


async def synthesize(text, voice, out_path, rate, volume):
    import edge_tts  # 延迟导入：缺包时能给出可读的报错

    kwargs = {}
    if rate:
        kwargs["rate"] = f"{rate:+d}%"
    if volume is not None and volume != 100:
        # edge-tts 用相对音量（-100% ~ +100%），SAPI 是绝对 0-100
        kwargs["volume"] = f"{int(volume) - 100:+d}%"
    communicate = edge_tts.Communicate(text, voice, **kwargs)
    await communicate.save(out_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--voice", default="")
    parser.add_argument("--rate", type=int, default=0)
    parser.add_argument("--volume", type=int, default=100)
    args = parser.parse_args()

    text = os.environ.get("GUIDE_TTS_TEXT", "").strip()
    if not text:
        emit({"type": "error", "message": "empty text"})
        return 2

    voice = (os.environ.get("GUIDE_TTS_VOICE") or args.voice or DEFAULT_VOICE).strip()
    if not voice or voice.lower().startswith("microsoft "):
        # 宿主可能把 SAPI 的显示名（Microsoft Huihui Desktop）传过来，那不是 Edge 的 voice id
        voice = DEFAULT_VOICE

    try:
        asyncio.run(synthesize(text, voice, args.out, args.rate, args.volume))
    except Exception as exc:  # noqa: BLE001 - 需要把任何失败都变成一行 JSON
        emit({"type": "error", "message": f"{type(exc).__name__}: {exc}"[:300]})
        return 1

    if not os.path.exists(args.out) or os.path.getsize(args.out) < 800:
        emit({"type": "error", "message": "edge tts produced no audio"})
        return 1

    emit({"type": "file", "path": args.out})
    return 0


if __name__ == "__main__":
    sys.exit(main())
