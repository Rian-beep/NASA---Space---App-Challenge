"use client";

import { Html, OrbitControls, Stars } from "@react-three/drei";
import { Canvas, useFrame, useLoader, type ThreeEvent } from "@react-three/fiber";
import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Group, MeshBasicMaterial, PerspectiveCamera, SRGBColorSpace, TextureLoader, Vector3 } from "three";
import blueMarble from "../images/blue-marble.jpg";
import cloudsImage from "../images/clouds.jpg";
import { latLonToVector } from "@/components/globe/geo";

const BLUE_MARBLE = blueMarble.src;
const CLOUDS = cloudsImage.src;

export type EarthStationPin = {
  id: string;
  name: string;
  latitudeDeg: number;
  eastLongitudeDeg: number;
  rainRisk: "low" | "elevated" | "high" | "unknown";
  groundStorm: boolean;
};

export type EarthAim = {
  latitudeDeg: number;
  eastLongitudeDeg: number;
  label: string;
};

type EarthGlobeProps = {
  stations: EarthStationPin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  aim: EarthAim | null;
  satelliteUrl: string | null;
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
const PIN_PIXELS = 22;
const PIN_PIXELS_SELECTED = 32;
const CLOUD_RADIUS = 1.02;
/**
 * Default three.js sphere UVs put longitude 0 at texture u = 0.25.
 * Blue Marble is equirectangular with the prime meridian at u = 0.5.
 * This yaw slides that meridian onto +Z, which is longitude 0 in latLonToVector.
 */
const PRIME_MERIDIAN_YAW = -Math.PI / 2;
const OPENING_DIRECTION = new Vector3(0, 0.22, 1);

export function EarthGlobe({ stations, selectedId, onSelect, aim, satelliteUrl }: EarthGlobeProps) {
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
      {satelliteUrl ? (
        <PictureBoundary key={satelliteUrl}>
          <SatelliteSkin url={satelliteUrl} />
        </PictureBoundary>
      ) : (
        <CloudBoundary>
          <CloudShell />
        </CloudBoundary>
      )}
      {aim ? <FaceMarker aim={aim} /> : null}
      {ordered.map((station) => (
        <StationPin
          key={station.id}
          station={station}
          selected={station.id === selectedId}
          onSelect={onSelect}
        />
      ))}
      <Framing aim={aim} />
    </Canvas>
  );
}

function EarthBody() {
  const colorMap = useLoader(TextureLoader, BLUE_MARBLE);

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

function SatelliteSkin({ url }: { url: string }) {
  const satellite = useLoader(TextureLoader, url);
  const base = useLoader(TextureLoader, BLUE_MARBLE);
  useEffect(() => {
    satellite.colorSpace = SRGBColorSpace;
    base.colorSpace = SRGBColorSpace;
    satellite.anisotropy = 8;
    base.anisotropy = 8;
  }, [satellite, base]);
  const material = useMemo(() => {
    const mat = new MeshBasicMaterial({ map: base, toneMapped: false });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.satMap = { value: satellite };
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D satMap;")
        .replace(
          "#include <map_fragment>",
          `
          #ifdef USE_MAP
            vec4 baseTexel = texture2D(map, vMapUv);
            vec4 satTexel = texture2D(satMap, vMapUv);
            float lum = dot(satTexel.rgb, vec3(0.2126, 0.7152, 0.0722));
            float live = smoothstep(0.001, 0.012, lum);
            diffuseColor *= mix(baseTexel, satTexel, live);
          #endif
          `,
        );
    };
    mat.customProgramCacheKey = () => "earth-live-satellite";
    return mat;
  }, [base, satellite]);

  return (
    <mesh rotation={[0, PRIME_MERIDIAN_YAW, 0]} raycast={() => undefined} material={material}>
      <sphereGeometry args={[1.004, 128, 96]} />
    </mesh>
  );
}

class PictureBoundary extends Component<{ children: ReactNode }, { off: boolean }> {
  state = { off: false };
  static getDerivedStateFromError(): { off: boolean } {
    return { off: true };
  }
  render() {
    return this.state.off ? null : this.props.children;
  }
}

function FaceMarker({ aim }: { aim: EarthAim }) {
  const position = useMemo(
    () => latLonToVector(aim.latitudeDeg, aim.eastLongitudeDeg, 1.03),
    [aim.latitudeDeg, aim.eastLongitudeDeg],
  );
  return (
    <group position={position}>
      <mesh raycast={() => undefined}>
        <sphereGeometry args={[0.018, 16, 12]} />
        <meshBasicMaterial color="#9ecbff" toneMapped={false} />
      </mesh>
      <Html center distanceFactor={2.4} style={{ pointerEvents: "none" }}>
        <span
          style={{
            color: "#f8fafc",
            background: "#10131acc",
            fontSize: "12px",
            lineHeight: "16px",
            padding: "2px 6px",
            whiteSpace: "nowrap",
          }}
        >
          {aim.label}
        </span>
      </Html>
    </group>
  );
}
function CloudShell() {
  const clouds = useLoader(TextureLoader, CLOUDS);

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
  const labelPosition = useMemo(
    () => latLonToVector(station.latitudeDeg, station.eastLongitudeDeg, 1.12),
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
    <>
      <group ref={group} position={[surface.x, surface.y, surface.z]}>
        <mesh raycast={() => undefined}>
          <sphereGeometry args={[0.78, 20, 14]} />
          <meshBasicMaterial
            color={station.groundStorm ? "#f2c14e" : "#f8fafc"}
            transparent
            opacity={0.45}
            toneMapped={false}
          />
        </mesh>
        {selected ? (
          <mesh raycast={() => undefined}>
            <sphereGeometry args={[0.5, 16, 12]} />
            <meshBasicMaterial color="#fffef8" toneMapped={false} />
          </mesh>
        ) : null}
        <mesh raycast={() => undefined}>
          <sphereGeometry args={[selected ? 0.28 : 0.42, 16, 12]} />
          <meshBasicMaterial color={RISK_COLOR[station.rainRisk]} toneMapped={false} />
        </mesh>
        <mesh onClick={select}>
          <sphereGeometry args={[1.05, 12, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      <Html position={labelPosition} center distanceFactor={2.6} style={{ pointerEvents: "none" }}>
        <span
          style={{
            color: "#f8fafc",
            background: "#10131ae6",
            fontSize: "13px",
            fontWeight: 600,
            lineHeight: "18px",
            padding: "2px 7px",
            whiteSpace: "nowrap",
          }}
        >
          {station.name}
          {station.groundStorm ? " · storm" : ""}
        </span>
      </Html>
    </>
  );
}

function Framing({ aim }: { aim: EarthAim | null }) {
  const moved = useRef(false);
  const placed = useRef("");

  useFrame((state) => {
    const width = Math.round(state.size.width);
    const height = Math.round(state.size.height);
    if (width < 2 || height < 2) return;
    const aimKey = aim
      ? `${aim.latitudeDeg.toFixed(2)},${aim.eastLongitudeDeg.toFixed(2)}`
      : "open";
    if (!placed.current.startsWith(aimKey)) moved.current = false;
    if (moved.current) return;
    const key = `${aimKey}|${width}x${height}`;
    if (placed.current === key) return;
    placed.current = key;
    const camera = state.camera as PerspectiveCamera;
    const distance = diskDistance(width / height, camera.fov || FIELD_OF_VIEW);
    const direction = aim
      ? new Vector3(...latLonToVector(aim.latitudeDeg, aim.eastLongitudeDeg, 1))
      : OPENING_DIRECTION.clone();
    if (direction.lengthSq() < 1e-8) direction.copy(OPENING_DIRECTION);
    camera.position.copy(direction.normalize().multiplyScalar(distance));
    camera.lookAt(0, 0, 0);
    camera.up.set(0, 1, 0);
  });

  return (
    <OrbitControls
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      autoRotate={false}
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
