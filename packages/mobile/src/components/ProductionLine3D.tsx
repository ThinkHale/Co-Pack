import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { Line, Worker, stationRole } from '@copack/engine';
import { colors, radius, STATION_THEMES } from '../theme';

type WorkerRig = {
  root: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftForearm: THREE.Group;
  rightForearm: THREE.Group;
  stationRole: string;
  workerId: string;
  active: boolean;
};

type SceneRefs = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cartons: THREE.Group[];
  rigs: WorkerRig[];
  belt: THREE.Mesh;
  scan: THREE.Mesh;
  running: boolean;
  rate: number;
  width: number;
  height: number;
  frameId?: number;
  disposed: boolean;
};

export function ProductionLine3D({
  line,
  workers,
  running,
  rate,
}: {
  line: Line;
  workers: Record<string, Worker>;
  running: boolean;
  rate: number;
}) {
  const sceneRef = useRef<SceneRefs | null>(null);
  const [ready, setReady] = useState(false);
  const activeStations = line.stations.length;
  const layoutKey = [
    line.id,
    line.orderId ?? 'no-order',
    `automation-${line.automation}`,
    `lead-${line.leadId ?? '-'}`,
    `support-${line.supportWorkerIds?.join(',') ?? '-'}`,
    ...line.stations.map((station) => {
      const worker = station.assignedWorkerId ? workers[station.assignedWorkerId] : undefined;
      const appearance = worker
        ? `${worker.presentThisShift ? 'present' : 'out'}:${worker.appearance.skinTone}:${worker.appearance.hairColor}:${worker.appearance.hairStyle}:${worker.appearance.build}:${worker.appearance.accent}`
        : 'open';
      return `${station.id}:${station.assignedWorkerId ?? '-'}:${appearance}`;
    }),
  ].join('|');

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    const previous = sceneRef.current;
    if (previous) {
      previous.disposed = true;
      if (previous.frameId) cancelAnimationFrame(previous.frameId);
      disposeObject(previous.scene);
      previous.renderer.dispose();
    }
    const refs = createLineScene(gl, line, workers, running, rate);
    sceneRef.current = refs;
    setReady(true);

    const render = (timeMs: number) => {
      if (refs.disposed) return;
      animateLine(refs, timeMs / 1000);
      refs.renderer.render(refs.scene, refs.camera);
      gl.endFrameEXP();
      refs.frameId = requestAnimationFrame(render);
    };
    refs.frameId = requestAnimationFrame(render);
  }, [line, workers, running, rate]);

  // Rebuild on station layout changes. This keeps multi-line/SKU shapes honest:
  // a twin-pack line and a retail-kit line get different station counts/spacing.
  React.useEffect(() => {
    const refs = sceneRef.current;
    if (!refs) return;
    refs.running = running;
    refs.rate = rate;
  }, [running, rate, layoutKey]);

  React.useEffect(() => () => {
    const refs = sceneRef.current;
    if (!refs) return;
    refs.disposed = true;
    if (refs.frameId) cancelAnimationFrame(refs.frameId);
    disposeObject(refs.scene);
    refs.renderer.dispose();
    sceneRef.current = null;
  }, []);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>3D Line View</Text>
          <Text style={styles.meta}>{activeStations} station setup · {rate.toFixed(1)} units/min</Text>
        </View>
        <View style={[styles.status, { backgroundColor: running ? colors.green : colors.amber }]} />
      </View>
      <View style={styles.viewport}>
        <GLView key={layoutKey} style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
        {!ready && (
          <View style={styles.loading}>
            <Text style={styles.loadingText}>Building 3D line...</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function createLineScene(
  gl: ExpoWebGLRenderingContext,
  line: Line,
  workers: Record<string, Worker>,
  running: boolean,
  rate: number
): SceneRefs {
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const canvas = {
    width,
    height,
    style: {},
    addEventListener: () => {},
    removeEventListener: () => {},
    clientWidth: width,
    clientHeight: height,
    getContext: () => gl,
  };
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas as unknown as HTMLCanvasElement,
    context: gl as unknown as WebGLRenderingContext,
    antialias: true,
    alpha: true,
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0xeaf8ff, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xeaf8ff, 7, 16);

  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 50);
  const stationCount = Math.max(3, line.stations.length);
  const beltLength = 3.2 + stationCount * 1.05;
  camera.position.set(0, 4.7, 6.7 + stationCount * 0.2);
  camera.lookAt(0, 0.4, 0);

  addLights(scene);
  addFloor(scene, beltLength);
  const belt = addConveyor(scene, beltLength, line.automation);
  const scan = addScanner(scene, beltLength);
  const cartons = addCartons(scene, Math.min(8, Math.max(4, Math.ceil(3 + rate * 4))), beltLength);
  const rigs = addStations(scene, line, workers, beltLength);
  addOutfeed(scene, beltLength);

  return {
    renderer,
    scene,
    camera,
    cartons,
    rigs,
    belt,
    scan,
    running,
    rate,
    width,
    height,
    disposed: false,
  };
}

function addLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x65cfff, 1.75));

  const key = new THREE.DirectionalLight(0xffffff, 2.7);
  key.position.set(-2.4, 5.8, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 16;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x65cfff, 1.2);
  rim.position.set(4, 3, -3);
  scene.add(rim);
}

function addFloor(scene: THREE.Scene, beltLength: number) {
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xf7fcff, roughness: 0.82, metalness: 0.04 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(beltLength + 2.2, 0.08, 4.1), floorMat);
  floor.position.set(0, -0.08, 0);
  floor.receiveShadow = true;
  scene.add(floor);

  const lineMat = new THREE.MeshStandardMaterial({ color: 0xffd200, roughness: 0.86 });
  for (let i = -3; i <= 3; i += 1) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(beltLength + 1.4, 0.012, 0.018), lineMat);
    stripe.position.set(0, -0.025, i * 0.55);
    scene.add(stripe);
  }
}

function addConveyor(scene: THREE.Scene, beltLength: number, automation: number) {
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x168bea, roughness: 0.48, metalness: 0.36 });
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x071827, roughness: 0.62, metalness: 0.18 });
  const railMat = new THREE.MeshStandardMaterial({ color: automation > 0 ? 0xffd200 : 0x55798d, roughness: 0.4, metalness: 0.38 });

  const belt = new THREE.Mesh(new THREE.BoxGeometry(beltLength, 0.18, 0.72), beltMat);
  belt.position.set(0, 0.28, 0);
  belt.castShadow = true;
  belt.receiveShadow = true;
  scene.add(belt);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(beltLength + 0.24, 0.18, 0.96), frameMat);
  frame.position.set(0, 0.12, 0);
  frame.receiveShadow = true;
  scene.add(frame);

  [-0.55, 0.55].forEach((z) => {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(beltLength + 0.08, 0.06, 0.06), railMat);
    rail.position.set(0, 0.48, z);
    rail.castShadow = true;
    scene.add(rail);
  });

  for (let i = 0; i <= 8; i += 1) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.55, 10), frameMat);
    leg.position.set(-beltLength / 2 + (i / 8) * beltLength, -0.12, i % 2 === 0 ? -0.48 : 0.48);
    leg.castShadow = true;
    scene.add(leg);
  }

  return belt;
}

function addScanner(scene: THREE.Scene, beltLength: number) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x20bdfa, transparent: true, opacity: 0.55 });
  const scan = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.025, 0.86), mat);
  scan.position.set(-beltLength / 2, 0.62, 0);
  scene.add(scan);
  return scan;
}

function addCartons(scene: THREE.Scene, count: number, beltLength: number) {
  const cartons: THREE.Group[] = [];
  for (let i = 0; i < count; i += 1) {
    const group = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.24, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xf2b232, roughness: 0.75, metalness: 0.02 })
    );
    const tape = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.246, 0.306),
      new THREE.MeshStandardMaterial({ color: 0x168bea, roughness: 0.7 })
    );
    group.add(box, tape);
    group.position.set(-beltLength / 2 + (i / count) * beltLength, 0.62, 0);
    group.rotation.y = 0.04;
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(group);
    cartons.push(group);
  }
  return cartons;
}

function addStations(scene: THREE.Scene, line: Line, workers: Record<string, Worker>, beltLength: number): WorkerRig[] {
  const rigs: WorkerRig[] = [];
  const count = line.stations.length;
  const gap = beltLength / Math.max(1, count);

  line.stations.forEach((station, index) => {
    const role = stationRole(station);
    const x = -beltLength / 2 + gap * (index + 0.5);
    const side = index % 2 === 0 ? -1 : 1;
    const z = side * 1.04;
    const theme = STATION_THEMES[role] ?? STATION_THEMES.s1;
    const accent = colorNumber(theme.color);

    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.04, 0.52),
      new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6, metalness: 0.1 })
    );
    pad.position.set(x, 0.02, z);
    pad.receiveShadow = true;
    scene.add(pad);

    const table = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.16, 0.34),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.05 })
    );
    table.position.set(x, 0.38, side * 0.72);
    table.castShadow = true;
    table.receiveShadow = true;
    scene.add(table);

    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.05, 0.18),
      new THREE.MeshStandardMaterial({ color: accent, roughness: 0.56, metalness: 0.16 })
    );
    marker.position.set(x, 0.1, z + side * 0.34);
    marker.castShadow = true;
    scene.add(marker);

    const worker = station.assignedWorkerId ? workers[station.assignedWorkerId] : null;
    if (worker) {
      const rig = createWorkerRig(worker, role, side, worker.presentThisShift);
      rig.root.position.set(x, 0.24, z);
      rig.root.rotation.y = side > 0 ? Math.PI : 0;
      scene.add(rig.root);
      rigs.push(rig);
    } else {
      addOpenStationGhost(scene, x, z, accent);
    }
  });

  line.supportWorkerIds?.forEach((workerId, i) => {
    const worker = workers[workerId];
    if (!worker) return;
    const rig = createWorkerRig(worker, 'support', i % 2 === 0 ? -1 : 1, worker.presentThisShift);
    rig.root.position.set(-beltLength / 2 + 0.6 + i * 0.48, 0.24, -1.72);
    scene.add(rig.root);
    rigs.push(rig);
  });

  return rigs;
}

function createWorkerRig(worker: Worker, role: string, side: number, active: boolean): WorkerRig {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: colorNumber(worker.appearance.skinTone), roughness: 0.64, metalness: 0.02 });
  const uniform = new THREE.MeshStandardMaterial({ color: colorNumber(worker.appearance.accent), roughness: 0.72, metalness: 0.04 });
  const vest = new THREE.MeshStandardMaterial({ color: 0xffd200, roughness: 0.66, metalness: 0.03 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x071827, roughness: 0.66 });
  const shadow = active ? 1 : 0.4;

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.54, 0.18), dark);
  legs.position.y = 0.28;
  legs.castShadow = true;
  group.add(legs);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.48, 0.2), uniform);
  torso.position.y = 0.78;
  torso.castShadow = true;
  group.add(torso);

  const vestPanel = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.34, 0.022), vest);
  vestPanel.position.set(0, 0.82, side > 0 ? -0.112 : 0.112);
  group.add(vestPanel);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.08, 16), skin);
  neck.position.y = 1.06;
  group.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 18), skin);
  head.position.y = 1.2;
  head.scale.y = 1.08;
  head.castShadow = true;
  group.add(head);

  const hair = createHair(worker);
  hair.position.y = 1.3;
  group.add(hair);

  const leftArm = createArm(skin, uniform, -1);
  const rightArm = createArm(skin, uniform, 1);
  leftArm.root.position.set(-0.23, 0.98, 0);
  rightArm.root.position.set(0.23, 0.98, 0);
  group.add(leftArm.root, rightArm.root);

  group.scale.setScalar(worker.appearance.build === 'broad' ? 1.08 : worker.appearance.build === 'slim' ? 0.93 : 1);
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.material && !active) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.opacity = shadow;
      material.transparent = true;
    }
  });

  return {
    root: group,
    torso,
    head,
    leftArm: leftArm.root,
    rightArm: rightArm.root,
    leftForearm: leftArm.forearm,
    rightForearm: rightArm.forearm,
    stationRole: role,
    workerId: worker.id,
    active,
  };
}

function createArm(skin: THREE.Material, uniform: THREE.Material, side: -1 | 1) {
  const root = new THREE.Group();
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.34, 14), uniform);
  upper.rotation.z = side * 0.22;
  upper.position.y = -0.14;
  upper.castShadow = true;
  root.add(upper);

  const forearm = new THREE.Group();
  forearm.position.y = -0.3;
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.3, 14), skin);
  lower.position.y = -0.12;
  lower.castShadow = true;
  forearm.add(lower);
  root.add(forearm);

  return { root, forearm };
}

function createHair(worker: Worker) {
  const hairMat = new THREE.MeshStandardMaterial({ color: colorNumber(worker.appearance.hairColor), roughness: 0.9 });
  const group = new THREE.Group();
  if (worker.appearance.hairStyle === 'cap') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.158, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0b4e98, roughness: 0.72 }));
    cap.scale.y = 0.55;
    group.add(cap);
    const bill = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.026, 0.09), cap.material as THREE.Material);
    bill.position.set(0, -0.015, 0.13);
    group.add(bill);
  } else if (worker.appearance.hairStyle === 'bald') {
    return group;
  } else {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 10, 0, Math.PI * 2, 0, Math.PI / 1.7), hairMat);
    hair.scale.set(1.05, worker.appearance.hairStyle === 'bun' ? 0.6 : 0.72, 1.02);
    group.add(hair);
    if (worker.appearance.hairStyle === 'bun') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), hairMat);
      bun.position.set(0, 0.05, -0.12);
      group.add(bun);
    }
  }
  return group;
}

function addOpenStationGhost(scene: THREE.Scene, x: number, z: number, accent: number) {
  const mat = new THREE.MeshStandardMaterial({ color: accent, transparent: true, opacity: 0.18, roughness: 0.8 });
  const ghost = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.78, 18), mat);
  ghost.position.set(x, 0.62, z);
  scene.add(ghost);
}

function addOutfeed(scene: THREE.Scene, beltLength: number) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x071827, roughness: 0.56, metalness: 0.24 });
  const gate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.9), mat);
  gate.position.set(beltLength / 2 + 0.32, 0.58, 0);
  gate.castShadow = true;
  scene.add(gate);
}

function animateLine(refs: SceneRefs, time: number) {
  const speed = refs.running ? 0.35 + refs.rate * 0.55 : 0.03;
  const beltLength = (refs.belt.geometry as THREE.BoxGeometry).parameters.width;
  refs.cartons.forEach((carton, i) => {
    const phase = ((time * speed + i / refs.cartons.length) % 1);
    carton.position.x = -beltLength / 2 + phase * beltLength;
    carton.position.y = 0.62 + Math.sin(time * 2.4 + i) * 0.008;
    carton.rotation.y = 0.04 + Math.sin(time + i) * 0.015;
  });
  refs.scan.position.x = -beltLength / 2 + ((time * (speed * 0.8)) % 1) * beltLength;
  refs.scan.visible = refs.running;

  refs.rigs.forEach((rig, i) => {
    const activeRate = rig.active && refs.running ? 1 : 0.22;
    const t = time * (1.8 + refs.rate * 1.7) + i * 0.7;
    rig.root.position.y = 0.24 + Math.sin(t * 0.8) * 0.012 * activeRate;
    rig.torso.rotation.x = Math.sin(t) * 0.055 * activeRate;
    rig.head.rotation.y = Math.sin(t * 0.55) * 0.08;

    if (rig.stationRole === 's1') {
      rig.leftArm.rotation.x = -0.65 + Math.sin(t) * 0.32 * activeRate;
      rig.rightArm.rotation.x = -0.3 + Math.sin(t + 1.3) * 0.26 * activeRate;
      rig.leftForearm.rotation.x = -0.45 + Math.cos(t) * 0.22 * activeRate;
      rig.rightForearm.rotation.x = -0.35 + Math.cos(t + 1.2) * 0.2 * activeRate;
    } else if (rig.stationRole === 's2') {
      rig.leftArm.rotation.x = -0.95 + Math.sin(t * 1.2) * 0.18 * activeRate;
      rig.rightArm.rotation.x = -0.95 + Math.sin(t * 1.2 + 0.7) * 0.18 * activeRate;
      rig.leftForearm.rotation.x = -0.85 + Math.cos(t * 1.2) * 0.28 * activeRate;
      rig.rightForearm.rotation.x = -0.85 + Math.cos(t * 1.2 + 0.6) * 0.28 * activeRate;
    } else if (rig.stationRole === 's3') {
      rig.leftArm.rotation.x = -0.45 + Math.sin(t * 0.9) * 0.38 * activeRate;
      rig.rightArm.rotation.x = -0.5 + Math.sin(t * 0.9 + 0.8) * 0.38 * activeRate;
      rig.leftForearm.rotation.x = -0.25 + Math.cos(t) * 0.2 * activeRate;
      rig.rightForearm.rotation.x = -0.25 + Math.cos(t + 0.8) * 0.2 * activeRate;
    } else {
      rig.leftArm.rotation.x = -0.35 + Math.sin(t) * 0.18 * activeRate;
      rig.rightArm.rotation.x = -0.35 + Math.cos(t) * 0.18 * activeRate;
    }
  });
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose?.();
  });
}

function colorNumber(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16);
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderTopWidth: 4,
    borderColor: 'rgba(22,139,234,0.24)',
    borderTopColor: colors.gold,
    backgroundColor: colors.panel,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 6,
  },
  title: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  meta: { color: colors.inkMute, fontSize: 10, fontWeight: '800', marginTop: 1 },
  status: { width: 10, height: 10, borderRadius: 5 },
  viewport: { height: 248, backgroundColor: colors.panelAlt },
  loading: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.inkMute, fontSize: 11, fontWeight: '900' },
});
