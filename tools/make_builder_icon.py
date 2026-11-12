"""Draw the Builder's icon: builder/icon.png (window) and builder/icon.ico (EXE).

Two game cards with a gold border on a dark tile, an arrow down on the front
one (the PC game built into a phone's). Original artwork, drawn here so it
can be changed; run it again after editing.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SIZE = 1024  # drawn large, scaled down for smooth edges

TILE = (27, 29, 36)
CARD_BACK = (52, 46, 40)
CARD = (38, 41, 52)
GOLD = (214, 172, 84)
GOLD_DARK = (150, 116, 52)


def card(size, fill, border):
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    w, h = size
    draw.rounded_rectangle((0, 0, w - 1, h - 1), radius=w // 9, fill=border)
    edge = w // 18
    draw.rounded_rectangle((edge, edge, w - 1 - edge, h - 1 - edge), radius=w // 12, fill=fill)
    return image


def draw():
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(image).rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=SIZE // 5, fill=TILE)
    cw, ch = int(SIZE * 0.42), int(SIZE * 0.58)
    back = card((cw, ch), CARD_BACK, GOLD_DARK).rotate(14, expand=True, resample=Image.BICUBIC)
    image.alpha_composite(back, (int(SIZE * 0.38), int(SIZE * 0.11)))
    front = card((cw, ch), CARD, GOLD)
    d = ImageDraw.Draw(front)
    # The arrow down into a tray: built for, and sent to, the phone.
    cx, top, bottom, shaft = cw // 2, int(ch * 0.20), int(ch * 0.62), cw // 9
    d.rectangle((cx - shaft // 2, top, cx + shaft // 2, bottom - shaft), fill=GOLD)
    head = int(cw * 0.24)
    d.polygon([(cx - head, bottom - head - shaft // 2), (cx + head, bottom - head - shaft // 2), (cx, bottom + shaft // 3)], fill=GOLD)
    tray_y, tray_w = int(ch * 0.78), int(cw * 0.30)
    d.rounded_rectangle((cx - tray_w, tray_y, cx + tray_w, tray_y + shaft), radius=shaft // 2, fill=GOLD)
    front = front.rotate(-8, expand=True, resample=Image.BICUBIC)
    image.alpha_composite(front, (int(SIZE * 0.13), int(SIZE * 0.22)))
    return image


def main():
    image = draw()
    image.resize((256, 256), Image.LANCZOS).save(ROOT / "builder/icon.png", optimize=True)
    image.resize((256, 256), Image.LANCZOS).save(
        ROOT / "builder/icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


if __name__ == "__main__":
    main()
