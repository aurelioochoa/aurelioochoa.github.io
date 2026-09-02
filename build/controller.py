#!/usr/bin/env python3
"""Turn the radio-controller line art into the asset the handover act ships.

The source is an Inkscape SVG that is not really an SVG: it is a 906KB XML wrapper around
one embedded 1536x1024 RGBA PNG. The RGB channels are pure black everywhere; every stroke
in the drawing lives in the alpha channel. So the useful bytes are a fraction of the file,
and shipping the .svg would mean shipping the wrapper, the base64 inflation and the C2PA
manifest baked into the PNG's own header.

This reads it once, crops to the ink's bounding box, flattens RGB to pure black (which is
what it already is, to within a rounding error of 2/255) and writes a lossless WebP.
906KB -> 98KB. Lossy WebP is no smaller because the cost is all in the alpha, and half
scale is visibly soft at 2x device pixel ratio.

    python3 build/controller.py ~/Downloads/control.svg

Not wired into `make scenes`: its input lives outside the repo, and the output is committed.
"""
import base64
import re
import sys
from pathlib import Path

from PIL import Image
import io

# The ink's bounding box inside the 1536x1024 canvas, measured off the alpha channel.
# Every percentage the stylesheet positions the screen and the power button with is
# expressed against this crop, so the two must not drift apart.
BOX = (136, 14, 1400, 1002)
OUT = Path(__file__).resolve().parent.parent / 'assets' / 'art' / 'controller.webp'


def main(src: str) -> None:
    xml = Path(src).read_text()
    m = re.search(r'xlink:href="data:image/png;base64,(.*?)"', xml, re.S)
    if not m:
        raise SystemExit(f'{src}: no embedded base64 PNG found')
    raw = re.sub(r'&#10;|\s', '', m.group(1))
    im = Image.open(io.BytesIO(base64.b64decode(raw))).convert('RGBA').crop(BOX)

    alpha = im.getchannel('A')
    black = Image.new('L', im.size, 0)
    Image.merge('RGBA', (black, black, black, alpha)).save(
        OUT, lossless=True, method=6
    )
    print(f'{OUT.relative_to(Path.cwd())}: {im.size[0]}x{im.size[1]}, {OUT.stat().st_size // 1024}KB')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: python3 build/controller.py <control.svg>')
    main(sys.argv[1])
