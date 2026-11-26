import { expect, test } from "bun:test";
import { type VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { lowerArms } from "../../src/renderer/src/pose";
import { makeVrm } from "../fixtures/make-vrm";

async function load(format: "vrm0" | undefined): Promise<VRM> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.parseAsync(
    makeVrm({ textured: false, format }).buffer as ArrayBuffer,
    "",
  );
  const vrm = gltf.userData.vrm as VRM;
  // The app turns VRM 0.x models to face the camera before posing them.
  VRMUtils.rotateVRM0(vrm);

  return vrm;
}

function height(
  vrm: VRM,
  bone: "leftHand" | "rightHand" | "leftUpperArm" | "rightUpperArm",
): number {
  vrm.scene.updateMatrixWorld(true);
  const node = vrm.humanoid.getRawBoneNode(bone);
  if (!node) throw new Error(`the fixture has no ${bone}`);

  return node.getWorldPosition(new Vector3()).y;
}

for (const [name, format] of [
  ["VRM 1.0", undefined],
  ["VRM 0.x", "vrm0"],
] as const) {
  test(`lowers both arms of a ${name} avatar from the T-pose`, async () => {
    const vrm = await load(format);
    expect(height(vrm, "leftHand")).toBeCloseTo(height(vrm, "leftUpperArm"), 6);

    lowerArms(vrm);
    vrm.update(0);

    // The fixture's arms are 0.5 m long; hanging 1.2 rad below level puts the hands 0.47 m down.
    expect(height(vrm, "leftUpperArm") - height(vrm, "leftHand")).toBeCloseTo(0.466, 2);
    expect(height(vrm, "rightUpperArm") - height(vrm, "rightHand")).toBeCloseTo(0.466, 2);
  });
}

test("leaves an avatar without arm bones alone", async () => {
  const vrm = await load(undefined);
  const humanoid = vrm.humanoid as unknown as { getNormalizedBoneNode(name: string): unknown };
  humanoid.getNormalizedBoneNode = () => null;

  expect(() => lowerArms(vrm)).not.toThrow();
});
