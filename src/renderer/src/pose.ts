import type { VRM } from "@pixiv/three-vrm";

/** Lowers the arms from the T-pose every avatar loads in. */
export function lowerArms(avatar: VRM): void {
  const leftSign = avatar.meta.metaVersion === "0" ? 1 : -1;
  const leftUpperArm = avatar.humanoid.getNormalizedBoneNode("leftUpperArm");

  if (leftUpperArm) {
    leftUpperArm.rotateZ(leftSign * 1.2);
  }

  const rightUpperArm = avatar.humanoid.getNormalizedBoneNode("rightUpperArm");

  if (rightUpperArm) {
    rightUpperArm.rotateZ(-leftSign * 1.2);
  }
}
