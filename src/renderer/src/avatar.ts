import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { blinkWeight, breath } from "./motion";

type AvatarRenderer = {
  load(bytes: ArrayBuffer): Promise<boolean>;
  clear(): void;
};

type DragState = {
  pointerId: number;
  clientX: number;
  clientY: number;
};

export function createAvatarRenderer(canvas: HTMLCanvasElement): AvatarRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);

  scene.add(new THREE.AmbientLight(0xffffff, 1.2));

  const keyLight = new THREE.DirectionalLight(0xffffff, 2);
  keyLight.position.set(1, 1.5, 2);
  scene.add(keyLight);

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const gl = renderer.getContext();
  const pixel = new Uint8Array(4);
  const pixelView = new DataView(pixel.buffer);
  const clock = new THREE.Clock();

  let vrm: VRM | undefined;
  let loadGeneration = 0;
  let hit = false;
  let forceHit = false;
  let pointer: { x: number; y: number } | undefined;
  let drag: DragState | undefined;

  function resize(): void {
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  resize();
  window.addEventListener("resize", resize);

  function disposeCurrent(): void {
    if (!vrm) {
      return;
    }

    scene.remove(vrm.scene);
    VRMUtils.deepDispose(vrm.scene);
    vrm = undefined;
  }

  function frameAvatar(avatar: VRM): void {
    const bounds = new THREE.Box3().setFromObject(avatar.scene);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());

    if (!Number.isFinite(size.y) || size.y <= 0) {
      throw new Error("The avatar has no visible height");
    }

    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const distance = size.y / (2 * Math.tan(halfFov) * 0.9);

    camera.near = distance / 100;
    camera.far = distance * 100;
    camera.position.set(center.x, center.y, center.z + distance);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }

  function isPointerOverAvatar(): boolean {
    if (!vrm || !pointer) {
      return false;
    }

    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio;
    const x = Math.floor((pointer.x - bounds.left) * pixelRatio);
    const y = gl.drawingBufferHeight - Math.floor((pointer.y - bounds.top) * pixelRatio) - 1;

    if (x < 0 || y < 0 || x >= gl.drawingBufferWidth || y >= gl.drawingBufferHeight) {
      return false;
    }

    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

    return pixelView.getUint8(3) > 0;
  }

  function updateHit(): void {
    const over = isPointerOverAvatar();
    const changed = over !== hit;

    if (!forceHit && !changed) {
      return;
    }

    hit = over;
    forceHit = false;
    window.seien.setHit(over);
  }

  function rememberPointer(event: PointerEvent): void {
    pointer = { x: event.clientX, y: event.clientY };
  }

  canvas.addEventListener("pointerdown", (event) => {
    rememberPointer(event);

    if (!hit || drag) {
      return;
    }

    drag = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    rememberPointer(event);

    const currentDrag = drag;

    if (!currentDrag || event.pointerId !== currentDrag.pointerId) {
      return;
    }

    window.seien.dragBy(event.clientX - currentDrag.clientX, event.clientY - currentDrag.clientY);
  });

  function endDrag(event: PointerEvent): void {
    const currentDrag = drag;

    if (!currentDrag || event.pointerId !== currentDrag.pointerId) {
      return;
    }

    drag = undefined;
    window.seien.dragEnd();
  }

  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  function frame(): void {
    const delta = clock.getDelta();
    const seconds = clock.elapsedTime;
    const currentVrm = vrm;

    if (currentVrm) {
      const expressionManager = currentVrm.expressionManager;

      if (expressionManager?.getExpression("blink")) {
        expressionManager.setValue("blink", blinkWeight(seconds));
      }

      const chest = currentVrm.humanoid.getNormalizedBoneNode("chest");

      if (chest) {
        chest.rotation.x = breath(seconds) * 0.02;
      }

      currentVrm.update(delta);
    }

    renderer.render(scene, camera);
    updateHit();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  return {
    async load(bytes) {
      const generation = ++loadGeneration;
      const gltf = await loader.parseAsync(bytes, "");
      const loaded = gltf.userData.vrm as VRM | undefined;

      if (!(loaded instanceof VRM)) {
        VRMUtils.deepDispose(gltf.scene);
        throw new Error("The file does not contain a VRM avatar");
      }

      if (generation !== loadGeneration) {
        VRMUtils.deepDispose(loaded.scene);
        return false;
      }

      VRMUtils.rotateVRM0(loaded);

      try {
        frameAvatar(loaded);
      } catch (error) {
        VRMUtils.deepDispose(loaded.scene);
        throw error;
      }

      disposeCurrent();
      vrm = loaded;
      scene.add(loaded.scene);
      forceHit = true;

      return true;
    },

    clear() {
      loadGeneration += 1;
      disposeCurrent();
    },
  };
}
