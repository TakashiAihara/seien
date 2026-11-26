import { crc32, deflateSync } from "node:zlib";

// The fifteen bones VRM 1.0 requires, plus chest and neck: name, parent index, offset from parent.
const bones = [
  ["hips", -1, [0, 1, 0]],
  ["spine", 0, [0, 0.1, 0]],
  ["chest", 1, [0, 0.15, 0]],
  ["neck", 2, [0, 0.2, 0]],
  ["head", 3, [0, 0.1, 0]],
  ["leftUpperArm", 2, [0.15, 0.15, 0]],
  ["leftLowerArm", 5, [0.25, 0, 0]],
  ["leftHand", 6, [0.25, 0, 0]],
  ["rightUpperArm", 2, [-0.15, 0.15, 0]],
  ["rightLowerArm", 8, [-0.25, 0, 0]],
  ["rightHand", 9, [-0.25, 0, 0]],
  ["leftUpperLeg", 0, [0.1, 0, 0]],
  ["leftLowerLeg", 11, [0, -0.45, 0]],
  ["leftFoot", 12, [0, -0.45, 0]],
  ["rightUpperLeg", 0, [-0.1, 0, 0]],
  ["rightLowerLeg", 14, [0, -0.45, 0]],
  ["rightFoot", 15, [0, -0.45, 0]],
] as const;

const boxHalfSize = [0.25, 0.8, 0.1] as const;
const boxCentre = [0, 0.9, 0] as const;

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + data.byteLength);
  body.set(new TextEncoder().encode(type));
  body.set(data, 4);

  const chunk = new Uint8Array(12 + data.byteLength);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.byteLength);
  chunk.set(body, 4);
  view.setUint32(8 + data.byteLength, crc32(body));

  return chunk;
}

function onePixelPng(): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, 1);
  view.setUint32(4, 1);
  header.set([8, 6, 0, 0, 0], 8);

  const pixel = deflateSync(new Uint8Array([0, 230, 80, 80, 255]));
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", pixel),
    pngChunk("IEND", new Uint8Array(0)),
  ];

  return concat(parts);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }

  return out;
}

function padTo4(bytes: Uint8Array, fill: number): Uint8Array {
  const out = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4).fill(fill);
  out.set(bytes);

  return out;
}

/**
 * Builds a minimal VRM 1.0 avatar: a humanoid skeleton and an opaque box, 0.5 m wide and 1.6 m
 * tall, standing on the ground, with a 0.2 m square flag sticking out at the top of one side. The
 * flag makes the silhouette different in every mirror image, so a flipped hit test shows. It has
 * no expressions, which real avatars are also allowed to lack. With `textured`, the boxes carry an
 * embedded one-pixel PNG, so loading it exercises the image path the way real avatars do.
 */
export function makeVrm(options: { textured: boolean }): Uint8Array {
  const corners: number[] = [];

  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        corners.push(x * boxHalfSize[0], y * boxHalfSize[1], z * boxHalfSize[2]);
      }
    }
  }

  const triangles = [
    0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5,
    7, 1, 7, 3,
  ];
  const png = onePixelPng();
  const views = [
    padTo4(new Uint8Array(new Float32Array(corners).buffer), 0),
    padTo4(new Uint8Array(new Uint16Array(triangles).buffer), 0),
    padTo4(new Uint8Array(new Float32Array(16).buffer), 0),
    padTo4(png, 0),
  ];
  const lengths = [corners.length * 4, triangles.length * 2, 16 * 4, png.byteLength];
  const bin = concat(views);
  let offset = 0;
  const bufferViews = views.map((view, index) => {
    const bufferView = { buffer: 0, byteOffset: offset, byteLength: lengths[index] };
    offset += view.byteLength;

    return bufferView;
  });

  const nodes: {
    name: string;
    translation: number[];
    scale?: number[];
    children?: number[];
    mesh?: number;
  }[] = bones.map(([name, , translation]) => ({ name, translation: [...translation] }));

  bones.forEach(([, parent], index) => {
    const parentNode = nodes[parent];
    if (!parentNode) return;
    parentNode.children = [...(parentNode.children ?? []), index];
  });
  nodes.push({ name: "body", mesh: 0, translation: [...boxCentre] });
  nodes.push({ name: "flag", mesh: 0, translation: [0.5, 1.5, 0], scale: [0.4, 0.125, 1] });

  const material = options.textured
    ? { pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, doubleSided: true }
    : { pbrMetallicRoughness: { baseColorFactor: [0.9, 0.3, 0.3, 1] }, doubleSided: true };
  const json = {
    asset: { version: "2.0" },
    extensionsUsed: ["VRMC_vrm"],
    scene: 0,
    scenes: [{ nodes: [0, bones.length, bones.length + 1] }],
    nodes,
    meshes: [
      { primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 2 }, indices: 1, material: 0 }] },
    ],
    materials: [material],
    ...(options.textured
      ? { textures: [{ source: 0 }], images: [{ bufferView: 3, mimeType: "image/png" }] }
      : {}),
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 8,
        type: "VEC3",
        min: boxHalfSize.map((value) => -value),
        max: [...boxHalfSize],
      },
      { bufferView: 1, componentType: 5123, count: triangles.length, type: "SCALAR" },
      { bufferView: 2, componentType: 5126, count: 8, type: "VEC2" },
    ],
    bufferViews: options.textured ? bufferViews : bufferViews.slice(0, 3),
    buffers: [{ byteLength: bin.byteLength }],
    extensions: {
      VRMC_vrm: {
        specVersion: "1.0",
        meta: {
          name: "seien test box",
          version: "1",
          authors: ["seien"],
          licenseUrl: "https://vrm.dev/licenses/1.0/",
        },
        humanoid: {
          humanBones: Object.fromEntries(bones.map(([name], index) => [name, { node: index }])),
        },
      },
    },
  };

  const jsonChunk = padTo4(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const total = 12 + 8 + jsonChunk.byteLength + 8 + bin.byteLength;
  const glb = new Uint8Array(total);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunk.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  glb.set(jsonChunk, 20);

  const binStart = 20 + jsonChunk.byteLength;
  view.setUint32(binStart, bin.byteLength, true);
  view.setUint32(binStart + 4, 0x004e4942, true);
  glb.set(bin, binStart + 8);

  return glb;
}
