# floating-hand rig (Lost Castle style): the body without arms + the two fists cut as round pieces
from PIL import Image, ImageDraw
import numpy as np, json, sys
OUT='/home/xianrui/milkonomy/mwi-battle-fx/assets/rig/player/'
S=0.5
# fist centres / radii on the base figure (base_a): main hand = back fist (sword), off hand = front fist (shield)
HANDS={'hm':((412,812),58),'ho':((876,762),58)}
def cut(name):
    im=Image.open(name+'.png').convert('RGBA')
    for part,((cx,cy),r) in HANDS.items():
        box=(cx-r,cy-r,cx+r,cy+r)
        piece=im.crop(box)
        m=Image.new('L',(4*2*r,4*2*r),0); ImageDraw.Draw(m).ellipse((0,0,4*2*r-1,4*2*r-1),fill=255)
        m=m.resize((2*r,2*r),Image.LANCZOS)
        a=np.minimum(np.asarray(piece)[...,3],np.asarray(m)).astype(np.uint8)
        piece.putalpha(Image.fromarray(a))
        piece=piece.resize((round(2*r*S),round(2*r*S)),Image.LANCZOS)
        piece.save(f'{OUT}{name}_{part}.webp',lossless=True)
for n in sys.argv[1:]: cut(n)
r=json.load(open(OUT+'rig.json'))
parts={'body':r['parts']['body']}
for part,((cx,cy),rad) in HANDS.items():
    parts[part]={'pivot':[rad*S,rad*S],'at':[cx*S,cy*S],'z':3 if part=='hm' else 4,'sign':1}
r['parts']=parts
r['hands']=True
r['fist']=[876*S,762*S]; r['back']=[412*S,812*S]
json.dump(r,open(OUT+'rig.json','w'),indent=1)
print(json.dumps(r['parts']))
