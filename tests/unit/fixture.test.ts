import { expect, test } from "bun:test";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { makeVrm } from "../fixtures/make-vrm";

// The e2e tests are only as good as this fixture: if three-vrm stopped accepting it, they would
// fail for a reason that has nothing to do with the app.
test("the generated avatar is a VRM that three-vrm accepts", async () => {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const bytes = makeVrm({ textured: false });
  const gltf = await loader.parseAsync(bytes.buffer as ArrayBuffer, "");
  const vrm = gltf.userData.vrm;

  expect(vrm.meta.name).toBe("seien test box");
  expect(vrm.humanoid.getNormalizedBoneNode("head")).toBeTruthy();
  expect(vrm.humanoid.getNormalizedBoneNode("chest")).toBeTruthy();
});
