# splits registered 3/4 battle-view (Arknights-style chibi) avatar / outfit layers into body, front upper arm + forearm (off-hand) and back upper arm + forearm (main weapon); fills the torso behind them
from PIL import Image, ImageDraw
import numpy as np, json, sys
OUT='/home/xianrui/milkonomy/mwi-battle-fx/assets/rig/player/'
S=0.5
ARM=[(690,672),(720,680),(765,733),(825,725),(860,698),(900,705),(925,740),(922,790),(900,815),(860,826),(800,822),(750,815),(718,800),(700,775),(672,745),(668,700)]
SHOULDER=(705,712); ELBOW=(772,770); FIST=(873,760)
# the back arm (it holds the off-hand)
BARM=[(600,640),(620,660),(590,700),(565,708),(520,740),(487,770),(490,820),(470,855),(430,870),(380,860),(358,830),(360,790),(375,745),(410,712),(460,680),(510,650),(560,628)]
BSHOULDER=(585,672); BELBOW=(478,742); BFIST=(412,812)
BODY_BOX=(300,150,1000,1200); ARM_BOX=(640,640,800,860); FORE_BOX=(740,640,960,860); BARM_BOX=(440,620,640,800); BFORE_BOX=(340,680,520,900)
def poly(pts,size):
    m=Image.new('L',size,0); ImageDraw.Draw(m).polygon(pts,fill=255); return np.asarray(m)>0
def grow(m,n):
    for _ in range(n): m=m|np.roll(m,1,0)|np.roll(m,-1,0)|np.roll(m,1,1)|np.roll(m,-1,1)
    return m
# the bald base figure: an arm is only what lies on its silhouette (hair or a cape hanging past the arm stays on the body)
_b=np.asarray(Image.open('sheets/base_a.png').convert('RGB')).astype(int)
SIL=(_b[...,1]-np.maximum(_b[...,0],_b[...,2]))<60
def split(name):
    im=np.asarray(Image.open(name+'.png').convert('RGBA')).astype(np.int16)
    H,W=im.shape[:2]
    arm=poly(ARM,(W,H))
    # the fist's soft outline lies a few px outside the polygon; past the chest it all belongs to the arm
    arm=arm|(grow(arm,8)&(np.arange(W)[None,:]>770))
    a=im[...,3]
    xx=np.arange(W)[None,:]
    upper=arm&(xx<784); fore=arm&(xx>=764)
    armL=im.copy(); armL[~upper,3]=0
    foreL=im.copy(); foreL[~fore,3]=0
    barm=poly(BARM,(W,H))
    barm=barm|(grow(barm,8)&(np.arange(W)[None,:]<470))
    sil=grow(SIL,6)
    arm&=sil
    barm&=sil
    # the back arm splits at the elbow too (it holds the main weapon), overlapping a few px
    bupper=barm&(xx>=470); bfore=barm&(xx<490)
    barmL=im.copy(); barmL[~bupper,3]=0
    bforeL=im.copy(); bforeL[~bfore,3]=0
    body=im.copy(); body[arm|barm,3]=0
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
    # the shoulder behind the back arm: smear the nearest solid body pixel from the right (x >= 545)
    solid=(body[...,3]>250)&~grow(~(body[...,3]>250),3)
    for y in range(640,760):
        xs=np.where(solid[y,600:])[0]
        if not len(xs): continue
        x0=600+xs[0]; src=body[y,x0:x0+20].mean(0); src[3]=255
        for x in np.where(barm[y]&(np.arange(W)>=545))[0]:
            if x<x0: body[y,x]=src
    out={}
    for part,L,box in (('body',body,BODY_BOX),('arm',armL,ARM_BOX),('fore',foreL,FORE_BOX),('barm',barmL,BARM_BOX),('bfore',bforeL,BFORE_BOX)):
        x0,y0,x1,y1=box
        img=Image.fromarray(L[y0:y1,x0:x1].astype(np.uint8))
        img=img.resize((round((x1-x0)*S),round((y1-y0)*S)),Image.LANCZOS)
        img.save(f'{OUT}{name}_{part}.webp',lossless=True)
for n in sys.argv[1:]: split(n)
foot=(630,1145)
rig={'face':'right','foot':[foot[0]*S,foot[1]*S],'h':(1145-225)*S,
 'parts':{'body':{'pivot':[(foot[0]-BODY_BOX[0])*S,(foot[1]-BODY_BOX[1])*S],'at':[foot[0]*S,foot[1]*S],'z':1},
          'arm':{'pivot':[(SHOULDER[0]-ARM_BOX[0])*S,(SHOULDER[1]-ARM_BOX[1])*S],'at':[SHOULDER[0]*S,SHOULDER[1]*S],'z':3,'parent':'body','sign':1},
          'barm':{'pivot':[(BSHOULDER[0]-BARM_BOX[0])*S,(BSHOULDER[1]-BARM_BOX[1])*S],'at':[BSHOULDER[0]*S,BSHOULDER[1]*S],'z':2,'parent':'body','sign':1},
          'bfore':{'pivot':[(BELBOW[0]-BARM_BOX[0]+BARM_BOX[0]-BFORE_BOX[0])*S,(BELBOW[1]-BFORE_BOX[1])*S],'at':[BELBOW[0]*S,BELBOW[1]*S],'z':2.1,'parent':'barm','sign':1},
          'fore':{'pivot':[(ELBOW[0]-FORE_BOX[0])*S,(ELBOW[1]-FORE_BOX[1])*S],'at':[ELBOW[0]*S,ELBOW[1]*S],'z':4,'parent':'arm','sign':1}},
 'fist':[FIST[0]*S,FIST[1]*S],'back':[BFIST[0]*S,BFIST[1]*S],'armAngle':73,'scale':1.16,
 'avatars':['blue_person_1'],'outfits':['warrior_1']}
json.dump(rig,open(OUT+'rig.json','w'),indent=1)
