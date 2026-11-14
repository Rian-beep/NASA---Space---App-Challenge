"use client";

import { OrbitControls, Stars } from "@react-three/drei";
import { Canvas, useFrame, useLoader, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { SRGBColorSpace, TextureLoader, Vector3 } from "three";
import { latLonToVector, vectorToLatLon } from "./geo";

export type GlobeMarker = {
  id: string;
  name: string;
  latitudeDeg: number;
  eastLongitudeDeg: number;
  tone: "practice" | "landing" | "impact" | "picked";
};

const TONE_COLOR = {
  practice: "#f6d48a",
  landing: "#f4f1ea",
  impact: "#c8b39a",
  picked: "#ffffff",
} as const;

type MoonGlobeProps = {
  markers: GlobeMarker[];
  selectedId: string;
  showImpacts: boolean;
  onSelect: (id: string) => void;
  onPickCoordinates: (latitudeDeg: number, eastLongitudeDeg: number) => void;
};

export function MoonGlobe(props: MoonGlobeProps) {
  return (
    <Canvas
      camera={{ position: [0.55, 0.35, 4.7], fov: 32, near: 0.01, far: 50 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false }}
    >
      <color attach="background" args={["#07080d"]} />
      <Scene {...props} />
    </Canvas>
  );
}

function Scene({ markers, selectedId, showImpacts, onSelect, onPickCoordinates }: MoonGlobeProps) {
  const selected = markers.find((marker) => marker.id === selectedId) ?? null;
  const focus = selected
    ? latLonToVector(selected.latitudeDeg, selected.eastLongitudeDeg, 1)
    : null;

  return (
    <>
      <ambientLight intensity={0.045} />
      <directionalLight position={[4.8, 1.4, 2.4]} intensity={3.15} color="#fff4e4" />
      <directionalLight position={[-3.2, -0.6, -2]} intensity={0.18} color="#9eb0d0" />
      <Stars radius={14} depth={24} count={700} factor={2} saturation={0} fade speed={0} />
      <MoonBody onPickCoordinates={onPickCoordinates} />
      {markers.map((marker) =>
        marker.tone === "impact" && !showImpacts && marker.id !== selectedId ? null : (
          <MarkerPin key={marker.id} marker={marker} selected={marker.id === selectedId} onSelect={onSelect} />
        ),
      )}
      <FlyCamera focus={focus} focusId={selectedId} />
    </>
  );
}

function MoonBody({
  onPickCoordinates,
}: {
  onPickCoordinates: (latitudeDeg: number, eastLongitudeDeg: number) => void;
}) {
  const [colorMap, bumpMap] = useLoader(TextureLoader, [
    "/moon/lroc-color.jpg",
    "/moon/lola-elevation.jpg",
  ]);

  useEffect(() => {
    colorMap.colorSpace = SRGBColorSpace;
    colorMap.anisotropy = 8;
  }, [colorMap]);

  function pick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    const place = vectorToLatLon(event.point.x, event.point.y, event.point.z);
    onPickCoordinates(round4(place.latitudeDeg), round4(place.eastLongitudeDeg));
  }

  return (
    <mesh rotation={[0, -Math.PI / 2, 0]} onClick={pick}>
      <sphereGeometry args={[1, 128, 96]} />
      <meshStandardMaterial
        map={colorMap}
        bumpMap={bumpMap}
        bumpScale={0.016}
        roughness={0.96}
        metalness={0}
      />
    </mesh>
  );
}

function MarkerPin({
  marker,
  selected,
  onSelect,
}: {
  marker: GlobeMarker;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const position = latLonToVector(marker.latitudeDeg, marker.eastLongitudeDeg, 1.012);
  return (
    <mesh
      position={position}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(marker.id);
      }}
    >
      <sphereGeometry args={[selected ? 0.045 : 0.026, 16, 12]} />
      <meshBasicMaterial color={selected ? "#fffef8" : TONE_COLOR[marker.tone]} />
    </mesh>
  );
}

function FlyCamera({ focus, focusId }: { focus: [number, number, number] | null; focusId: string }) {
  const destination = useRef(new Vector3(0.55, 0.35, 4.7));
  const flying = useRef(false);
  const seen = useRef<string | null>(null);

  useFrame((state, delta) => {
    if (seen.current === null) {
      seen.current = focusId;
      return;
    }
    if (focus && seen.current !== focusId) {
      seen.current = focusId;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      destination.current.set(focus[0], focus[1], focus[2]).normalize().multiplyScalar(2.35);
      if (reduced) {
        state.camera.position.copy(destination.current);
        flying.current = false;
      } else {
        flying.current = true;
      }
    }
    if (!flying.current) return;
    state.camera.position.lerp(destination.current, 1 - Math.exp(-2.6 * delta));
    if (state.camera.position.distanceTo(destination.current) < 0.012) flying.current = false;
  });

  return (
    <OrbitControls
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={1.18}
      maxDistance={6}
      onStart={() => {
        flying.current = false;
      }}
    />
  );
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
