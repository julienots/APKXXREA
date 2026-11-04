"""Génère l'icône de lancement (mipmap) de Poker Coach : jeton vert + pique doré."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), '..', 'app', 'src', 'main', 'res')
SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}


def draw(size):
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([S * .02, S * .02, S * .98, S * .98], fill=(15, 42, 31))
    d.ellipse([S * .08, S * .08, S * .92, S * .92], outline=(233, 185, 73), width=int(S * .035))
    gold = (233, 185, 73)
    cx, cy, r = S / 2, S * .47, S * .15
    # pique : deux cercles + triangle + pied
    d.ellipse([cx - r * 2.0, cy - r * .2, cx - r * .0, cy + r * 1.8], fill=gold)
    d.ellipse([cx + r * .0, cy - r * .2, cx + r * 2.0, cy + r * 1.8], fill=gold)
    d.polygon([(cx, cy - r * 2.2), (cx - r * 2.0, cy + r * .75), (cx + r * 2.0, cy + r * .75)], fill=gold)
    d.polygon([(cx, cy + r * .6), (cx - r * .9, cy + r * 2.5), (cx + r * .9, cy + r * 2.5)], fill=gold)
    return im.resize((size, size), Image.LANCZOS)


for dens, px in SIZES.items():
    out = os.path.join(ROOT, 'mipmap-' + dens)
    os.makedirs(out, exist_ok=True)
    draw(px).save(os.path.join(out, 'ic_launcher.png'))
print('icônes générées')
