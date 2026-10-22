# per-monster rows of all 6 poses, 8 monsters per page, with a left-pointing guide arrow
import os, sys
from PIL import Image, ImageDraw
A = sys.argv[1]
POSES = ["idle", "windup", "strike", "hurt", "cast", "dead"]
ms = sorted(os.listdir(os.path.join(A, "m")))
T = 150; per = 8
for pg in range(0, len(ms), per):
    sub = ms[pg:pg + per]
    sheet = Image.new("RGB", (len(POSES) * T + 170, len(sub) * T), (40, 44, 70))
    d = ImageDraw.Draw(sheet)
    for r, m in enumerate(sub):
        d.text((4, r * T + 6), f"{pg + r}:{m}", fill=(255, 255, 0))
        for j, p in enumerate(POSES):
            im = Image.open(os.path.join(A, "m", m, p + ".webp")).convert("RGBA").resize((T, T))
            sheet.paste(im, (170 + j * T, r * T), im)
        d.line([(0, (r + 1) * T - 1), (sheet.width, (r + 1) * T - 1)], fill=(90, 90, 130))
    sheet.save(os.path.join(A, "..", f"poses{pg // per:02d}.jpg"), quality=86)
print(len(ms))
