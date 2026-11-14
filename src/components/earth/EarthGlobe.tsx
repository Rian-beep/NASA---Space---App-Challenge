"use client";

import { OrbitControls, Stars } from "@react-three/drei";
import { Canvas, useFrame, useLoader, type ThreeEvent } from "@react-three/fiber";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Group, PerspectiveCamera, SRGBColorSpace, TextureLoader, Vector3 } from "three";
import { latLonToVector } from "../globe/geo";

export type EarthStationPin = {
  id: string;
  name: string;
  latitudeDeg: number;
  eastLongitudeDeg: number;
  rainRisk: "low" | "elevated" | "high" | "unknown";
};

type EarthGlobeProps = {
  stations: EarthStationPin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const RISK_COLOR = {
  low: "#d6d3d1",
  elevated: "#e8b86d",
  high: "#e07a5f",
  unknown: "#a8a29e",
} as const;

const FIELD_OF_VIEW = 32;
/** Share of the shorter view angle taken by Earth's diameter on first load. */
const DISK_FILL = 0.66;
const PIN_PIXELS = 12;
const PIN_PIXELS_SELECTED = 16;
const CLOUD_RADIUS = 1.015;
/**
 * Default three.js sphere UVs put longitude 0 at texture u = 0.25.
 * Blue Marble is equirectangular with the prime meridian at u = 0.5.
 * This yaw slides that meridian onto +Z, which is longitude 0 in latLonToVector.
 */
const PRIME_MERIDIAN_YAW = -Math.PI / 2;
const OPENING_DIRECTION = new Vector3(0, 0.22, 1);

export function EarthGlobe({ stations, selectedId, onSelect }: EarthGlobeProps) {
  const [spin, setSpin] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setSpin(!media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const ordered = stations
    .filter((station) => station.id !== selectedId)
    .concat(stations.filter((station) => station.id === selectedId));

  return (
    <Canvas
      aria-label="Earth, with the three listening sites"
      camera={{
        position: [0, 1.1, 5.05],
        fov: FIELD_OF_VIEW,
        near: 0.01,
        far: 100,
      }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false }}
      style={{ position: "absolute", inset: 0 }}
    >
      <color attach="background" args={["#07080d"]} />
      <Stars radius={14} depth={24} count={700} factor={2} saturation={0} fade speed={0} />
      <EarthBody />
      <CloudBoundary>
        <CloudShell />
      </CloudBoundary>
      {ordered.map((station) => (
        <StationPin
          key={station.id}
          station={station}
          selected={station.id === selectedId}
          onSelect={onSelect}
        />
      ))}
      <Framing spin={spin} />
    </Canvas>
  );
}

function EarthBody() {
  const colorMap = useLoader(TextureLoader, "/earth/blue-marble.jpg");

  useEffect(() => {
    colorMap.colorSpace = SRGBColorSpace;
    colorMap.anisotropy = 8;
  }, [colorMap]);

  return (
    <mesh rotation={[0, PRIME_MERIDIAN_YAW, 0]} raycast={() => undefined}>
      <sphereGeometry args={[1, 128, 96]} />
      <meshBasicMaterial map={colorMap} toneMapped={false} />
    </mesh>
  );
}

function CloudShell() {
  const clouds = useLoader(TextureLoader, "/earth/clouds.jpg");

  useEffect(() => {
    clouds.anisotropy = 8;
  }, [clouds]);

  return (
    <mesh rotation={[0, PRIME_MERIDIAN_YAW, 0]} raycast={() => undefined}>
      <sphereGeometry args={[CLOUD_RADIUS, 128, 96]} />
      <meshBasicMaterial
        color="#ffffff"
        alphaMap={clouds}
        transparent
        opacity={0.28}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

class CloudBoundary extends Component<{ children: ReactNode }, { off: boolean }> {
  state = { off: false };

  static getDerivedStateFromError(): { off: boolean } {
    return { off: true };
  }

  render() {
    return this.state.off ? null : this.props.children;
  }
}

function StationPin({
  station,
  selected,
  onSelect,
}: {
  station: EarthStationPin;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const group = useRef<Group>(null);
  const surface = useMemo(
    () => new Vector3(...latLonToVector(station.latitudeDeg, station.eastLongitudeDeg, 1)),
    [station.latitudeDeg, station.eastLongitudeDeg],
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
    const lift = CLOUD_RADIUS + worldDiameter * 0.5 + 0.003;
    node.position.set(surface.x * lift, surface.y * lift, surface.z * lift);
    node.scale.setScalar(worldDiameter);
  });

  function select(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onSelect(station.id);
  }

  return (
    <group ref={group} position={[surface.x, surface.y, surface.z]}>
      {selected ? (
        <mesh raycast={() => undefined}>
          <sphereGeometry args={[0.5, 16, 12]} />
          <meshBasicMaterial color="#fffef8" toneMapped={false} />
        </mesh>
      ) : null}
      <mesh raycast={() => undefined}>
        <sphereGeometry args={[selected ? 0.28 : 0.5, 16, 12]} />
        <meshBasicMaterial color={RISK_COLOR[station.rainRisk]} toneMapped={false} />
      </mesh>
      <mesh onClick={select}>
        <sphereGeometry args={[0.95, 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Framing({ spin }: { spin: boolean }) {
  const moved = useRef(false);
  const sizeKey = useRef("");

  useFrame((state) => {
    if (moved.current) return;
    const width = Math.round(state.size.width);
    const height = Math.round(state.size.height);
    if (width < 2 || height < 2) return;
    const key = `${width}x${height}`;
    if (key === sizeKey.current) return;
    const first = sizeKey.current === "";
    sizeKey.current = key;
    const camera = state.camera as PerspectiveCamera;
    const distance = diskDistance(width / height, camera.fov || FIELD_OF_VIEW);
    const direction = first ? OPENING_DIRECTION.clone() : camera.position.clone();
    if (direction.lengthSq() < 1e-8) direction.copy(OPENING_DIRECTION);
    camera.position.copy(direction.normalize().multiplyScalar(distance));
    camera.lookAt(0, 0, 0);
  });

  return (
    <OrbitControls
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      autoRotate={spin}
      autoRotateSpeed={0.8}
      minDistance={1.35}
      maxDistance={16}
      target={[0, 0, 0]}
      onStart={() => {
        moved.current = true;
      }}
    />
  );
}

function diskDistance(aspect: number, fovDeg: number): number {
  const vertical = (fovDeg * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(aspect, 0.2));
  const limit = Math.min(vertical, horizontal);
  const half = (limit * DISK_FILL) / 2;
  return Math.min(16, Math.max(3.6, 1 / Math.tan(half)));
}
