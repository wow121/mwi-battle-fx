# splits registered side-view avatar / outfit layers (on the base figure) into body + front arm, fills the torso under the arm
from PIL import Image, ImageDraw
import numpy as np, json, sys
OUT='/home/xianrui/milkonomy/mwi-battle-fx/assets/rig/player/'
S=0.5
ARM=[(575,650),(640,640),(700,690),(722,770),(728,820),(765,850),(772,900),(745,940),(690,945),(650,925),(600,860),(585,800),(570,720)]
SHOULDER=(612,680); FIST=(728,888)
BODY_BOX=(330,150,960,1200); ARM_BOX=(540,600,800,980)
def poly(pts,size):
    m=Image.new('L',size,0); ImageDraw.Draw(m).polygon(pts,fill=255); return np.asarray(m)>0
def grow(m,n):
    for _ in range(n): m=m|np.roll(m,1,0)|np.roll(m,-1,0)|np.roll(m,1,1)|np.roll(m,-1,1)
    return m
def split(name):
    im=np.asarray(Image.open(name+'.png').convert('RGBA')).astype(np.int16)
    H,W=im.shape[:2]
    arm=poly(ARM,(W,H))
    a=im[...,3]
    armL=im.copy(); armL[~arm,3]=0
    body=im.copy(); body[arm,3]=0
    # torso behind the arm: smear the nearest solid body pixel from the left along each row (front edge x<=705)
    solid=(body[...,3]>250)&~grow(~(body[...,3]>250),3)
    rows={}
    for y in range(640,950):
        xs=np.where(solid[y,:640])[0]
        if len(xs): rows[y]=(xs[-1],body[y,xs[-30:]].mean(0))
    for y,(last,_) in rows.items():
        # a flat colour: the mean of the 30 solid pixels left of the arm, smoothed over nearby rows
        near=[rows[k][1] for k in range(y-6,y+7) if k in rows]
        src=np.mean(near,0); src[3]=255
        for x in np.where(arm[y]&(np.arange(W)<=705))[0]:
            if x>last: body[y,x]=src
    out={}
    for part,L,box in (('body',body,BODY_BOX),('arm',armL,ARM_BOX)):
        x0,y0,x1,y1=box
        img=Image.fromarray(L[y0:y1,x0:x1].astype(np.uint8))
        img=img.resize((round((x1-x0)*S),round((y1-y0)*S)),Image.LANCZOS)
        img.save(f'{OUT}{name}_{part}.webp',lossless=True)
for n in sys.argv[1:]: split(n)
foot=(640,1160)
rig={'face':'right','foot':[foot[0]*S,foot[1]*S],'h':(1160-215)*S,
 'parts':{'body':{'pivot':[(foot[0]-BODY_BOX[0])*S,(foot[1]-BODY_BOX[1])*S],'at':[foot[0]*S,foot[1]*S],'z':1},
          'arm':{'pivot':[(SHOULDER[0]-ARM_BOX[0])*S,(SHOULDER[1]-ARM_BOX[1])*S],'at':[SHOULDER[0]*S,SHOULDER[1]*S],'z':3,'parent':'body'}},
 'fist':[FIST[0]*S,FIST[1]*S],'back':[560*S,820*S],'armAngle':29,'scale':1.19,
 'avatars':['blue_person_1'],'outfits':['warrior_1']}
json.dump(rig,open(OUT+'rig.json','w'),indent=1)
