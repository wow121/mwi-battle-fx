# splits each body layer of the floating-hand rig into the torso (+ legs) and the head, so the far arm can pass between
# them: an elliptic head mask (half-res body-box coordinates), soft-edged; hair hanging below it stays on the torso
from PIL import Image, ImageDraw, ImageFilter
import json, sys
OUT='/home/xianrui/milkonomy/mwi-battle-fx/assets/rig/player/'
HEAD=(166,145,118,116)  # centre x, y, radius x, y in the half-res body box (base_a head, chin at full-res y 660)
for n in sys.argv[1:]:
    body=Image.open(f'{OUT}{n}_body.webp').convert('RGBA')
    m=Image.new('L',body.size,0); cx,cy,rx,ry=HEAD
    ImageDraw.Draw(m).ellipse((cx-rx,cy-ry,cx+rx,cy+ry),fill=255)
    m=m.filter(ImageFilter.GaussianBlur(1.2))
    a=body.split()[3]
    from PIL import ImageChops
    head=body.copy(); head.putalpha(ImageChops.multiply(a,m))
    torso=body.copy(); torso.putalpha(ImageChops.multiply(a,ImageChops.invert(m)))
    head.save(f'{OUT}{n}_head.webp',lossless=True); torso.save(f'{OUT}{n}_body.webp',lossless=True)
r=json.load(open(OUT+'rig.json'))
b=r['parts']['body']
r['parts']['head']={'pivot':b['pivot'],'at':b['at'],'z':2.7,'parent':'body'}
r['arms']['armb']['z']=2
json.dump(r,open(OUT+'rig.json','w'),indent=1)
print(r['parts'].keys(), r['arms']['armb']['z'])
