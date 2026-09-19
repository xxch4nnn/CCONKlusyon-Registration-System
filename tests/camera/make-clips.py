"""Regenerates the fake-camera clips used by tests/camera.js (optional — the .mjpeg files are committed).

Needs: python 3, `pip install qrcode pillow`. Each clip is a 640x480 MJPEG (a few identical frames; the browser loops it)
showing a QR for the pass code 61765 at a known position, so tests can tell "inside the scan frame" from "outside".
"""
import io
import os
import qrcode
from PIL import Image

W, H = 640, 480
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(HERE, 'clips'), exist_ok=True)


def clip(name, pos, size, code='61765'):
    bg = Image.new('RGB', (W, H), (160, 165, 170))
    if pos is not None:
        qr = qrcode.QRCode(border=2, box_size=8)
        qr.add_data(code)
        qr.make(fit=True)
        q = qr.make_image(fill_color='black', back_color='white').convert('RGB').resize((size, size), Image.LANCZOS)
        bg.paste(q, pos)
    b = io.BytesIO()
    bg.save(b, 'JPEG', quality=92)
    with open(os.path.join(HERE, 'clips', name + '.mjpeg'), 'wb') as f:
        f.write(b.getvalue() * 3)


clip('centered', ((W - 170) // 2, (H - 170) // 2), 170)   # dead centre, large
clip('small_center', (285, 195), 90)                      # dead centre, small
clip('inside_a', (215, 140), 110)                         # inside the frame, upper-left of centre
clip('inside_b', (330, 230), 110)                         # inside the frame, lower-right of centre
clip('outside_below', (270, 378), 100)                    # fully visible on screen but below the frame
clip('outside_corner', (12, 12), 170)                     # top-left corner of the picture
clip('empty', None, 0)                                    # nothing to scan
print('clips written to', os.path.join(HERE, 'clips'))
