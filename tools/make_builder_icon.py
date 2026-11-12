"""Draw the Builder's icon: builder/icon.png (window) and builder/icon.ico (EXE).

A gold game card on a deep blue tile with an arrow down cut into it (the PC
game built into a phone's). Original artwork, drawn here so it can be
changed; run it again after editing.
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SIZE = 1024  # drawn large, scaled down for smooth edges

TILE_TOP, TILE_BOTTOM = (52, 72, 132), (18, 24, 52)
GOLD_TOP, GOLD_BOTTOM = (255, 222, 138), (196, 138, 46)
INK = (22, 28, 58)


def gradient(size, top, bottom):
    w, h = size
    column = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / (h - 1)
        column.putpixel((0, y), tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
    return column.resize((w, h)).convert("RGBA")


def shape(box, radius):
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=radius, fill=255)
    return mask


def draw():
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    tile = shape((0, 0, SIZE - 1, SIZE - 1), SIZE // 5)
    image.paste(gradient((SIZE, SIZE), TILE_TOP, TILE_BOTTOM), (0, 0), tile)
    # The card, with a soft shadow under it.
    w, h = int(SIZE * 0.50), int(SIZE * 0.70)
    left, top = (SIZE - w) // 2, (SIZE - h) // 2
    card_box = (left, top, left + w, top + h)
    radius = SIZE // 14
    shadow = shape((left + SIZE // 40, top + SIZE // 25, left + w + SIZE // 40, top + h + SIZE // 25), radius)
    shadow = shadow.filter(ImageFilter.GaussianBlur(SIZE // 40))
    dark = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    dark.putalpha(ImageChops.multiply(shadow, Image.new("L", (SIZE, SIZE), 150)))
    image.alpha_composite(dark)
    card = shape(card_box, radius)
    # The arrow and tray are cut out of the card in the tile's ink.
    cut = Image.new("L", (SIZE, SIZE), 0)
    d = ImageDraw.Draw(cut)
    cx, shaft = SIZE // 2, int(SIZE * 0.105)
    d.rounded_rectangle((cx - shaft // 2, top + int(h * 0.15), cx + shaft // 2, top + int(h * 0.55)), radius=shaft // 3, fill=255)
    head, head_top, tip = int(w * 0.33), top + int(h * 0.45), top + int(h * 0.72)
    d.polygon([(cx - head, head_top), (cx + head, head_top), (cx, tip)], fill=255)
    tray_w, tray_y = int(w * 0.30), top + int(h * 0.80)
    d.rounded_rectangle((cx - tray_w, tray_y, cx + tray_w, tray_y + int(shaft * 0.62)), radius=shaft // 3, fill=255)
    image.paste(gradient((SIZE, SIZE), GOLD_TOP, GOLD_BOTTOM), (0, 0), card)
    ink = Image.new("RGBA", (SIZE, SIZE), INK + (255,))
    image.paste(ink, (0, 0), ImageChops.multiply(cut, card))
    # A thin highlight along the card's top edge.
    edge = ImageChops.subtract(card, shape((left, top + SIZE // 120, left + w, top + h), radius))
    light = Image.new("RGBA", (SIZE, SIZE), (255, 246, 214, 0))
    light.putalpha(ImageChops.multiply(edge, Image.new("L", (SIZE, SIZE), 200)))
    image.alpha_composite(light)
    return image


def main():
    image = draw()
    small = image.resize((256, 256), Image.LANCZOS)
    small.save(ROOT / "builder/icon.png", optimize=True)
    small.save(ROOT / "builder/icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


if __name__ == "__main__":
    main()
