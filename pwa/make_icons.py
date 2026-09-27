"""Generate the PWA icons from the map's own boot crest (golden "SU" tile on black).

    python3 pwa/make_icons.py            # writes pwa/icons/*.png

Needs Pillow. The icons are committed, so this only runs when the artwork changes.
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'icons')
SERIF = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
BG = (0, 0, 0)                                   # theme_color / background_color


def crest(size, tile_frac):
    """Black square with the golden crest tile centred; tile_frac = tile width / icon width."""
    S = 4 * size                                 # supersample, then downscale
    im = Image.new('RGB', (S, S), BG)
    tile = int(S * tile_frac)
    x0 = y0 = (S - tile) // 2
    grad = Image.new('RGB', (tile, tile))
    gd = ImageDraw.Draw(grad)
    stops = [(0.0, (0xf3, 0xcb, 0x62)), (0.6, (0xa9, 0x7c, 0x18)), (1.0, (0x6a, 0x4a, 0x0d))]
    for y in range(tile):                        # 160deg-ish vertical gradient, as in #boot .crest
        t = y / max(1, tile - 1)
        for i in range(len(stops) - 1):
            if stops[i][0] <= t <= stops[i + 1][0]:
                a, ca = stops[i]; b, cb = stops[i + 1]
                k = (t - a) / (b - a)
                col = tuple(int(ca[j] + (cb[j] - ca[j]) * k) for j in range(3))
                break
        gd.line([(0, y), (tile, y)], fill=col)
    mask = Image.new('L', (tile, tile), 0)
    r = int(tile * 0.24)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, tile - 1, tile - 1], radius=r, fill=255)
    im.paste(grad, (x0, y0), mask)
    d = ImageDraw.Draw(im)
    bw = max(2, int(tile * 0.03))
    d.rounded_rectangle([x0, y0, x0 + tile - 1, y0 + tile - 1], radius=r, outline=(0xff, 0xe6, 0xa0), width=bw)
    font = ImageFont.truetype(SERIF, int(tile * 0.42))
    text = 'SU'
    bx = d.textbbox((0, 0), text, font=font)
    tw, th = bx[2] - bx[0], bx[3] - bx[1]
    d.text((S / 2 - tw / 2 - bx[0], S / 2 - th / 2 - bx[1]), text, font=font, fill=(0x2a, 0x1c, 0x05))
    return im.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ('icon-192.png', 192, 0.78),
        ('icon-512.png', 512, 0.78),
        ('icon-maskable-512.png', 512, 0.58),    # inside the 80% maskable safe zone
        ('apple-touch-icon.png', 180, 0.70),     # iOS rounds the corners itself
        ('favicon-32.png', 32, 0.92),
    ]
    for name, size, frac in jobs:
        crest(size, frac).save(os.path.join(OUT, name), optimize=True)
        print('wrote', name)


if __name__ == '__main__':
    main()
