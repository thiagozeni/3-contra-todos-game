#!/usr/bin/env python3
# Vídeo do cinegrafista sobre magenta → sprite-sheet horizontal transparente.
# Chroma key magenta → extrai N frames → autocrop (bbox-união) → tira horizontal PNG.
# Uso: uv run --with pillow python3 _cam_sheet.py <in.mp4> <out.png> [N]
import subprocess, os, glob, sys
from PIL import Image, ImageFilter
import numpy as np


def despill_magenta(im):
    """Neutraliza spill magenta + erode 1px do alpha (tira a franja rosa de borda)."""
    a = np.array(im).astype(np.int16)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    # magenta/rosa = verde é o menor canal e R+B o dominam (spill na lente/bordas).
    mask = (al > 0) & (r > g + 8) & (b > g + 8)
    a[..., 0] = np.where(mask, g, r)
    a[..., 2] = np.where(mask, g, b)
    out = Image.fromarray(a.astype(np.uint8), 'RGBA')
    # Erode o alpha 1px → remove a franja de anti-aliasing entre objeto e croma.
    alpha = out.split()[3].filter(ImageFilter.MinFilter(3))
    out.putalpha(alpha)
    return out

IN, OUT = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 14
SIM = sys.argv[4] if len(sys.argv) > 4 else '0.30'
BLEND = sys.argv[5] if len(sys.argv) > 5 else '0.12'
tmp = '/tmp/csheet'
os.makedirs(tmp, exist_ok=True)
for f in glob.glob(f'{tmp}/*.png'):
    os.remove(f)

# Chroma key magenta → sequência de PNGs com alpha. despill removendo dominância de
# magenta (R≈B altos, G baixo) ajuda a tirar resíduo nas bordas/reflexos.
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', IN,
                '-vf', f'colorkey=0xFF00FF:{SIM}:{BLEND}', f'{tmp}/%03d.png'], check=True)
frames = sorted(glob.glob(f'{tmp}/*.png'))
# Subsample N frames uniformemente (idle curto → yoyo no Phaser fecha o loop).
idx = [round(i * (len(frames) - 1) / (N - 1)) for i in range(N)]
imgs = [despill_magenta(Image.open(frames[i]).convert('RGBA')) for i in idx]

# Bbox-união (mesmo recorte em todos os frames → sprite estável).
bbox = None
for im in imgs:
    b = im.getbbox()
    if b:
        bbox = b if bbox is None else (min(bbox[0], b[0]), min(bbox[1], b[1]),
                                       max(bbox[2], b[2]), max(bbox[3], b[3]))
cropped = [im.crop(bbox) for im in imgs]
w, h = cropped[0].size
scale = min(1.0, 360 / h)
if scale < 1.0:
    w, h = int(w * scale), int(h * scale)
    cropped = [c.resize((w, h), Image.NEAREST) for c in cropped]

sheet = Image.new('RGBA', (w * N, h), (0, 0, 0, 0))
for i, c in enumerate(cropped):
    sheet.paste(c, (i * w, 0))
sheet.save(OUT)
print(f'{OUT} frames={N} frameW={w} frameH={h}')
