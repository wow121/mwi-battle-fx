# cuts the Magnetic Golem idle frame into rig parts (exact original pixels); hidden torso areas are filled by smearing
from PIL import Image, ImageDraw
import numpy as np, json, sys
SRC='/home/xianrui/milkonomy/mwi-battle-fx/assets/m/magnetic_golem/idle.webp'
OUT=sys.argv[1]
im=np.asarray(Image.open(SRC).convert('RGBA')).astype(np.int16)
H,W=im.shape[:2]
r,g,b,a=[im[...,k] for k in range(4)]
yy,xx=np.mgrid[0:H,0:W]
fg=a>10
def poly(pts):
    m=Image.new('L',(W,H),0); ImageDraw.Draw(m).polygon(pts,fill=255); return np.asarray(m)>0
red=fg&(r-np.maximum(g,b)>40)&(xx<172)
blue=fg&(b-np.maximum(r,g)>40)&(xx>248)
def grow(m,n):
    m=m.copy()
    for _ in range(n):
        m=m|np.roll(m,1,0)|np.roll(m,-1,0)|np.roll(m,1,1)|np.roll(m,-1,1)
    return m
# arm = coloured pixels plus their soft edge pixels
arm_f=fg&grow(red,2)&(xx<172)&~poly([(160,95),(260,95),(260,182),(160,182)])
arm_b=fg&grow(blue,2)&(xx>248)&~poly([(160,95),(260,95),(260,182),(160,182)])
head=fg&poly([(162,99),(252,99),(268,118),(268,172),(256,186),(170,186),(162,172)])&~arm_f&~arm_b
leg_f=fg&poly([(158,250),(207,250),(204,326),(140,326)])&~arm_f&~arm_b
leg_b=fg&poly([(222,250),(270,250),(300,326),(228,326)])&~arm_f&~arm_b
torso=fg&~arm_f&~arm_b&~head&~(leg_f&(yy>262))&~(leg_b&(yy>262))
# torso silhouette under the arms and the head, filled by smearing the nearest torso pixel along the row / column
under=poly([(150,163),(270,163),(264,256),(158,256)])&~torso
img=im.copy()
# smear only from solid pixels a little inside the torso, not its soft edge
inner=torso&(a>250)&~grow(~(torso&(a>250)),3)
for y in range(H):
    xs=np.where(inner[y])[0]
    if not len(xs): continue
    for x in np.where(under[y])[0]:
        j=xs[np.argmin(abs(xs-x))]; img[y,x]=im[y,j]; img[y,x,3]=255
torso2=torso|under
neck=poly([(172,160),(254,160),(254,190),(172,190)])&~torso2
for x in range(W):
    ys=np.where(torso2[:,x]&(yy[:,x]>=186))[0]
    if not len(ys): continue
    for y in np.where(neck[:,x])[0]:
        img[y,x]=img[ys[0],x]; img[y,x,3]=255
torso2|=neck
# a darker round socket where each arm meets the shoulder
def shade(mask_center,rad,k):
    cx,cy=mask_center
    m=((xx-cx)**2+(yy-cy)**2<rad*rad)&torso2
    img[m,:3]=(img[m,:3]*k).astype(np.int16)
shade((160,180),9,0.72); shade((262,180),9,0.72)
parts={'torso':(torso2,(211,258),2),'leg_f':(leg_f,(182,258),0),'leg_b':(leg_b,(246,258),1),'head':(head,(213,184),3),'arm_f':(arm_f,(158,178),4),'arm_b':(arm_b,(262,178),5)}
parent={'head':'torso','arm_f':'torso','arm_b':'torso'}
rig={'foot':[214,323],'h':222,'parts':{}}
for n,(m,piv,z) in parts.items():
    ys,xs=np.where(m); x0,y0,x1,y1=xs.min()-2,ys.min()-2,xs.max()+3,ys.max()+3
    layer=np.zeros_like(img); layer[m]=img[m]
    Image.fromarray(layer[y0:y1,x0:x1].astype(np.uint8)).save(f'{OUT}/{n}.webp',lossless=True)
    rig['parts'][n]={'img':n+'.webp','pivot':[int(piv[0]-x0),int(piv[1]-y0)],'at':list(piv),'z':z,**({'parent':parent[n]} if n in parent else {})}
json.dump(rig,open(f'{OUT}/rig.json','w'),indent=1)
print(json.dumps(rig))
