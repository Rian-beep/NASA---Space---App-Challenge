"use client";

import { OrbitControls, Stars } from "@react-three/drei";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Component, useMemo, useRef, type ReactNode } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  RepeatWrapping,
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

/** Use the full-resolution map. A labelled NASA chart is cropped to the solar picture first. */
function fullSurfaceTexture(source: Texture): Texture {
  const image = source.image as CanvasImageSource & { width: number; height: number };
  const width = image.width;
  const height = image.height;
  if (!width || !height) throw new Error("Sun surface unavailable");
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const probeCtx = probe.getContext("2d", { willReadFrequently: true });
  if (!probeCtx) throw new Error("Sun surface unavailable");
  probeCtx.drawImage(image, 0, 0, 1, 1, 0, 0, 1, 1);
  const corner = probeCtx.getImageData(0, 0, 1, 1).data;
  const chart = (corner[0] ?? 0) > 248 && (corner[1] ?? 0) > 248 && (corner[2] ?? 0) > 248;
  if (!chart) return prepareSurface(source);
  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
  if (!scratchCtx) throw new Error("Sun surface unavailable");
  scratchCtx.drawImage(image, 0, 0);

  const pixels = scratchCtx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = pixels[i] ?? 0;
      const g = pixels[i + 1] ?? 0;
      const b = pixels[i + 2] ?? 0;
      if (r > 248 && g > 248 && b > 248) continue;
      if (r < 12 && g < 12 && b < 12) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  minX += 2;
  maxX -= 2;
  minY += 8;
  maxY -= 6;
  if (maxX - minX < 32 || maxY - minY < 32) throw new Error("Sun surface unavailable");

  const canvas = document.createElement("canvas");
  canvas.width = maxX - minX + 1;
  canvas.height = maxY - minY + 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Sun surface unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(scratch, minX, minY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return prepareSurface(new CanvasTexture(canvas));
}

function prepareSurface(map: Texture): Texture {
  map.colorSpace = LinearSRGBColorSpace;
  map.wrapS = RepeatWrapping;
  map.wrapT = ClampToEdgeWrapping;
  map.generateMipmaps = true;
  map.minFilter = LinearMipmapLinearFilter;
  map.magFilter = LinearFilter;
  map.anisotropy = 16;
  map.needsUpdate = true;
  return map;
}

export function SunGlobe({ scale, reducedMotion }: SunGlobeProps) {
  return (
    <Canvas
      aria-label="A three-dimensional model of the Sun"
      camera={{ position: [0, 0.15, 3.5], fov: 35, near: 0.01, far: 50 }}
      dpr={[1, 2]}
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
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const texture = useLoader(TextureLoader, "/api/sun/surface");
  const surface = useMemo(() => {
    const map = fullSurfaceTexture(texture);
    map.anisotropy = maxAnisotropy;
    map.needsUpdate = true;
    return map;
  }, [texture, maxAnisotropy]);

  useFrame((_, delta) => {
    if (!mesh.current || reducedMotion) return;
    mesh.current.rotation.y += Math.min(delta, 0.05) * 0.08;
  });

  return (
    <mesh ref={mesh} renderOrder={1}>
      <sphereGeometry args={[1, 256, 192]} />
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
