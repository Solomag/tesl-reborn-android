#!/usr/bin/env python3
"""Build a TextMeshPro 1.x SDF atlas for the Chinese characters of a translation.

The game's TMP is the old static-atlas version: it cannot rasterize a font at
run time, so the glyphs that its fonts lack are prepared here. The atlas is a
PNG whose alpha channel is the signed distance field; cjk.json carries the
FaceInfo and the TMP_Glyph table in atlas pixels (y from the top).
"""
import argparse
import json
import unicodedata
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import distance_transform_edt

SIZE, PADDING, SUPER, ATLAS = 30, 4, 4, 2048


def characters(translations):
    text = "".join(v for t in translations for v in json.loads(t.read_text(encoding="utf-8")).values())
    return sorted({c for c in text if ord(c) >= 0x80 and unicodedata.category(c) != "Mn" and not c.isspace()})


def sdf(mask):
    inside = distance_transform_edt(mask)
    outside = distance_transform_edt(~mask)
    spread = PADDING * SUPER
    value = np.clip((inside - outside) / spread * 0.5 + 0.5, 0, 1)
    h, w = value.shape
    value = value[: h - h % SUPER, : w - w % SUPER]
    value = value.reshape(h // SUPER, SUPER, w // SUPER, SUPER).mean(axis=(1, 3))
    return (value * 255).round().astype(np.uint8)


def build(font_path, chars):
    font = ImageFont.truetype(str(font_path), SIZE * SUPER)
    ascent, descent = font.getmetrics()
    alpha = np.zeros((ATLAS, ATLAS), np.uint8)
    glyphs, x, y, row = [], 1, 1, 0
    missing = []
    for c in chars:
        left, top, right, bottom = font.getbbox(c, anchor="ls")
        advance = font.getlength(c) / SUPER
        if right <= left or bottom <= top:
            missing.append(c)
            continue
        pad = PADDING * SUPER
        w, h = right - left + 2 * pad, bottom - top + 2 * pad
        w += -w % SUPER
        h += -h % SUPER
        image = Image.new("L", (w, h))
        ImageDraw.Draw(image).text((pad - left, pad - top), c, font=font, fill=255, anchor="ls")
        cell = sdf(np.asarray(image) > 127)
        ch, cw = cell.shape
        if x + cw + 1 > ATLAS:
            x, y, row = 1, y + row + 1, 0
        if y + ch + 1 > ATLAS:
            raise SystemExit(f"atlas full at {len(glyphs)} glyphs")
        alpha[y : y + ch, x : x + cw] = cell
        glyphs.append({
            "id": ord(c), "x": x + PADDING, "y": y + PADDING,
            "width": cw - 2 * PADDING, "height": ch - 2 * PADDING,
            "xOffset": left / SUPER, "yOffset": -top / SUPER,
            "xAdvance": advance, "scale": 1,
        })
        x += cw + 1
        row = max(row, ch)
    face = {
        "Name": "Noto Sans SC Medium", "PointSize": SIZE, "Scale": 1,
        "CharacterCount": len(glyphs), "LineHeight": (ascent + descent) / SUPER,
        "Baseline": 0, "Ascender": ascent / SUPER, "CapHeight": ascent / SUPER * 0.7,
        "Descender": -descent / SUPER, "CenterLine": 0,
        "SuperscriptOffset": ascent / SUPER, "SubscriptOffset": -descent / SUPER * 0.5,
        "SubSize": 0.5, "Underline": -descent / SUPER * 0.5,
        "UnderlineThickness": SIZE / 16, "strikethrough": ascent / SUPER * 0.35,
        "strikethroughThickness": SIZE / 16, "TabWidth": SIZE * 2,
        "Padding": PADDING, "AtlasWidth": ATLAS, "AtlasHeight": ATLAS,
    }
    used = y + row + 1
    return alpha, {"face": face, "glyphs": glyphs}, missing, used


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("font", type=Path, help="Noto Sans SC (SIL OFL) OTF/TTF")
    parser.add_argument("translations", type=Path, nargs="+", help="zh_cn.json zh_cn-login.json")
    parser.add_argument("--output", type=Path, default=Path("languages/zh_cn"))
    args = parser.parse_args()
    alpha, table, missing, used = build(args.font, characters(args.translations))
    args.output.mkdir(parents=True, exist_ok=True)
    rgba = np.zeros((ATLAS, ATLAS, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = alpha
    Image.fromarray(rgba, "RGBA").save(args.output / "cjk.png", optimize=True)
    (args.output / "cjk.json").write_text(json.dumps(table, separators=(",", ":")), encoding="utf-8")
    print(f"{len(table['glyphs'])} glyphs, {used}px of {ATLAS} rows used, missing: {''.join(missing)}")


if __name__ == "__main__":
    main()
