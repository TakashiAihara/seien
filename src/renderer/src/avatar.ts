import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { blinkWeight, breath } from "./motion";
import { lowerArms } from "./pose";

type AvatarRenderer = {
  parse(bytes: ArrayBuffer): Promise<VRM>;
  show(avatar: VRM): void;
  clear(): void;
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
  const timer = new THREE.Timer();

  let vrm: VRM | undefined;
  let hit = false;
  let needsReCheck = false;
  let pointer: { x: number; y: number } | undefined;
  let dragPointerId: number | undefined;

  function resize(): void {
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    needsReCheck = true;
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
    avatar.scene.updateMatrixWorld(true);

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
    const scaleX = gl.drawingBufferWidth / bounds.width;
    const scaleY = gl.drawingBufferHeight / bounds.height;
    const x = Math.floor((pointer.x - bounds.left) * scaleX);
    const y = gl.drawingBufferHeight - Math.floor((pointer.y - bounds.top) * scaleY) - 1;

    if (x < 0 || y < 0 || x >= gl.drawingBufferWidth || y >= gl.drawingBufferHeight) {
      return false;
    }

    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

    return pixel[3]! > 0;
  }

  function updateHit(): void {
    if (!needsReCheck) {
      return;
    }

    if (gl.isContextLost()) {
      return;
    }

    needsReCheck = false;

    if (dragPointerId !== undefined) {
      return;
    }

    const over = isPointerOverAvatar();

    if (over === hit) {
      return;
    }

    hit = over;
    window.seien.setHit(over);
  }

  function rememberPointer(event: PointerEvent): void {
    pointer = { x: event.clientX, y: event.clientY };
    needsReCheck = true;
  }

  canvas.addEventListener("pointerdown", (event) => {
    rememberPointer(event);

    if (event.button !== 0 || !hit || dragPointerId !== undefined) {
      return;
    }

    dragPointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    window.seien.dragStart();
  });

  canvas.addEventListener("pointermove", (event) => {
    rememberPointer(event);

    if (event.pointerId !== dragPointerId) {
      return;
    }

    window.seien.dragMove();
  });

  function endDrag(event: PointerEvent): void {
    if (event.pointerId !== dragPointerId) {
      return;
    }

    dragPointerId = undefined;
    window.seien.dragEnd();
    needsReCheck = true;
  }

  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("lostpointercapture", endDrag);

  canvas.addEventListener("pointerleave", () => {
    if (dragPointerId !== undefined) {
      return;
    }

    pointer = undefined;
    needsReCheck = true;
  });

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();

    if (dragPointerId !== undefined) {
      dragPointerId = undefined;
      window.seien.dragEnd();
      needsReCheck = true;
    }

    hit = false;
    window.seien.setHit(false);
  });

  canvas.addEventListener("webglcontextrestored", () => {
    needsReCheck = true;
  });

  function frame(timestamp: number): void {
    timer.update(timestamp);

    const delta = timer.getDelta();
    const seconds = timer.getElapsed();
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

      currentVrm.update(Math.min(delta, 0.1));
    }

    renderer.render(scene, camera);
    updateHit();
    requestAnimationFrame(frame);
  }

  window.seien.setHit(false);
  requestAnimationFrame(frame);

  return {
    async parse(bytes) {
      const gltf = await loader.parseAsync(bytes, "");
      const parsed = gltf.userData.vrm as VRM | undefined;

      if (!(parsed instanceof VRM)) {
        VRMUtils.deepDispose(gltf.scene);
        throw new Error("The file does not contain a VRM avatar");
      }

      return parsed;
    },

    show(avatar) {
      disposeCurrent();
      VRMUtils.rotateVRM0(avatar);
      lowerArms(avatar);

      try {
        frameAvatar(avatar);
      } catch (error) {
        VRMUtils.deepDispose(avatar.scene);
        throw error;
      }

      vrm = avatar;
      scene.add(avatar.scene);
      needsReCheck = true;
    },

    clear() {
      disposeCurrent();
      needsReCheck = true;
    },
  };
}
