# splits registered 3/4 battle-view (Arknights-style chibi) avatar / outfit layers (on the base figure) into body + front arm, fills the torso under the arm
from PIL import Image, ImageDraw
import numpy as np, json, sys
OUT='/home/xianrui/milkonomy/mwi-battle-fx/assets/rig/player/'
S=0.5
ARM=[(690,672),(720,680),(765,733),(825,725),(860,698),(900,705),(925,740),(922,790),(900,815),(860,826),(800,822),(750,815),(718,800),(700,775),(672,745),(668,700)]
SHOULDER=(705,712); FIST=(873,760)
BODY_BOX=(300,150,1000,1200); ARM_BOX=(640,640,960,860)
def poly(pts,size):
    m=Image.new('L',size,0); ImageDraw.Draw(m).polygon(pts,fill=255); return np.asarray(m)>0
def grow(m,n):
    for _ in range(n): m=m|np.roll(m,1,0)|np.roll(m,-1,0)|np.roll(m,1,1)|np.roll(m,-1,1)
    return m
def split(name):
    im=np.asarray(Image.open(name+'.png').convert('RGBA')).astype(np.int16)
    H,W=im.shape[:2]
    arm=poly(ARM,(W,H))
    # the fist's soft outline lies a few px outside the polygon; past the chest it all belongs to the arm
    arm=arm|(grow(arm,8)&(np.arange(W)[None,:]>770))
    a=im[...,3]
    armL=im.copy(); armL[~arm,3]=0
    body=im.copy(); body[arm,3]=0
    # torso behind the arm: smear the nearest solid body pixel from the left along each row (front edge x<=705)
    solid=(body[...,3]>250)&~grow(~(body[...,3]>250),3)
    rows={}
    for y in range(660,840):
        xs=np.where(solid[y,:668])[0]
        if len(xs): rows[y]=(xs[-1],body[y,xs[-30:]].mean(0))
    for y,(last,_) in rows.items():
        # a flat colour: the mean of the 30 solid pixels left of the arm, smoothed over nearby rows
        near=[rows[k][1] for k in range(y-6,y+7) if k in rows]
        src=np.mean(near,0); src[3]=255
        for x in np.where(arm[y]&(np.arange(W)<=740))[0]:
            if x>last: body[y,x]=src
    out={}
    for part,L,box in (('body',body,BODY_BOX),('arm',armL,ARM_BOX)):
        x0,y0,x1,y1=box
        img=Image.fromarray(L[y0:y1,x0:x1].astype(np.uint8))
        img=img.resize((round((x1-x0)*S),round((y1-y0)*S)),Image.LANCZOS)
        img.save(f'{OUT}{name}_{part}.webp',lossless=True)
for n in sys.argv[1:]: split(n)
foot=(630,1145)
rig={'face':'right','foot':[foot[0]*S,foot[1]*S],'h':(1145-225)*S,
 'parts':{'body':{'pivot':[(foot[0]-BODY_BOX[0])*S,(foot[1]-BODY_BOX[1])*S],'at':[foot[0]*S,foot[1]*S],'z':1},
          'arm':{'pivot':[(SHOULDER[0]-ARM_BOX[0])*S,(SHOULDER[1]-ARM_BOX[1])*S],'at':[SHOULDER[0]*S,SHOULDER[1]*S],'z':3,'parent':'body'}},
 'fist':[FIST[0]*S,FIST[1]*S],'back':[420*S,800*S],'armAngle':73,'scale':1.16,
 'avatars':['blue_person_1'],'outfits':['warrior_1']}
json.dump(rig,open(OUT+'rig.json','w'),indent=1)
