# arms for the floating-hand rig: the stage draws each arm as a bending tube from the shoulder to the hand; this finds
# the shoulders, the drawn arm lengths and each layer's arm colour (the outfit's sleeve, or the avatar's skin)
from PIL import Image, ImageDraw
import numpy as np, json, sys, math
OUT='/home/xianrui/milkonomy/mwi-battle-fx/assets/rig/player/'
S=0.5; T=76  # strip thickness (full-res px)
ARMS={
 # name: (polygon of the arm, shoulder, elbow, wrist, fist centre + radius to leave out)
 'armf':([(690,672),(720,680),(765,733),(825,725),(860,698),(900,705),(925,740),(922,790),(900,815),(860,826),(800,822),(750,815),(718,800),(700,775),(672,745),(668,700)],(705,712),(772,770),(828,764),((876,762),50)),
 'armb':([(600,640),(620,660),(590,700),(565,708),(520,740),(487,770),(490,820),(470,855),(430,870),(380,860),(358,830),(360,790),(375,745),(410,712),(460,680),(510,650),(560,628)],(585,672),(478,742),(448,775),((412,812),48)),
}
_b=np.asarray(Image.open('sheets/base_a.png').convert('RGB')).astype(int)
SIL=(_b[...,1]-np.maximum(_b[...,0],_b[...,2]))<60
def grow(m,n):
    for _ in range(n): m=m|np.roll(m,1,0)|np.roll(m,-1,0)|np.roll(m,1,1)|np.roll(m,-1,1)
    return m
def segment(img,a,b):
    # the band along a->b, rotated level
    ang=math.degrees(math.atan2(b[1]-a[1],b[0]-a[0]))
    L=math.hypot(b[0]-a[0],b[1]-a[1])
    r=img.rotate(ang,center=a,resample=Image.BICUBIC)
    return r.crop((round(a[0]-T*0.25),round(a[1]-T/2),round(a[0]+L+T*0.1),round(a[1]+T/2)))
def cut(name):
    im=Image.open(name+'.png').convert('RGBA')
    W,H=im.size
    for part,(poly,sh,el,wr,(fc,fr)) in ARMS.items():
        m=Image.new('L',(W,H),0); d=ImageDraw.Draw(m); d.polygon(poly,fill=255); d.ellipse((fc[0]-fr,fc[1]-fr,fc[0]+fr,fc[1]+fr),fill=0)
        mask=(np.asarray(m)>0)&grow(SIL,6)
        a=np.asarray(im).copy(); a[...,3]=np.where(mask,a[...,3],0)
        arm=Image.fromarray(a)
        # the colour: the median of the arm's solid pixels; how much of the arm the layer covers (a sleeve or not)
        px=a[mask&(a[...,3]>200)][:,:3]
        cover=len(px)/max(1,mask.sum())
        fill=[int(v) for v in np.median(px,0)] if len(px) else [0,0,0]
        COL.setdefault(name,{})[part]={'fill':'#%02x%02x%02x'%tuple(fill),'line':'#%02x%02x%02x'%tuple(int(v*0.55) for v in fill),'cover':round(cover,2)}
COL={}
for n in sys.argv[1:]: cut(n)
r=json.load(open(OUT+'rig.json'))
r['armColors']=COL
r['arms']={p:{'shoulder':[sh[0]*S,sh[1]*S],'len':[round(math.dist(sh,el)*S,1),round(math.dist(el,wr)*S,1)],'hand':'hm' if p=='armb' else 'ho','z':0.5 if p=='armb' else 3.5,'width':[round(T*S*0.95,1),round(T*S*0.8,1)]} for p,(poly,sh,el,wr,f) in ARMS.items()}
json.dump(r,open(OUT+'rig.json','w'),indent=1)
print(json.dumps(r['arms']))
