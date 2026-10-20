import pymeshlab, time
ms=pymeshlab.MeshSet(); ms.load_new_mesh('/tmp/glb2/main.obj'); t0=time.time()
ms.meshing_merge_close_vertices(threshold=pymeshlab.PercentageValue(0.0005))
print('soldado',ms.current_mesh().vertex_number(),ms.current_mesh().face_number())
ms.meshing_decimation_quadric_edge_collapse(targetfacenum=22000, preservenormal=True, preserveboundary=True, optimalplacement=True, planarquadric=True)
print('decimado',ms.current_mesh().face_number(),round(time.time()-t0,1))
ms.save_current_mesh('/tmp/glb2/low.obj', save_vertex_normal=False, save_wedge_texcoord=False)
