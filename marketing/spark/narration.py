"""Uzbek voice-over for spark.html → narration.wav (15 s, 48 kHz stereo).

Reuses the synthesis/mixing of ../promo/narration.py with this video's lines.
Each line sits in its scene's window; a long line is sped up (max 1.25x).

    pip install edge-tts
    python3 marketing/spark/narration.py                          # "Sardor" (uz-UZ male)
    python3 marketing/spark/narration.py --voice uz-UZ-MadinaNeural

render.mjs mixes narration.wav in automatically when it exists.
"""
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("promo_narration", HERE.parent / "promo" / "narration.py")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

base.HERE = HERE  # default --out → marketing/spark/narration.wav
base.DURATION = 15.0
# (start, end, text) — windows follow the scenes in spark.html. "AI" is written
# as pronounced ("Ey-Ay"); short lines leave room for the effects to breathe.
base.LINES = [
    (0.20, 3.00, "Pulni nazorat qilish — bitta xabardan boshlanadi."),
    (3.40, 5.40, "Xarajatni yozasiz — nazoratni olasiz."),
    (5.70, 7.20, "Natija — o'sish."),
    (7.50, 10.00, "Har bir so'm — aniq hisobda."),
    (10.30, 12.60, "Chunki pul topishda emas — nazoratda."),
    (12.95, 14.90, "Hamyon Ey-Ay. Telegramda bepul."),
]

if __name__ == "__main__":
    base.main()
