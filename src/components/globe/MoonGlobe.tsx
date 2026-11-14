"use client";

import { OrbitControls, Stars } from "@react-three/drei";
import { Canvas, useFrame, useLoader, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Group, PerspectiveCamera, SRGBColorSpace, TextureLoader, Vector3 } from "three";
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

const FIELD_OF_VIEW = 32;
/** Share of the shorter view angle taken by the Moon's diameter on first load. */
const OVERVIEW_FILL = 0.68;
const CLOSE_DISTANCE = 2.85;
const PIN_PIXELS = 10;
const PIN_PIXELS_SELECTED = 13;
const OVERVIEW_DIR = new Vector3(0.55, 0.35, 4.7).normalize();
const INITIAL_CAMERA = OVERVIEW_DIR.clone().multiplyScalar(6.8);

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
      camera={{
        position: [INITIAL_CAMERA.x, INITIAL_CAMERA.y, INITIAL_CAMERA.z],
        fov: FIELD_OF_VIEW,
        near: 0.01,
        far: 100,
      }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false }}
      style={{ position: "absolute", inset: 0 }}
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
  const pins = markers.filter(
    (marker) => marker.tone !== "impact" || showImpacts || marker.id === selectedId,
  );
  const ordered = pins
    .filter((marker) => marker.id !== selectedId)
    .concat(pins.filter((marker) => marker.id === selectedId));

  return (
    <>
      <ambientLight intensity={0.045} />
      <directionalLight position={[4.8, 1.4, 2.4]} intensity={3.15} color="#fff4e4" />
      <directionalLight position={[-3.2, -0.6, -2]} intensity={0.18} color="#9eb0d0" />
      <Stars radius={14} depth={24} count={700} factor={2} saturation={0} fade speed={0} />
      <MoonBody onPickCoordinates={onPickCoordinates} />
      {ordered.map((marker) => (
        <MarkerPin key={marker.id} marker={marker} selected={marker.id === selectedId} onSelect={onSelect} />
      ))}
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
  const group = useRef<Group>(null);
  const surface = useMemo(
    () => new Vector3(...latLonToVector(marker.latitudeDeg, marker.eastLongitudeDeg, 1)),
    [marker.latitudeDeg, marker.eastLongitudeDeg],
  );

  useFrame((state) => {
    const node = group.current;
    const height = state.size.height;
    if (!node || height < 2) return;
    const camera = state.camera as PerspectiveCamera;
    const fov = camera.fov || FIELD_OF_VIEW;
    const distance = Math.max(camera.position.distanceTo(surface), 0.2);
    const visibleHeight = 2 * Math.tan((fov * Math.PI) / 360) * distance;
    const pixels = selected ? PIN_PIXELS_SELECTED : PIN_PIXELS;
    const worldDiameter = (pixels / height) * visibleHeight;
    const lift = 1 + worldDiameter * 0.5 + 0.0015;
    node.position.set(surface.x * lift, surface.y * lift, surface.z * lift);
    node.scale.setScalar(worldDiameter);
  });

  function select(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onSelect(marker.id);
  }

  return (
    <group ref={group} position={surface}>
      <mesh raycast={() => undefined}>
        <sphereGeometry args={[0.5, 12, 8]} />
        <meshBasicMaterial color={selected ? "#fffef8" : TONE_COLOR[marker.tone]} />
      </mesh>
      <mesh onClick={select}>
        <sphereGeometry args={[0.9, 10, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function FlyCamera({ focus, focusId }: { focus: [number, number, number] | null; focusId: string }) {
  const seen = useRef(focusId);
  const overview = useRef(true);
  const flying = useRef(false);
  const framed = useRef({ width: -1, height: -1 });
  const overviewPosition = useRef(new Vector3());
  const destination = useRef(new Vector3());
  const cameraRef = useRef<PerspectiveCamera | null>(null);

  useFrame((state, delta) => {
    const camera = state.camera as PerspectiveCamera;
    cameraRef.current = camera;

    if (seen.current !== focusId) {
      seen.current = focusId;
      overview.current = false;
      flying.current = false;
      if (focus) {
        destination.current.set(focus[0], focus[1], focus[2]).normalize().multiplyScalar(CLOSE_DISTANCE);
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduced) {
          camera.position.copy(destination.current);
          camera.lookAt(0, 0, 0);
        } else {
          flying.current = true;
        }
      }
    }

    if (overview.current) {
      const width = Math.round(state.size.width);
      const height = Math.round(state.size.height);
      if (width < 2 || height < 2) return;
      if (width === framed.current.width && height === framed.current.height) return;
      framed.current = { width, height };
      const distance = overviewDistance(width / height, camera.fov || FIELD_OF_VIEW);
      overviewPosition.current.copy(OVERVIEW_DIR).multiplyScalar(distance);
      camera.position.copy(overviewPosition.current);
      camera.lookAt(0, 0, 0);
      return;
    }

    if (!flying.current) return;
    camera.position.lerp(destination.current, 1 - Math.exp(-2.6 * delta));
    camera.lookAt(0, 0, 0);
    if (camera.position.distanceTo(destination.current) < 0.02) {
      camera.position.copy(destination.current);
      flying.current = false;
    }
  });

  return (
    <OrbitControls
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={1.18}
      maxDistance={22}
      onStart={() => {
        flying.current = false;
      }}
      onEnd={() => {
        const camera = cameraRef.current;
        if (!camera || !overview.current || flying.current) return;
        if (camera.position.distanceTo(overviewPosition.current) > 0.12) overview.current = false;
      }}
    />
  );
}

function overviewDistance(aspect: number, fovDeg: number): number {
  const vertical = (fovDeg * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(aspect, 0.2));
  const limit = Math.min(vertical, horizontal);
  const half = (limit * OVERVIEW_FILL) / 2;
  return Math.min(20, Math.max(4.6, 1 / Math.tan(half)));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
