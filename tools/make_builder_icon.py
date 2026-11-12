"""Draw the Builder's icon: builder/icon.png (window) and builder/icon.ico (EXE).

A game card with a gold border and an arrow down (the PC game built into
a phone's). Original artwork, drawn here so it
can be changed; run it again after editing.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SIZE = 1024  # drawn large, scaled down for smooth edges

CARD = (38, 41, 52)
GOLD = (214, 172, 84)


def draw():
    """One upright card that fills the icon, a bold arrow down into a tray:
    readable at 16 px in a title bar."""
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(image)
    w = int(SIZE * 0.74)
    left, top, bottom = (SIZE - w) // 2, int(SIZE * 0.02), int(SIZE * 0.98)
    d.rounded_rectangle((left, top, left + w, bottom), radius=SIZE // 9, fill=GOLD)
    edge = SIZE // 16
    d.rounded_rectangle((left + edge, top + edge, left + w - edge, bottom - edge), radius=SIZE // 14, fill=CARD)
    cx, shaft = SIZE // 2, SIZE // 7
    arrow_top, head_top, tip = int(SIZE * 0.17), int(SIZE * 0.44), int(SIZE * 0.70)
    d.rectangle((cx - shaft // 2, arrow_top, cx + shaft // 2, head_top + 2), fill=GOLD)
    head = int(SIZE * 0.25)
    d.polygon([(cx - head, head_top), (cx + head, head_top), (cx, tip)], fill=GOLD)
    tray = int(SIZE * 0.24)
    d.rounded_rectangle((cx - tray, int(SIZE * 0.77), cx + tray, int(SIZE * 0.77) + shaft * 2 // 3), radius=shaft // 3, fill=GOLD)
    return image


def main():
    image = draw()
    image.resize((256, 256), Image.LANCZOS).save(ROOT / "builder/icon.png", optimize=True)
    image.resize((256, 256), Image.LANCZOS).save(
        ROOT / "builder/icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


if __name__ == "__main__":
    main()
