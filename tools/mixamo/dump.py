# Blender: dumps every joint position (world space, per frame) of each Mixamo FBX in a folder to one JSON.
# usage: blender -b -P dump.py -- <fbx dir> <out.json>
import bpy, json, os, sys, glob

src, out = sys.argv[sys.argv.index("--") + 1 :][:2]
BONES = ["Hips", "Spine", "Spine2", "Neck", "Head", "HeadTop_End", "RightShoulder", "RightArm", "RightForeArm", "RightHand", "RightHandMiddle1",
         "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "LeftHandMiddle1", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase",
         "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase"]


def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.wm.fbx_import(filepath=path)
    except Exception:
        bpy.ops.import_scene.fbx(filepath=path)


res = {}
for f in sorted(glob.glob(os.path.join(src, "*.fbx"))):
    name = os.path.splitext(os.path.basename(f))[0]
    load(f)
    arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if not arms:
        continue
    arm = arms[0]
    act = arm.animation_data.action if arm.animation_data else None
    if not act:
        print("no action", name)
        continue
    f0, f1 = [int(round(x)) for x in act.frame_range]
    scn = bpy.context.scene
    pb = {k.split(":")[-1]: b for k, b in arm.pose.bones.items()}
    frames = []
    for fr in range(f0, f1 + 1):
        scn.frame_set(fr)
        mw = arm.matrix_world
        frames.append({n: [round(v, 4) for v in (mw @ pb[n].head)] for n in BONES if n in pb})
    res[name] = {"fps": scn.render.fps / scn.render.fps_base, "frames": frames}
    print("ok", name, f1 - f0 + 1)
json.dump(res, open(out, "w"))
