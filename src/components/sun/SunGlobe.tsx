"use client";

import { OrbitControls, Stars } from "@react-three/drei";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Component, useMemo, useRef, type ReactNode } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Group,
  LinearSRGBColorSpace,
  Mesh,
  TextureLoader,
  type Texture,
} from "three";
import type { FlareScale } from "../../../terrestrial/flares";

type SunGlobeProps = {
  scale: FlareScale;
  reducedMotion: boolean;
};

const CORONA: Record<FlareScale, string> = {
  unknown: "#ff8a2a",
  A: "#ff8a2a",
  B: "#ff8a2a",
  C: "#ff6a1a",
  M: "#ff4d1a",
  X: "#ff3b1a",
};

const SUN_VERTEX = `
  varying vec2 vUv;
  varying vec3 vNormalView;
  void main() {
    vUv = uv;
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SUN_FRAGMENT = `
  uniform sampler2D photo;
  varying vec2 vUv;
  varying vec3 vNormalView;

  void main() {
    vec3 color = pow(texture2D(photo, vUv).rgb, vec3(2.2));
    float facing = clamp(dot(normalize(vNormalView), vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
    color *= mix(0.62, 1.0, pow(facing, 0.55));
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Paint the flat NASA disk onto the sphere's own surface, front hemisphere only. */
function paintSolarSurface(source: Texture): CanvasTexture {
  const image = source.image as CanvasImageSource & { width: number; height: number };
  const width = 1024;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Sun surface unavailable");
  const scratch = document.createElement("canvas");
  scratch.width = image.width;
  scratch.height = image.height;
  const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
  if (!scratchCtx) throw new Error("Sun surface unavailable");
  scratchCtx.drawImage(image, 0, 0);
  const src = scratchCtx.getImageData(0, 0, scratch.width, scratch.height).data;
  const frame = ctx.createImageData(width, height);
  const dst = frame.data;
  for (let y = 0; y < height; y += 1) {
    const theta = (y / (height - 1)) * Math.PI;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    for (let x = 0; x < width; x += 1) {
      const phi = (x / (width - 1)) * Math.PI * 2;
      const px = -sinT * Math.cos(phi);
      const py = cosT;
      const pz = sinT * Math.sin(phi);
      const grain = ((x * 13 + y * 7) % 17) / 17;
      let r = 214 + grain * 18;
      let g = 126 + grain * 10;
      let b = 48;
      if (pz > 0.04) {
        const su = 0.5 + px * 0.42;
        const sv = 0.5 - py * 0.42;
        const sx = Math.min(scratch.width - 1, Math.max(0, Math.round(su * (scratch.width - 1))));
        const sy = Math.min(scratch.height - 1, Math.max(0, Math.round(sv * (scratch.height - 1))));
        const i = (sy * scratch.width + sx) * 4;
        const fade = Math.min(1, (pz - 0.04) / 0.16);
        r = (src[i] ?? 0) * fade + r * (1 - fade);
        g = (src[i + 1] ?? 0) * fade + g * (1 - fade);
        b = (src[i + 2] ?? 0) * fade + b * (1 - fade);
      }
      const o = (y * width + x) * 4;
      dst[o] = r;
      dst[o + 1] = g;
      dst[o + 2] = b;
      dst[o + 3] = 255;
    }
  }
  ctx.putImageData(frame, 0, 0);
  const map = new CanvasTexture(canvas);
  map.colorSpace = LinearSRGBColorSpace;
  map.anisotropy = 8;
  map.needsUpdate = true;
  return map;
}

export function SunGlobe({ scale, reducedMotion }: SunGlobeProps) {
  return (
    <Canvas
      aria-label="A three-dimensional model of the Sun"
      camera={{ position: [0, 0.15, 3.5], fov: 35, near: 0.01, far: 50 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false }}
      style={{ position: "absolute", inset: 0 }}
    >
      <color attach="background" args={["#07080d"]} />
      <Stars radius={14} depth={24} count={700} factor={2} saturation={0} fade speed={0} />
      <PhotoBoundary>
        <SunPhoto reducedMotion={reducedMotion} />
      </PhotoBoundary>
      <SunGlow scale={scale} reducedMotion={reducedMotion} />
      <OrbitControls enablePan={false} minDistance={2.2} maxDistance={6} />
    </Canvas>
  );
}

function SunPhoto({ reducedMotion }: { reducedMotion: boolean }) {
  const mesh = useRef<Mesh>(null);
  const texture = useLoader(TextureLoader, "/api/sun/picture");
  const surface = useMemo(() => paintSolarSurface(texture), [texture]);

  useFrame((_, delta) => {
    if (!mesh.current || reducedMotion) return;
    mesh.current.rotation.y += Math.min(delta, 0.05) * 0.08;
  });

  return (
    <mesh ref={mesh} renderOrder={1}>
      <sphereGeometry args={[1, 128, 96]} />
      <shaderMaterial
        toneMapped={false}
        uniforms={{ photo: { value: surface } }}
        vertexShader={SUN_VERTEX}
        fragmentShader={SUN_FRAGMENT}
      />
    </mesh>
  );
}

class PhotoBoundary extends Component<{ children: ReactNode }, { off: boolean }> {
  state = { off: false };

  static getDerivedStateFromError(): { off: boolean } {
    return { off: true };
  }

  render() {
    return this.state.off ? <PlainSun /> : this.props.children;
  }
}

function PlainSun() {
  return (
    <mesh renderOrder={1}>
      <sphereGeometry args={[1, 64, 64]} />
      <meshBasicMaterial color="#ffb020" toneMapped={false} />
    </mesh>
  );
}

const RIM_VERTEX = `
  varying vec3 vNormalView;
  void main() {
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RIM_FRAGMENT = `
  uniform vec3 glow;
  varying vec3 vNormalView;
  void main() {
    float rim = pow(1.0 - abs(normalize(vNormalView).z), 5.5);
    if (rim < 0.25) discard;
    gl_FragColor = vec4(glow, rim * 0.85);
    #include <colorspace_fragment>
  }
`;

function SunGlow({ scale, reducedMotion }: SunGlobeProps) {
  const group = useRef<Group>(null);
  const strong = scale === "M" || scale === "X";
  const amp = strong ? 0.04 : scale === "C" ? 0.02 : 0.008;
  const speed = strong ? 2.4 : 1;
  const glow = useMemo(() => new Color(CORONA[scale]), [scale]);

  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * speed) * amp;
    group.current.scale.setScalar(pulse);
  });

  return (
    <group ref={group}>
      <mesh scale={1.045} renderOrder={2}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
          uniforms={{ glow: { value: glow } }}
          vertexShader={RIM_VERTEX}
          fragmentShader={RIM_FRAGMENT}
        />
      </mesh>
    </group>
  );
}
