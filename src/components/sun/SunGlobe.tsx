"use client";

import { OrbitControls, Stars } from "@react-three/drei";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Component, useRef, type ReactNode } from "react";
import { Group, Mesh, SRGBColorSpace, TextureLoader } from "three";
import type { FlareScale } from "../../../terrestrial/flares";

type SunGlobeProps = {
  scale: FlareScale;
  reducedMotion: boolean;
};

const CORE: Record<FlareScale, string> = {
  unknown: "#ffc14d",
  A: "#ffc14d",
  B: "#ffc14d",
  C: "#ffb03a",
  M: "#ffd7b0",
  X: "#fff1dc",
};

const CORONA: Record<FlareScale, string> = {
  unknown: "#ff8a2a",
  A: "#ff8a2a",
  B: "#ff8a2a",
  C: "#ff6a1a",
  M: "#ff4d1a",
  X: "#ff3b1a",
};

export function SunGlobe({ scale, reducedMotion }: SunGlobeProps) {
  return (
    <Canvas
      aria-label="A glowing model of the Sun"
      camera={{ position: [0, 0.15, 3.5], fov: 35, near: 0.01, far: 50 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false }}
      style={{ position: "absolute", inset: 0 }}
    >
      <color attach="background" args={["#07080d"]} />
      <Stars radius={14} depth={24} count={700} factor={2} saturation={0} fade speed={0} />
      <SunBody scale={scale} reducedMotion={reducedMotion} />
      <PhotoBoundary>
        <SunPhoto />
      </PhotoBoundary>
      <OrbitControls enablePan={false} minDistance={2.2} maxDistance={6} />
    </Canvas>
  );
}

function SunPhoto() {
  const mesh = useRef<Mesh>(null);
  const texture = useLoader(TextureLoader, "/api/sun/picture");
  texture.colorSpace = SRGBColorSpace;

  useFrame(({ camera }) => {
    mesh.current?.lookAt(camera.position);
  });

  return (
    <mesh ref={mesh} renderOrder={2}>
      <circleGeometry args={[1, 64]} />
      <meshBasicMaterial map={texture} toneMapped={false} depthTest={false} />
    </mesh>
  );
}

class PhotoBoundary extends Component<{ children: ReactNode }, { off: boolean }> {
  state = { off: false };

  static getDerivedStateFromError(): { off: boolean } {
    return { off: true };
  }

  render() {
    return this.state.off ? null : this.props.children;
  }
}

function SunBody({ scale, reducedMotion }: SunGlobeProps) {
  const group = useRef<Group>(null);
  const strong = scale === "M" || scale === "X";
  const amp = strong ? 0.06 : scale === "C" ? 0.03 : 0.012;
  const speed = strong ? 2.4 : 1;

  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * speed) * amp;
    group.current.scale.setScalar(pulse);
  });

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial color={CORE[scale]} />
      </mesh>
      <mesh scale={1.18} renderOrder={0}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshBasicMaterial color={CORONA[scale]} transparent opacity={strong ? 0.45 : 0.28} depthWrite={false} />
      </mesh>
      <mesh scale={1.45} renderOrder={0}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color={CORONA[scale]} transparent opacity={strong ? 0.18 : 0.1} depthWrite={false} />
      </mesh>
    </group>
  );
}
