import struct, json, numpy as np, time, io, os
from PIL import Image
from scipy.spatial import cKDTree
from scipy import ndimage
import xatlas
t0=time.time()
f=open('/root/.claude/uploads/e2815caa-a7b7-50eb-b90e-027018c27884/18a4f7b0-tambaqui_modelo_3d.glb','rb').read()
off=12; chunks=[]
while off<len(f):
    l,t=struct.unpack('<II',f[off:off+8]); chunks.append((t,off+8,l)); off+=8+l
js=json.loads(f[chunks[0][1]:chunks[0][1]+chunks[0][2]]); b0=chunks[1][1]
def acc(i,dt,n):
    a=js['accessors'][i]; v=js['bufferViews'][a['bufferView']]; o=b0+v.get('byteOffset',0)+a.get('byteOffset',0)
    arr=np.frombuffer(f,dtype=dt,count=a['count']*n,offset=o); return arr.reshape(-1,n) if n>1 else arr
m_=np.load('/tmp/glb2/main.npz'); opos=m_['pos'].astype(np.float64); onor=m_['nor'].astype(np.float32); ouv=m_['uv']
img=np.array(Image.open('/tmp/glb2/orig_0.jpg').convert('RGB'))
H,W,_=img.shape
px=np.clip(np.rint(ouv[:,0]*(W-1)).astype(int),0,W-1); py=np.clip(np.rint(ouv[:,1]*(H-1)).astype(int),0,H-1)
ocol=img[py,px].astype(np.float32)
print('orig ok',round(time.time()-t0,1))
# malha leve (soldada, 24 mil faces) vinda do pymeshlab
V=[];F=[]
for line in open('/tmp/glb2/low.obj'):
    if line.startswith('v '): V.append(line.split()[1:4])
    elif line.startswith('f '): F.append([int(p.split('/')[0])-1 for p in line.split()[1:4]])
V=np.array(V,dtype=np.float64); F=np.array(F,dtype=np.uint32)
print('leve',V.shape,F.shape)
vm,ni,uvn=xatlas.parametrize(V.astype(np.float32),F)
print('xatlas ok: vertices',len(vm),'faces',len(ni),round(time.time()-t0,1))
NP=V[vm]; NF=ni.astype(np.int64)
# rasteriza cada triângulo no espaço UV e anota a posição 3D de cada texel
T=2048
pos_t=[];pix_t=[]
uvp=uvn*np.array([T,T])
for tri in NF:
    a,b,c=uvp[tri[0]],uvp[tri[1]],uvp[tri[2]]
    x0=int(max(0,np.floor(min(a[0],b[0],c[0])-1))); x1=int(min(T-1,np.ceil(max(a[0],b[0],c[0])+1)))
    y0=int(max(0,np.floor(min(a[1],b[1],c[1])-1))); y1=int(min(T-1,np.ceil(max(a[1],b[1],c[1])+1)))
    if x1<x0 or y1<y0: continue
    gx,gy=np.meshgrid(np.arange(x0,x1+1)+0.5,np.arange(y0,y1+1)+0.5)
    d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
    if abs(d)<1e-12: continue
    l1=((b[1]-c[1])*(gx-c[0])+(c[0]-b[0])*(gy-c[1]))/d
    l2=((c[1]-a[1])*(gx-c[0])+(a[0]-c[0])*(gy-c[1]))/d
    l3=1-l1-l2
    m=(l1>=-0.02)&(l2>=-0.02)&(l3>=-0.02)
    if not m.any(): continue
    p=l1[m,None]*NP[tri[0]]+l2[m,None]*NP[tri[1]]+l3[m,None]*NP[tri[2]]
    pos_t.append(p); pix_t.append(np.stack([gx[m].astype(int),gy[m].astype(int)],1))
pos_t=np.concatenate(pos_t); pix_t=np.concatenate(pix_t)
print('texels',len(pos_t),round(time.time()-t0,1))
tree=cKDTree(opos); _,nn=tree.query(pos_t,workers=-1)
col=np.zeros((T,T,3),np.float32); nrm=np.zeros((T,T,3),np.float32); cov=np.zeros((T,T),bool)
col[pix_t[:,1],pix_t[:,0]]=ocol[nn]; nrm[pix_t[:,1],pix_t[:,0]]=onor[nn]; cov[pix_t[:,1],pix_t[:,0]]=True
# preenche as bordas (evita linhas nas emendas)
dist,(iy,ix)=ndimage.distance_transform_edt(~cov,return_indices=True)
col=col[iy,ix]; nrm=nrm[iy,ix]
Image.fromarray(np.clip(col,0,255).astype(np.uint8)).save('/tmp/glb2/bk_cor_full.png')
nn_=(nrm*0.5+0.5)*255
Image.fromarray(np.clip(nn_,0,255).astype(np.uint8)).save('/tmp/glb2/bk_nor_full.png')
# normais suaves por vértice soldado
fn=np.cross(V[F[:,1]]-V[F[:,0]],V[F[:,2]]-V[F[:,0]]); nv=np.zeros_like(V)
for k in range(3): np.add.at(nv,F[:,k],fn)
nv/=np.maximum(np.linalg.norm(nv,axis=1,keepdims=True),1e-12)
np.savez('/tmp/glb2/bk_mesh.npz',pos=NP.astype(np.float32),nor=nv[vm].astype(np.float32),uv=uvn.astype(np.float32),idx=NF.astype(np.uint32))
print('pronto',round(time.time()-t0,1))
