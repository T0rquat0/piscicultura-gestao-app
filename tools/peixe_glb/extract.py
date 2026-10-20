import struct, json, numpy as np, time
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
f=open('/root/.claude/uploads/e2815caa-a7b7-50eb-b90e-027018c27884/18a4f7b0-tambaqui_modelo_3d.glb','rb').read()
off=12; chunks=[]
while off<len(f):
    l,t=struct.unpack('<II',f[off:off+8]); chunks.append((t,off+8,l)); off+=8+l
js=json.loads(f[chunks[0][1]:chunks[0][1]+chunks[0][2]]); b0=chunks[1][1]
def acc(i,dt,n):
    a=js['accessors'][i]; v=js['bufferViews'][a['bufferView']]; o=b0+v.get('byteOffset',0)+a.get('byteOffset',0)
    arr=np.frombuffer(f,dtype=dt,count=a['count']*n,offset=o); return arr.reshape(-1,n) if n>1 else arr
pr=js['meshes'][0]['primitives'][0]; at=pr['attributes']
pos=acc(at['POSITION'],'<f4',3).astype(np.float64); nor=acc(at['NORMAL'],'<f4',3); uv=acc(at['TEXCOORD_0'],'<f4',2); idx=acc(pr['indices'],'<u4',1).reshape(-1,3)
# solda por posição
q=np.rint(pos*1e5).astype(np.int64)
_,uid=np.unique(q,axis=0,return_inverse=True); uid=uid.ravel(); nu=uid.max()+1
fu=uid[idx]
e=np.concatenate([fu[:,[0,1]],fu[:,[1,2]],fu[:,[2,0]]])
nc,lab=connected_components(coo_matrix((np.ones(len(e)),(e[:,0],e[:,1])),shape=(nu,nu)),directed=False)
fl=lab[fu[:,0]]
print('componentes',nc)
best=None
for c in range(nc):
    m=fl==c
    if m.sum()<2000: continue
    vs=np.unique(idx[m]); bb=pos[vs]; ext=bb.max(0)-bb.min(0)
    print(c,'faces',m.sum(),'bbox min',np.round(bb.min(0),3),'ext',np.round(ext,3))
    if best is None or ext[0]>best[1]: best=(c,ext[0])
c=best[0]; m=fl==c; print('escolhido',c,m.sum(),'faces')
sub=idx[m]; vs=np.unique(sub); remap=-np.ones(len(pos),int); remap[vs]=np.arange(len(vs))
P=pos[vs]; N_=nor[vs]; UV=uv[vs]; I=remap[sub]
np.savez('/tmp/glb2/main.npz',pos=P,nor=N_,uv=UV,idx=I)
# obj com textura para o pymeshlab (só o peixe principal)
with open('/tmp/glb2/main.mtl','w') as mt: mt.write('newmtl mat\nKd 1 1 1\nmap_Kd tex.jpg\n')
with open('/tmp/glb2/main.obj','w') as o:
    o.write('mtllib main.mtl\nusemtl mat\n')
    np.savetxt(o,P,fmt='v %.6f %.6f %.6f'); np.savetxt(o,UV,fmt='vt %.6f %.6f')
    ff=I+1; np.savetxt(o,np.stack([ff[:,0],ff[:,0],ff[:,1],ff[:,1],ff[:,2],ff[:,2]],1),fmt='f %d/%d %d/%d %d/%d')
print('bbox final',P.min(0),P.max(0),'verts',len(P),'faces',len(I))
