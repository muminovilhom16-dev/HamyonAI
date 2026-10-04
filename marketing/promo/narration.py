"""Uzbek voice-over for promo.html → narration.wav (25 s, 48 kHz stereo).

Each line is synthesized separately and placed in its scene's window; a line
that runs long is sped up slightly (max 1.2x) to fit.

    pip install edge-tts
    python3 marketing/promo/narration.py                  # Microsoft "Sardor" (uz-UZ male, free)
    python3 marketing/promo/narration.py --engine espeak  # offline robotic placeholder, for timing only
    python3 marketing/promo/narration.py --voice uz-UZ-MadinaNeural   # female voice

render.mjs mixes narration.wav in automatically when it exists.
"""
import argparse
import asyncio
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
DURATION = 25.0

# (start, end, text). The text is what the voice says: "AI" is written as it
# is pronounced in Uzbek ("Ey-Ay"), numbers are spelled out.
LINES = [
    (0.15, 2.40, "Pulingiz qayerga ketyapti?"),
    (2.50, 4.90, "Jadval kerak emas. Bitta xabar kifoya."),
    (5.00, 7.10, "Hamyon Ey-Ay — Telegramdagi aqlli hamyon."),
    (7.20, 11.80, "Shunchaki yozing: taksi, yigirma besh ming. Bot o'zi hisoblaydi."),
    (11.90, 15.45, "Bitta tugma — kunlik, haftalik va oylik hisobot."),
    (15.55, 19.40, "Limitlar, qarzlar, to'lovlar, maqsadlar — hammasi bir joyda."),
    (19.50, 22.05, "Grafiklar telefonda ham, kompyuterda ham."),
    (22.15, 24.85, "Hamyon Ey-Ay. Telegramda bepul boshlang!"),
]
MAX_TEMPO = 1.25


def run(*cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True,
    )
    return float(out.stdout.strip())


async def synth_edge(text, path, voice, rate, pitch):
    # edge-tts pins certifi; honour a custom CA bundle (e.g. a TLS-inspecting proxy).
    ca = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
    if ca:
        import certifi
        certifi.where = lambda: ca
    import edge_tts
    await edge_tts.Communicate(text, voice, rate=rate, pitch=pitch).save(str(path))


def synth(text, path, args):
    if args.engine == "espeak":
        run("espeak-ng", "-v", "uz", "-s", "165", "-p", "35", "-w", str(path), text)
    else:
        asyncio.run(synth_edge(text, path, args.voice, args.rate, args.pitch))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", choices=["edge", "espeak"], default="edge")
    ap.add_argument("--voice", default="uz-UZ-SardorNeural")
    ap.add_argument("--rate", default="+5%")
    ap.add_argument("--pitch", default="-2Hz")
    ap.add_argument("--out", default=str(HERE / "narration.wav"))
    args = ap.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        inputs, filters = [], []
        for i, (start, end, text) in enumerate(LINES):
            raw = Path(tmp) / f"l{i}.{'wav' if args.engine == 'espeak' else 'mp3'}"
            synth(text, raw, args)
            # Trim the synthesizer's leading/trailing silence before measuring.
            clean = Path(tmp) / f"c{i}.wav"
            run("ffmpeg", "-y", "-i", str(raw), "-af",
                "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                "silenceremove=start_periods=1:start_threshold=-50dB,areverse",
                "-ar", "48000", "-ac", "1", str(clean))
            d = duration(clean)
            window = end - start
            tempo = min(MAX_TEMPO, max(1.0, d / window))
            fitted = d / tempo
            flag = "  ⚠ still too long" if fitted > window + 0.05 else ""
            print(f"{start:5.2f}s  {d:4.2f}s → x{tempo:.2f} ({fitted:4.2f}/{window:.2f}s){flag}  {text}")
            inputs += ["-i", str(clean)]
            ms = int(start * 1000)
            filters.append(f"[{i}:a]atempo={tempo:.3f},adelay={ms}|{ms}[v{i}]")

        n = len(LINES)
        mix = "".join(f"[v{i}]" for i in range(n))
        voice_fx = (
            # Warm, broadcast-style male voice: cut rumble, a little body and presence, even level.
            "highpass=f=75,equalizer=f=160:t=q:w=1:g=2,equalizer=f=3200:t=q:w=1.2:g=2.5,"
            "acompressor=threshold=-20dB:ratio=3:attack=8:release=120:makeup=3dB,"
            "aecho=0.8:0.6:28|47:0.10|0.06"  # a touch of room so it does not sound dry
        )
        graph = ";".join(filters) + f";{mix}amix=inputs={n}:normalize=0,{voice_fx},apad,atrim=0:{DURATION},aformat=sample_rates=48000:channel_layouts=stereo[out]"
        run("ffmpeg", "-y", *inputs, "-filter_complex", graph, "-map", "[out]", "-c:a", "pcm_s16le", args.out)
    print(f"narration → {args.out}")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        sys.exit(e.stderr.decode(errors="replace")[-2000:])
