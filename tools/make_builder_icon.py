"""Make the Builder's icon files from tools/builder-icon.jpg (a square picture):
builder/icon.png for the window, builder/icon.ico for the EXE.

The picture gets rounded corners; the small sizes are sharpened a little so
the arrow stays crisp in a title bar. Replace the JPEG and run this again.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SIZES = [16, 24, 32, 48, 64, 128, 256]


def rounded(image):
    size = image.width
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=size * 18 // 100, fill=255)
    image = image.convert("RGBA")
    image.putalpha(mask)
    return image


def at(image, size):
    small = image.resize((size, size), Image.LANCZOS)
    if size <= 48:
        small = small.filter(ImageFilter.UnsharpMask(radius=1, percent=80, threshold=2))
    return small


def main():
    source = Image.open(ROOT / "tools/builder-icon.jpg").convert("RGB")
    side = min(source.size)
    source = source.crop(((source.width - side) // 2, (source.height - side) // 2,
                          (source.width + side) // 2, (source.height + side) // 2))
    icon = rounded(source)
    at(icon, 256).save(ROOT / "builder/icon.png", optimize=True)
    images = [at(icon, size) for size in SIZES]
    images[-1].save(ROOT / "builder/icon.ico", sizes=[(s, s) for s in SIZES], append_images=images[:-1])


if __name__ == "__main__":
    main()
