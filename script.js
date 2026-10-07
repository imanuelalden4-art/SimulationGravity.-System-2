import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Constants
const GRID_SIZE_2D = 400;
const GRID_SEGMENTS_2D = 100;
const GRID_SIZE_3D = 200;
const GRID_NODES_3D = 8;
const MAX_VISUAL_RADIUS = 6;
const MAX_DEFORMATION_DEPTH = 120;
const DEFORMATION_STRENGTH = 80;
const SMOOTHING = 15;
const GRAVITY_RADIUS_MULTIPLIER = 25;
const SIM_G = 2000;
const MAX_TRAIL_POINTS = 800;
const TRAIL_UPDATE_INTERVAL = 2;
const ENERGY_UPDATE_INTERVAL = 6;
const MAX_ENERGY_HISTORY = 1000;

// State
const objects = [];
let selectedObjectId = null;
let currentMaxDeformation = 0;
let idCounter = 0;
let timeScale = 1;
let dimensionMode = "2D";
let collisionCooldown = new Set();
let showGravityField = false;
let showOrbitTrail = false;
let isPaused = false;
let frameCounter = 0;

// Drag state
let isDragging = false;
let draggedObject = null;
let dragStartPos = null;
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const dragIntersection = new THREE.Vector3();

// Orbit state
let orbitPromptActive = false;

// Chart
let energyChart = null;
// Global delete handler (mencegah listener accumulation)
window.deleteCurrentObject = function (id) {
  deleteObject(id);
};

// Three.js Setup
const container = document.getElementById("canvas-container");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080b14);
scene.fog = new THREE.Fog(0x080b14, 400, 1200);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  3000,
);
camera.position.set(150, 100, 150);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);
controls.update();

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
dirLight.position.set(80, 120, 80);
scene.add(dirLight);

const dirLight2 = new THREE.DirectionalLight(0x4488ff, 0.4);
dirLight2.position.set(-80, 60, -80);
scene.add(dirLight2);

// Starfield
function createStarfield() {
  const starCount = 8000;
  const starGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 300 + Math.random() * 500;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 2.5,
    transparent: true,
    opacity: 1.0,
    sizeAttenuation: true,
  });
  scene.add(new THREE.Points(starGeo, starMat));
}
createStarfield();

// 2D Grid
const grid2DGroup = new THREE.Group();
scene.add(grid2DGroup);

const grid2DGeo = new THREE.PlaneGeometry(
  GRID_SIZE_2D,
  GRID_SIZE_2D,
  GRID_SEGMENTS_2D,
  GRID_SEGMENTS_2D,
);
const solidMat = new THREE.MeshStandardMaterial({
  color: 0x4b5568,
  roughness: 0.7,
  metalness: 0.1,
  side: THREE.DoubleSide,
});
const solidMesh = new THREE.Mesh(grid2DGeo, solidMat);
solidMesh.rotation.x = -Math.PI / 2;
grid2DGroup.add(solidMesh);

const wireMat = new THREE.MeshBasicMaterial({
  color: 0x9ca3af,
  wireframe: true,
  transparent: true,
  opacity: 0.5,
});
const wireMesh = new THREE.Mesh(grid2DGeo, wireMat);
wireMesh.rotation.x = -Math.PI / 2;
wireMesh.position.y = 0.05;
grid2DGroup.add(wireMesh);

const gridHelper2D = new THREE.GridHelper(
  GRID_SIZE_2D,
  GRID_SEGMENTS_2D,
  0x9ca3af,
  0x4b5568,
);
gridHelper2D.position.y = 0.1;
grid2DGroup.add(gridHelper2D);

// 3D Grid
const grid3DGroup = new THREE.Group();
grid3DGroup.visible = false;
scene.add(grid3DGroup);

const nodeCount3D = GRID_NODES_3D ** 3;
const halfSize3D = GRID_SIZE_3D / 2;
const step3D = GRID_SIZE_3D / (GRID_NODES_3D - 1);

const originalPositions3D = new Float32Array(nodeCount3D * 3);
const currentPositions3D = new Float32Array(nodeCount3D * 3);
const targetPositions3D = new Float32Array(nodeCount3D * 3);

const nodeGeo = new THREE.SphereGeometry(0.8, 8, 8);
const nodeMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
const nodesMesh = new THREE.InstancedMesh(nodeGeo, nodeMat, nodeCount3D);
grid3DGroup.add(nodesMesh);

const linePositions = [];
const dummy = new THREE.Object3D();

for (let ix = 0; ix < GRID_NODES_3D; ix++) {
  for (let iy = 0; iy < GRID_NODES_3D; iy++) {
    for (let iz = 0; iz < GRID_NODES_3D; iz++) {
      const idx = ix * GRID_NODES_3D ** 2 + iy * GRID_NODES_3D + iz;
      const x = -halfSize3D + ix * step3D;
      const y = -halfSize3D + iy * step3D;
      const z = -halfSize3D + iz * step3D;

      originalPositions3D[idx * 3] = x;
      originalPositions3D[idx * 3 + 1] = y;
      originalPositions3D[idx * 3 + 2] = z;
      currentPositions3D[idx * 3] = x;
      currentPositions3D[idx * 3 + 1] = y;
      currentPositions3D[idx * 3 + 2] = z;
      targetPositions3D[idx * 3] = x;
      targetPositions3D[idx * 3 + 1] = y;
      targetPositions3D[idx * 3 + 2] = z;

      if (ix < GRID_NODES_3D - 1) {
        linePositions.push(x, y, z, -halfSize3D + (ix + 1) * step3D, y, z);
      }
      if (iy < GRID_NODES_3D - 1) {
        linePositions.push(x, y, z, x, -halfSize3D + (iy + 1) * step3D, z);
      }
      if (iz < GRID_NODES_3D - 1) {
        linePositions.push(x, y, z, x, y, -halfSize3D + (iz + 1) * step3D);
      }
    }
  }
}

const lineGeo = new THREE.BufferGeometry();
lineGeo.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(linePositions, 3),
);
const lineMat = new THREE.LineBasicMaterial({
  color: 0x22d3ee,
  transparent: true,
  opacity: 0.5,
});
const linesMesh = new THREE.LineSegments(lineGeo, lineMat);
grid3DGroup.add(linesMesh);

// Groups
const gravityFieldGroup = new THREE.Group();
scene.add(gravityFieldGroup);

const orbitTrailGroup = new THREE.Group();
scene.add(orbitTrailGroup);

const posAttr2D = grid2DGeo.attributes.position;
const vertexCount2D = posAttr2D.count;
const targetZ2D = new Float32Array(vertexCount2D);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// UI Controls
document.querySelectorAll(".ctrl-btn[data-speed]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".ctrl-btn[data-speed]")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    timeScale = parseFloat(btn.dataset.speed);
  });
});

document.querySelectorAll(".ctrl-btn[data-dim]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".ctrl-btn[data-dim]")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    dimensionMode = btn.dataset.dim;
    if (dimensionMode === "2D") {
      grid2DGroup.visible = true;
      grid3DGroup.visible = false;
      camera.position.set(150, 100, 150);
    } else {
      grid2DGroup.visible = false;
      grid3DGroup.visible = true;
      camera.position.set(250, 150, 250);
    }
    controls.target.set(0, 0, 0);
    controls.update();
  });
});

// Play/Pause
document.getElementById("btn-play-pause").addEventListener("click", () => {
  isPaused = !isPaused;
  document.getElementById("icon-play").classList.toggle("hidden", !isPaused);
  document.getElementById("icon-pause").classList.toggle("hidden", isPaused);
});

// Navigation
function showPanel(panelId) {
  document.getElementById("main-nav").style.display = "none";
  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("active"));
  document.getElementById(`panel-${panelId}`).classList.add("active");
  document
    .querySelectorAll(".nav-item")
    .forEach((item) => item.classList.remove("active"));

  const activeNav = document.querySelector(
    `.nav-item[data-panel="${panelId}"]`,
  );
  if (activeNav) activeNav.classList.add("active");

  if (panelId === "explore") updateExploreList();
}

function showMainNav() {
  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("active"));
  document.getElementById("main-nav").style.display = "flex";
  document
    .querySelectorAll(".nav-item")
    .forEach((item) => item.classList.remove("active"));
}

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    const p = item.dataset.panel;
    if (p) showPanel(p);
  });
});

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", showMainNav);
});

// Helpers
function parseMass(str) {
  if (!str) return null;
  const t = str.trim().toLowerCase();
  if (t === "inf" || t === "infinity") return Infinity;
  const v = parseFloat(str);
  return isNaN(v) ? null : v;
}

function formatMass(m) {
  if (!isFinite(m)) return "∞";
  if (m >= 1e6) return m.toExponential(2);
  return m.toString();
}

function logScaleMass(m) {
  if (!isFinite(m)) return 100;
  if (m <= 0) return 0;
  return Math.log10(m + 1);
}

function getVisualRadius(m) {
  const s = logScaleMass(m);
  return Math.max(1.5, Math.min(MAX_VISUAL_RADIUS, s * 0.08 + 1.5));
}

function getGravityRadius(m) {
  return logScaleMass(m) * GRAVITY_RADIUS_MULTIPLIER;
}

// Helper function untuk membersihkan orbit trails dengan dispose mendalam
function clearOrbitTrails() {
  while (orbitTrailGroup.children.length > 0) {
    const c = orbitTrailGroup.children[0];
    orbitTrailGroup.remove(c);
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
  }
}

function createObject(data) {
  const id = ++idCounter;
  const obj = {
    id,
    ...data,
    isOrbiting: false,
    orbitParent: null,
    orbitRadius: 0,
    orbitAngle: 0,
    orbitSpeed: 0,
    hasPromptedOrbit: false,
    orbitTrail: [],
    energyHistory: null,
    initialTE: null,
    prevPos: null,
    prevVel: 0,
  };

  const radius = getVisualRadius(obj.mass);
  const geo = new THREE.SphereGeometry(radius, 32, 32);
  const mat = new THREE.MeshStandardMaterial({
    color: obj.color,
    roughness: 0.3,
    metalness: 0.7,
    emissive: obj.color,
    emissiveIntensity: 0.3,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(obj.x, obj.y || 0, obj.z || 0);
  mesh.userData.objId = id;

  obj.mesh = mesh;
  obj.prevPos = new THREE.Vector3(obj.x, obj.y || 0, obj.z || 0);

  scene.add(mesh);
  objects.push(obj);

  calculateDeformation();
  updateExploreList();
  return obj;
}

function setupOrbit(child, parent, radius) {
  child.isOrbiting = true;
  child.orbitParent = parent;
  child.orbitRadius = radius;
  child.orbitAngle = Math.random() * Math.PI * 2;

  // TAMBAHAN: Inklinasi acak (-45° hingga 45°) agar orbit tidak selalu datar di bidang X-Z
  child.orbitInclination = (Math.random() - 0.5) * (Math.PI / 4);

  const M = logScaleMass(parent.mass);
  child.orbitSpeed = Math.sqrt((SIM_G * M) / radius ** 3);
  child.energyHistory = null;
  child.initialTE = null;
}

function calculateDeformation() {
  let maxDef = 0;
  if (dimensionMode === "2D") {
    for (let i = 0; i < vertexCount2D; i++) {
      const vx = posAttr2D.getX(i);
      const vy = -posAttr2D.getY(i);
      let totalDef = 0;
      for (const obj of objects) {
        const dx = vx - obj.x;
        const dy = vy - (obj.z || 0);
        const distSq = dx * dx + dy * dy;
        totalDef +=
          (logScaleMass(obj.mass) * DEFORMATION_STRENGTH) /
          (distSq + SMOOTHING);
      }
      totalDef = Math.min(totalDef, MAX_DEFORMATION_DEPTH);
      targetZ2D[i] = -totalDef;
      if (totalDef > maxDef) maxDef = totalDef;
    }
  } else {
    for (let i = 0; i < nodeCount3D; i++) {
      const ox = originalPositions3D[i * 3];
      const oy = originalPositions3D[i * 3 + 1];
      const oz = originalPositions3D[i * 3 + 2];
      let fx = 0,
        fy = 0,
        fz = 0;

      for (const obj of objects) {
        const dx = ox - obj.x;
        const dy = oy - (obj.y || 0);
        const dz = oz - (obj.z || 0);
        const distSq = dx * dx + dy * dy + dz * dz;
        const dist = Math.sqrt(distSq);
        if (dist < 0.1) continue;

        const force =
          (logScaleMass(obj.mass) * DEFORMATION_STRENGTH * 0.8) /
          (distSq + SMOOTHING);
        fx -= (dx / dist) * force;
        fy -= (dy / dist) * force;
        fz -= (dz / dist) * force;
      }

      targetPositions3D[i * 3] = ox + fx;
      targetPositions3D[i * 3 + 1] = oy + fy;
      targetPositions3D[i * 3 + 2] = oz + fz;

      const defMag = Math.sqrt(fx * fx + fy * fy + fz * fz);
      if (defMag > maxDef) maxDef = defMag;
    }
  }
  currentMaxDeformation = maxDef;
}

function updateGrid() {
  if (dimensionMode === "2D") {
    let needsUpdate = false;
    const lf = 0.1 * timeScale;
    for (let i = 0; i < vertexCount2D; i++) {
      const cz = posAttr2D.getZ(i);
      const diff = targetZ2D[i] - cz;
      if (Math.abs(diff) > 0.01) {
        posAttr2D.setZ(i, cz + diff * lf);
        needsUpdate = true;
      }
    }
    if (needsUpdate) {
      posAttr2D.needsUpdate = true;
      grid2DGeo.computeVertexNormals();
    }
  } else {
    const lf = 0.1 * timeScale;
    const lpa = linesMesh.geometry.attributes.position; // Gunakan variabel lpa

    for (let i = 0; i < nodeCount3D; i++) {
      const cx = currentPositions3D[i * 3];
      const cy = currentPositions3D[i * 3 + 1];
      const cz = currentPositions3D[i * 3 + 2];

      const nx = cx + (targetPositions3D[i * 3] - cx) * lf;
      const ny = cy + (targetPositions3D[i * 3 + 1] - cy) * lf;
      const nz = cz + (targetPositions3D[i * 3 + 2] - cz) * lf;

      currentPositions3D[i * 3] = nx;
      currentPositions3D[i * 3 + 1] = ny;
      currentPositions3D[i * 3 + 2] = nz;

      dummy.position.set(nx, ny, nz);
      dummy.updateMatrix();
      nodesMesh.setMatrixAt(i, dummy.matrix);
    }
    nodesMesh.instanceMatrix.needsUpdate = true;

    let li = 0;
    let hasChange = false;
    for (let ix = 0; ix < GRID_NODES_3D; ix++) {
      for (let iy = 0; iy < GRID_NODES_3D; iy++) {
        for (let iz = 0; iz < GRID_NODES_3D; iz++) {
          const idx = ix * GRID_NODES_3D ** 2 + iy * GRID_NODES_3D + iz;
          const x = currentPositions3D[idx * 3];
          const y = currentPositions3D[idx * 3 + 1];
          const z = currentPositions3D[idx * 3 + 2];
          if (ix < GRID_NODES_3D - 1) {
            const n = (ix + 1) * GRID_NODES_3D ** 2 + iy * GRID_NODES_3D + iz;
            lpa.setXYZ(li++, x, y, z);
            lpa.setXYZ(
              li++,
              currentPositions3D[n * 3],
              currentPositions3D[n * 3 + 1],
              currentPositions3D[n * 3 + 2],
            );
            hasChange = true;
          }
          if (iy < GRID_NODES_3D - 1) {
            const n = ix * GRID_NODES_3D ** 2 + (iy + 1) * GRID_NODES_3D + iz;
            lpa.setXYZ(li++, x, y, z);
            lpa.setXYZ(
              li++,
              currentPositions3D[n * 3],
              currentPositions3D[n * 3 + 1],
              currentPositions3D[n * 3 + 2],
            );
            hasChange = true;
          }
          if (iz < GRID_NODES_3D - 1) {
            const n = ix * GRID_NODES_3D ** 2 + iy * GRID_NODES_3D + (iz + 1);
            lpa.setXYZ(li++, x, y, z);
            lpa.setXYZ(
              li++,
              currentPositions3D[n * 3],
              currentPositions3D[n * 3 + 1],
              currentPositions3D[n * 3 + 2],
            );
            hasChange = true;
          }
        }
      }
    }
    if (hasChange) lpa.needsUpdate = true;
  }
}

function updateOrbits() {
  frameCounter++;
  objects.forEach((obj) => {
    if (!obj.prevPos) obj.prevPos = new THREE.Vector3(obj.x, obj.y || 0, obj.z);

    if (obj.isOrbiting && obj.orbitParent) {
      if (!objects.includes(obj.orbitParent)) {
        obj.isOrbiting = false;
        obj.orbitParent = null;
        obj.orbitTrail = [];
        return;
      }

      obj.orbitAngle += obj.orbitSpeed * timeScale;

      // PERBAIKAN: Hitung posisi orbit 3D menggunakan inklinasi
      const inc = obj.orbitInclination || 0;
      const cosA = Math.cos(obj.orbitAngle);
      const sinA = Math.sin(obj.orbitAngle);
      const cosI = Math.cos(inc);
      const sinI = Math.sin(inc);

      // Rotasi sederhana pada sumbu X untuk menciptakan kemiringan orbit
      const localX = obj.orbitRadius * cosA;
      const localY = 0;
      const localZ = obj.orbitRadius * sinA;

      obj.x = obj.orbitParent.x + localX;
      obj.y = (obj.orbitParent.y || 0) + localY; // Tidak lagi dipaksa sama dengan parent.y
      obj.z = (obj.orbitParent.z || 0) + localZ;

      if (showOrbitTrail && frameCounter % TRAIL_UPDATE_INTERVAL === 0) {
        obj.orbitTrail.push(new THREE.Vector3(obj.x, obj.y, obj.z));
        if (obj.orbitTrail.length > MAX_TRAIL_POINTS) obj.orbitTrail.shift();
      }

      const vr = getVisualRadius(obj.mass);
      obj.mesh.position.set(obj.x, obj.y + vr + 1, obj.z);
    } else {
      obj.orbitTrail = [];
    }
  });
}

function checkOrbitTriggers() {
  if (orbitPromptActive) return;
  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    if (obj.isOrbiting || obj.hasPromptedOrbit) continue;

    let targets = [];
    for (let j = 0; j < objects.length; j++) {
      if (i === j) continue;
      const t = objects[j];
      if (obj.mass >= t.mass) continue;

      const dx = obj.x - t.x;
      const dy = (obj.y || 0) - (t.y || 0);
      const dz = (obj.z || 0) - (t.z || 0);

      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < getGravityRadius(t.mass)) {
        targets.push(t);
      }
    }

    if (targets.length > 0) {
      showOrbitModal(obj, targets);
      break;
    }
  }
}

function showOrbitModal(obj, targets) {
  orbitPromptActive = true;
  obj.hasPromptedOrbit = true;

  const modal = document.getElementById("orbit-modal");
  document.getElementById("orbit-text").textContent =
    targets.length === 1
      ? `${obj.name} has entered the gravitational field of ${targets[0].name}. Initiate orbit?`
      : `${obj.name} is between the gravitational fields of ${targets.map((t) => t.name).join(" and ")}. Choose a target to orbit:`;

  const bc = document.getElementById("orbit-buttons");
  bc.innerHTML = "";

  targets.forEach((t) => {
    const b = document.createElement("button");
    b.textContent = `Orbit ${t.name}`;
    b.addEventListener("click", () => {
      startOrbit(obj, t);
      closeModal();
    });
    bc.appendChild(b);
  });

  const cb = document.createElement("button");
  cb.textContent = "Cancel";
  cb.className = "btn-cancel";
  cb.addEventListener("click", closeModal);
  bc.appendChild(cb);

  modal.style.display = "flex";
}

function startOrbit(child, parent) {
  const dx = child.x - parent.x;
  const dy = (child.y || 0) - (parent.y || 0);
  const dz = (child.z || 0) - (parent.z || 0);
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  child.isOrbiting = true;
  child.orbitParent = parent;
  child.orbitRadius = Math.max(dist, 10);
  child.orbitAngle = Math.atan2(dz, dx);
  // PERBAIKAN: Tambahkan inklinasi acak untuk orbit manual
  child.orbitInclination = (Math.random() - 0.5) * (Math.PI / 4);
  const M = logScaleMass(parent.mass);
  child.orbitSpeed = Math.sqrt((SIM_G * M) / child.orbitRadius ** 3);
  child.energyHistory = null;
  child.initialTE = null;
}

function closeModal() {
  document.getElementById("orbit-modal").style.display = "none";
  orbitPromptActive = false;
}

function checkCollisions() {
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      const a = objects[i];
      const b = objects[j];

      const dx = a.x - b.x;
      const dy = (a.y || 0) - (b.y || 0);
      const dz = (a.z || 0) - (b.z || 0);
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < getVisualRadius(a.mass) + getVisualRadius(b.mass)) {
        const key = `${a.id}-${b.id}`;
        if (collisionCooldown.has(key)) continue;
        collisionCooldown.add(key);

        const [larger, smaller] = a.mass >= b.mass ? [a, b] : [b, a];
        larger.mass =
          isFinite(larger.mass) && isFinite(smaller.mass)
            ? larger.mass + smaller.mass
            : Infinity;

        const nr = getVisualRadius(larger.mass);
        larger.mesh.geometry.dispose();
        larger.mesh.geometry = new THREE.SphereGeometry(nr, 32, 32);
        larger.mesh.position.y = (larger.y || 0) + nr + 1;

        const si = objects.indexOf(smaller);
        if (si !== -1) {
          scene.remove(smaller.mesh);
          smaller.mesh.geometry.dispose();
          smaller.mesh.material.dispose();
          objects.splice(si, 1);
          if (selectedObjectId === smaller.id) {
            selectedObjectId = null;
            if (energyChart) {
              energyChart.destroy();
              energyChart = null;
            }
            document.getElementById("explore-details").innerHTML =
              '<p class="placeholder-text">Select an object to view details</p>';
          }
        }

        objects.forEach((o) => {
          if (o.orbitParent === smaller) {
            o.isOrbiting = false;
            o.orbitParent = null;
          }
        });

        document.getElementById("collision-text").textContent =
          `${smaller.name} merged into ${larger.name}!\nNew mass: ${formatMass(larger.mass)} × Earth Mass`;
        document.getElementById("collision-modal").style.display = "flex";

        calculateDeformation();
        updateExploreList();
        return;
      }
    }
  }
  if (collisionCooldown.size > 100) collisionCooldown.clear();
}

document.getElementById("btn-collision-ok").addEventListener("click", () => {
  document.getElementById("collision-modal").style.display = "none";
});

function updateExploreList() {
  const list = document.getElementById("explore-list");
  list.innerHTML = "";

  if (objects.length === 0) {
    list.innerHTML =
      '<li style="justify-content:center; color:var(--text-sec);">No objects yet</li>';
    document.getElementById("explore-details").innerHTML =
      '<p class="placeholder-text">Select an object to view details</p>';
    return;
  }

  objects.forEach((obj) => {
    const li = document.createElement("li");
    li.className = selectedObjectId === obj.id ? "selected" : "";
    li.innerHTML = `<span class="color-dot" style="background:${obj.color}"></span><span class="obj-name">${obj.name} ${obj.isOrbiting ? "(Orbiting)" : ""}</span><span class="obj-mass">${formatMass(obj.mass)}×M</span>`;
    li.addEventListener("click", () => selectObject(obj.id));
    list.appendChild(li);
  });
}

function selectObject(id) {
  selectedObjectId = id;
  const obj = objects.find((o) => o.id === id);
  if (!obj) return;

  objects.forEach((o) => {
    o.mesh.material.emissiveIntensity = 0.3;
    o.mesh.scale.set(1, 1, 1);
  });

  obj.mesh.material.emissiveIntensity = 0.8;
  obj.mesh.scale.set(1.2, 1.2, 1.2);

  updateExploreList();
  showObjectAnalysis(obj);
}

function showObjectAnalysis(obj) {
  if (!obj.energyHistory) {
    obj.energyHistory = { ke: [], pe: [], te: [], frames: [] };
    obj.initialTE = null;
  }
  if (!obj.prevPos) {
    obj.prevPos = new THREE.Vector3(obj.x, obj.y || 0, obj.z);
  }

  // 1. Buat elemen HTML & pasang listener tombol SEKALI SAJA
  renderObjectAnalysisHTML(obj);

  // 2. Inisialisasi Chart.js setelah canvas dibuat
  initEnergyChart(obj);

  // 3. Perbarui nilainya
  updateObjectAnalysisDisplay(obj);
}

// Fungsi untuk merender UI HTML secara statis
function renderObjectAnalysisHTML(obj) {
  const detailsDiv = document.getElementById("explore-details");
  detailsDiv.innerHTML = `
    <div class="detail-section">
      <div class="detail-title">${obj.name}</div>
      <div class="detail-row"><span class="detail-label">Mass:</span><span id="val-mass">${formatMass(obj.mass)} × M⊕</span></div>
      <div class="detail-row"><span class="detail-label">Color:</span><span><span class="color-dot-inline" style="background:${obj.color}"></span>${obj.color}</span></div>
      <div class="detail-row"><span class="detail-label">Position:</span><span id="val-pos">(${obj.x.toFixed(1)}, ${(obj.y || 0).toFixed(1)}, ${(obj.z || 0).toFixed(1)})</span></div>
    </div>
    <div class="detail-section">
      <div class="detail-title">Orbit Analysis</div>
      <div class="detail-row"><span class="detail-label">Type:</span><span id="val-orbit-badge" class="orbit-badge escape">Free / Not orbiting</span></div>
      <div class="detail-row"><span class="detail-label">Eccentricity:</span><span id="val-ecc">-</span></div>
      <div class="detail-row"><span class="detail-label">Velocity:</span><span id="val-vel">0 u/f</span></div>
      <div class="detail-row"><span class="detail-label">Distance:</span><span id="val-dist">-</span></div>
    </div>
    <div class="detail-section">
      <div class="detail-title">Energy Conservation</div>
      <div class="detail-row"><span class="detail-label">Kinetic:</span><span id="val-ke">0</span></div>
      <div class="detail-row"><span class="detail-label">Potential:</span><span id="val-pe">0</span></div>
      <div class="detail-row"><span class="detail-label">Total:</span><span id="val-te">0</span></div>
      <div class="detail-row"><span class="detail-label">Energy Error:</span><span id="val-energy-error" class="energy-error-badge">-</span></div>
    </div>
    <div class="detail-section">
      <div class="detail-title">Energy Over Time</div>
      <div class="chart-container"><canvas id="energy-chart"></canvas></div>
    </div>
    <div class="detail-actions">
      <button class="btn-delete" id="btn-detail-delete">Delete Object</button>
    </div>
  `;

  // Pasang Event Listener langsung pada tombol yang stabil
  document.getElementById("btn-detail-delete").addEventListener("click", () => {
    deleteObject(obj.id);
  });
}

// Fungsi ini HANYA memperbarui data teks di tiap frame (ringan & stabil)
function updateObjectAnalysisDisplay(obj) {
  const elPos = document.getElementById("val-pos");
  if (!elPos) return;

  const curPos = new THREE.Vector3(obj.x, obj.y || 0, obj.z);
  const vel = obj.prevPos
    ? curPos.distanceTo(obj.prevPos) / Math.max(timeScale, 0.001)
    : 0;
  obj.prevVel = vel;
  obj.prevPos.copy(curPos);

  let orbitType = "Free / Not orbiting";
  let orbitClass = "escape";
  let ecc = "-";
  let dist = "-";
  let orbitVel = vel.toFixed(4) + " u/f";

  if (obj.isOrbiting && obj.orbitParent && objects.includes(obj.orbitParent)) {
    const dx = obj.x - obj.orbitParent.x;
    const dy = (obj.y || 0) - (obj.orbitParent.y || 0);
    const dz = (obj.z || 0) - (obj.orbitParent.z || 0);
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
    dist = r.toFixed(2) + " u";
    const M = logScaleMass(obj.orbitParent.mass);
    const mu = SIM_G * M;
    const v = obj.orbitSpeed * obj.orbitRadius;
    orbitVel = v.toFixed(4) + " u/f";
    const vSq = v * v;
    const specificEnergy = vSq / 2 - mu / Math.max(r, 0.1);
    const h = r * v;
    let e = 0;
    if (mu > 0 && h > 0) {
      const eSq = 1 + (2 * specificEnergy * h * h) / (mu * mu);
      e = eSq > 0 ? Math.sqrt(Math.abs(eSq)) : 0;
    }
    ecc = e.toFixed(4);
    if (e < 0.05) {
      orbitType = "Circular";
      orbitClass = "circular";
    } else if (e < 0.95) {
      orbitType = "Elliptical";
      orbitClass = "elliptical";
    } else if (e < 1.05) {
      orbitType = "Parabolic";
      orbitClass = "parabolic";
    } else {
      orbitType = "Hyperbolic";
      orbitClass = "hyperbolic";
    }
  }

  const m = logScaleMass(obj.mass);
  const v = obj.prevVel || 0;
  const ke = 0.5 * m * v * v;
  let pe = 0;
  let nearestParent = null;
  let minDist = Infinity;
  for (const other of objects) {
    if (other.id === obj.id) continue;
    if (other.mass <= obj.mass) continue;
    const dx = obj.x - other.x;
    const dy = (obj.y || 0) - (other.y || 0);
    const dz = (obj.z || 0) - (other.z || 0);
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < minDist) {
      minDist = d;
      nearestParent = other;
    }
  }
  if (nearestParent && minDist > 0.1) {
    const M = logScaleMass(nearestParent.mass);
    pe = -(SIM_G * M * m) / minDist;
  }
  const te = ke + pe;
  if (obj.initialTE === null && (obj.isOrbiting || nearestParent)) {
    obj.initialTE = te;
  }
  let energyError = "-";
  let errorClass = "";
  if (obj.initialTE !== null && obj.initialTE !== 0) {
    const err = Math.abs((te - obj.initialTE) / obj.initialTE) * 100;
    energyError = err.toFixed(3) + "%";
    errorClass = err < 1 ? "good" : err < 5 ? "warn" : "bad";
  }

  if (frameCounter % ENERGY_UPDATE_INTERVAL === 0) {
    obj.energyHistory.ke.push(ke);
    obj.energyHistory.pe.push(pe);
    obj.energyHistory.te.push(te);
    obj.energyHistory.frames.push(frameCounter);
    if (obj.energyHistory.ke.length > MAX_ENERGY_HISTORY) {
      obj.energyHistory.ke.shift();
      obj.energyHistory.pe.shift();
      obj.energyHistory.te.shift();
      obj.energyHistory.frames.shift();
    }
    updateEnergyChart(obj);
  }

  // Update isi teks saja tanpa merender ulang HTML
  document.getElementById("val-pos").textContent =
    `(${obj.x.toFixed(1)}, ${(obj.y || 0).toFixed(1)}, ${(obj.z || 0).toFixed(1)})`;
  const badge = document.getElementById("val-orbit-badge");
  badge.textContent = orbitType;
  badge.className = `orbit-badge ${orbitClass}`;
  document.getElementById("val-ecc").textContent = ecc;
  document.getElementById("val-vel").textContent = orbitVel;
  document.getElementById("val-dist").textContent = dist;
  document.getElementById("val-ke").textContent = ke.toExponential(2);
  document.getElementById("val-pe").textContent = pe.toExponential(2);
  document.getElementById("val-te").textContent = te.toExponential(2);

  const errBadge = document.getElementById("val-energy-error");
  errBadge.textContent = energyError;
  errBadge.className = `energy-error-badge ${errorClass}`;
}

// Fungsi hapus objek yang aman
function deleteObject(id) {
  const idx = objects.findIndex((o) => o.id === id);
  if (idx === -1) return;

  const obj = objects[idx];
  scene.remove(obj.mesh);
  if (obj.mesh.geometry) obj.mesh.geometry.dispose();
  if (obj.mesh.material) obj.mesh.material.dispose();

  objects.forEach((o) => {
    if (o.orbitParent === obj) {
      o.isOrbiting = false;
      o.orbitParent = null;
    }
  });

  objects.splice(idx, 1);

  if (selectedObjectId === id) {
    selectedObjectId = null;
    if (energyChart) {
      energyChart.destroy();
      energyChart = null;
    }
    document.getElementById("explore-details").innerHTML =
      '<p class="placeholder-text">Select an object to view details</p>';
  }

  calculateDeformation();
  updateExploreList();
}

function initEnergyChart(obj) {
  const canvas = document.getElementById("energy-chart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (energyChart) energyChart.destroy();

  energyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Total",
          data: [],
          borderColor: "#F5F7FA",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
        },
        {
          label: "Kinetic",
          data: [],
          borderColor: "#22D3EE",
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.1,
        },
        {
          label: "Potential",
          data: [],
          borderColor: "#F59E0B",
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { labels: { color: "#F5F7FA", font: { size: 10 } } } },
      scales: {
        x: {
          display: true,
          ticks: { color: "#9CA3AF", maxTicksLimit: 5, font: { size: 9 } },
          grid: { color: "#171D2B" },
        },
        y: {
          display: true,
          ticks: { color: "#9CA3AF", font: { size: 9 } },
          grid: { color: "#171D2B" },
        },
      },
    },
  });
}

function updateEnergyChart(obj) {
  if (!energyChart || !obj.energyHistory) return;
  energyChart.data.labels = obj.energyHistory.frames;
  energyChart.data.datasets[0].data = obj.energyHistory.te;
  energyChart.data.datasets[1].data = obj.energyHistory.ke;
  energyChart.data.datasets[2].data = obj.energyHistory.pe;
  energyChart.update("none");
}

// Drag
function startDrag(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(objects.map((o) => o.mesh));
  if (intersects.length > 0) {
    const hit = objects.find((o) => o.mesh === intersects[0].object);
    if (hit) {
      isDragging = true;
      draggedObject = hit;
      dragStartPos = { x: event.clientX, y: event.clientY };
      controls.enabled = false;
    }
  }
}

function moveDrag(event) {
  if (!isDragging || !draggedObject) return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  dragPlane.set(new THREE.Vector3(0, 1, 0), -(draggedObject.y || 0));
  raycaster.ray.intersectPlane(dragPlane, dragIntersection);
  const hs = GRID_SIZE_2D / 2 - 5;
  draggedObject.x = Math.max(-hs, Math.min(hs, dragIntersection.x));
  draggedObject.z = Math.max(-hs, Math.min(hs, dragIntersection.z));
  draggedObject.mesh.position.x = draggedObject.x;
  draggedObject.mesh.position.z = draggedObject.z;
  // PERBAIKAN: Update posisi Y mesh agar pas di atas grid saat drag
  draggedObject.mesh.position.y =
    (draggedObject.y || 0) + getVisualRadius(draggedObject.mass) + 1;
}

function endDrag(event) {
  if (isDragging && draggedObject) {
    const dx = event.clientX - dragStartPos.x;
    const dy = event.clientY - dragStartPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 5 && draggedObject.isOrbiting) {
      draggedObject.isOrbiting = false;
      draggedObject.orbitParent = null;
      draggedObject.energyHistory = null;
      draggedObject.initialTE = null;
      draggedObject.hasPromptedOrbit = false;
    }
  }
  if (isDragging) {
    // Update posisi Y mesh agar pas di atas grid (meski paused)
    if (draggedObject) {
      const vr = getVisualRadius(draggedObject.mass);
      draggedObject.mesh.position.y = (draggedObject.y || 0) + vr + 1;
    }
    isDragging = false;
    draggedObject = null;
    dragStartPos = null;
    controls.enabled = true;
    calculateDeformation();
    updateGrid(); // Force update visual grid meski paused
  }
}

// Add Object
document.getElementById("btn-add").addEventListener("click", () => {
  const name = document.getElementById("inp-name").value.trim() || "Unnamed";
  const massStr = document.getElementById("inp-mass").value.trim();
  const color = document.getElementById("inp-color").value;
  const x = parseFloat(document.getElementById("inp-x").value) || 0;
  const y = parseFloat(document.getElementById("inp-y").value) || 0;
  const z = parseFloat(document.getElementById("inp-z").value) || 0;

  const errEl = document.getElementById("add-error");
  errEl.textContent = "";

  if (!massStr) {
    errEl.textContent = "Mass cannot be empty.";
    return;
  }
  const mass = parseMass(massStr);
  if (mass === null) {
    errEl.textContent = "Mass must be a valid number.";
    return;
  }
  if (mass <= 0) {
    errEl.textContent = "Mass must be positive.";
    return;
  }

  createObject({ name, mass, color, x, y, z });

  document.getElementById("inp-name").value = "Star";
  document.getElementById("inp-mass").value = "100";
  errEl.textContent = "Object added successfully!";
  setTimeout(() => (errEl.textContent = ""), 2000);
});

// Examples
document.getElementById("btn-example-reset").addEventListener("click", () => {
  objects.forEach((o) => {
    scene.remove(o.mesh);
    o.mesh.geometry.dispose();
    o.mesh.material.dispose();
  });
  objects.length = 0;
  selectedObjectId = null;
  collisionCooldown.clear()
  clearOrbitTrails();
  document.getElementById("explore-details").innerHTML =
    '<p class="placeholder-text">Select an object to view details</p>';
  calculateDeformation();
  updateExploreList();
  showMainNav();
});

document.getElementById("btn-example-solar").addEventListener("click", () => {
  objects.forEach((o) => {
    scene.remove(o.mesh);
    o.mesh.geometry.dispose();
    o.mesh.material.dispose();
  });
  objects.length = 0;
  selectedObjectId = null;
  collisionCooldown.clear();
  clearOrbitTrails();
  document.getElementById("explore-details").innerHTML =
    '<p class="placeholder-text">Select an object to view details</p>';

  const sun = createObject({
    name: "Sun",
    mass: 333000,
    color: "#FB923C",
    x: 0,
    y: 0,
    z: 0,
  });
  sun.hasPromptedOrbit = true;

  const mercury = createObject({
    name: "Mercury",
    mass: 0.055,
    color: "#9CA3AF",
    x: 30,
    y: 0,
    z: 0,
  });
  setupOrbit(mercury, sun, 30);
  mercury.hasPromptedOrbit = true;

  const venus = createObject({
    name: "Venus",
    mass: 0.815,
    color: "#F59E0B",
    x: 50,
    y: 0,
    z: 0,
  });
  setupOrbit(venus, sun, 50);
  venus.hasPromptedOrbit = true;

  const earth = createObject({
    name: "Earth",
    mass: 1,
    color: "#22D3EE",
    x: 75,
    y: 0,
    z: 0,
  });
  setupOrbit(earth, sun, 75);
  earth.hasPromptedOrbit = true;

  const moon = createObject({
    name: "Moon",
    mass: 0.0123,
    color: "#F5F7FA",
    x: 75 + 8,
    y: 0,
    z: 0,
  });
  setupOrbit(moon, earth, 8);
  moon.hasPromptedOrbit = true;

  const mars = createObject({
    name: "Mars",
    mass: 0.107,
    color: "#F87171",
    x: 100,
    y: 0,
    z: 0,
  });
  setupOrbit(mars, sun, 100);
  mars.hasPromptedOrbit = true;

  const phobos = createObject({
    name: "Phobos",
    mass: 1e-10,
    color: "#9CA3AF",
    x: 100 + 5,
    y: 0,
    z: 0,
  });
  setupOrbit(phobos, mars, 5);
  phobos.hasPromptedOrbit = true;

  const deimos = createObject({
    name: "Deimos",
    mass: 2e-11,
    color: "#9CA3AF",
    x: 100 + 7,
    y: 0,
    z: 0,
  });
  setupOrbit(deimos, mars, 7);
  deimos.hasPromptedOrbit = true;

  calculateDeformation();
  updateExploreList();
  showMainNav();
});

document
  .getElementById("btn-example-blackhole")
  .addEventListener("click", () => {
    objects.forEach((o) => {
      scene.remove(o.mesh);
      o.mesh.geometry.dispose();
      o.mesh.material.dispose();
    });
    objects.length = 0;
    selectedObjectId = null;
    collisionCooldown.clear();
    clearOrbitTrails(); 
    document.getElementById("explore-details").innerHTML =
      '<p class="placeholder-text">Select an object to view details</p>';

    const bh = createObject({
      name: "Black Hole",
      mass: Infinity,
      color: "#000000",
      x: 0,
      y: 0,
      z: 0,
    });
    bh.hasPromptedOrbit = true;

    calculateDeformation();
    updateExploreList();
    showMainNav();
  });

document.getElementById("btn-example-blanet").addEventListener("click", () => {
  objects.forEach((o) => {
    scene.remove(o.mesh);
    o.mesh.geometry.dispose();
    o.mesh.material.dispose();
  });
  objects.length = 0;
  selectedObjectId = null;
  collisionCooldown.clear();
  clearOrbitTrails();
  document.getElementById("explore-details").innerHTML =
    '<p class="placeholder-text">Select an object to view details</p>';

  const bh = createObject({
    name: "Black Hole",
    mass: Infinity,
    color: "#000000",
    x: 0,
    y: 0,
    z: 0,
  });
  bh.hasPromptedOrbit = true;

  const blanet = createObject({
    name: "Blanet",
    mass: 1,
    color: "#22D3EE",
    x: 60,
    y: 0,
    z: 0,
  });
  setupOrbit(blanet, bh, 60);
  blanet.hasPromptedOrbit = true;

  calculateDeformation();
  updateExploreList();
  showMainNav();
});

document.getElementById("btn-example-neutron").addEventListener("click", () => {
  objects.forEach((o) => {
    scene.remove(o.mesh);
    o.mesh.geometry.dispose();
    o.mesh.material.dispose();
  });
  objects.length = 0;
  selectedObjectId = null;
  collisionCooldown.clear();
  clearOrbitTrails();
  document.getElementById("explore-details").innerHTML =
    '<p class="placeholder-text">Select an object to view details</p>';

  const ns = createObject({
    name: "Neutron Star",
    mass: 1e8,
    color: "#22D3EE",
    x: 0,
    y: 0,
    z: 0,
  });
  ns.hasPromptedOrbit = true;

  calculateDeformation();
  updateExploreList();
  showMainNav();
});

document.getElementById("btn-example-pulsar").addEventListener("click", () => {
  objects.forEach((o) => {
    scene.remove(o.mesh);
    o.mesh.geometry.dispose();
    o.mesh.material.dispose();
  });
  objects.length = 0;
  selectedObjectId = null;
  collisionCooldown.clear();
  clearOrbitTrails();
  document.getElementById("explore-details").innerHTML =
    '<p class="placeholder-text">Select an object to view details</p>';

  const ns = createObject({
    name: "Neutron Star",
    mass: 1e8,
    color: "#22D3EE",
    x: 0,
    y: 0,
    z: 0,
  });
  ns.hasPromptedOrbit = true;

  const pp = createObject({
    name: "Pulsar Planet",
    mass: 0.5,
    color: "#F59E0B",
    x: 50,
    y: 0,
    z: 0,
  });
  setupOrbit(pp, ns, 50);
  pp.hasPromptedOrbit = true;

  calculateDeformation();
  updateExploreList();
  showMainNav();
});

// AI
document.getElementById("btn-ai-send").addEventListener("click", async () => {
  const input = document.getElementById("ai-input").value.trim();
  if (!input) return;

  const log = document.getElementById("ai-log");
  const btn = document.getElementById("btn-ai-send");

  log.innerHTML += `<div class="ai-msg user">${input}</div>`;
  document.getElementById("ai-input").value = "";
  btn.disabled = true;
  btn.textContent = "Thinking...";
  log.scrollTop = log.scrollHeight;

  const prompt = `Convert user text to JSON. Reply ONLY with JSON. Examples: User: "buat black hole" {"action":"create","data":{"name":"Black Hole","mass":"inf","color":"#000000","x":0,"y":0,"z":0}} User: "hapus bumi" {"action":"delete","data":{"name":"Earth"}} User: "${input}" JSON:`;

  try {
    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5:1.5b",
        prompt,
        stream: false,
        options: { temperature: 0.1 },
      }),
    });

    if (!res.ok) throw new Error("API Error");
    const data = await res.json();

    let raw = (data.response || "")
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const match = raw.match(/{[\s\S]*}/);

    if (match) {
      processAICommand(JSON.parse(match[0]));
      log.innerHTML += `<div class="ai-msg success">Executed</div>`;
    } else {
      const fb = extractFromText(input);
      if (fb) {
        processAICommand(fb);
        log.innerHTML += `<div class="ai-msg success">Executed (fallback)</div>`;
      } else {
        log.innerHTML += `<div class="ai-msg error">Invalid response</div>`;
      }
    }
  } catch (e) {
    const fb = extractFromText(input);
    if (fb) {
      processAICommand(fb);
      log.innerHTML += `<div class="ai-msg success">Executed (fallback)</div>`;
    } else {
      log.innerHTML += `<div class="ai-msg error">Connection failed: ${e.message}</div>`;
    }
  }

  btn.disabled = false;
  btn.textContent = "Execute";
  log.scrollTop = log.scrollHeight;
});

function extractFromText(text) {
  const lower = text.toLowerCase();
  if (lower.includes("hapus") || lower.includes("delete")) {
    const m = text.match(/(?:hapus|delete|remove)\s+(\w+)/i);
    if (m) return { action: "delete", data: { name: m[1] } };
  }

  let mass = "100",
    name = "Object",
    color = "#FB923C";

  if (lower.includes("black hole") || lower.includes("lubang hitam")) {
    mass = "inf";
    name = "Black Hole";
    color = "#000000";
  } else if (lower.includes("matahari") || lower.includes("sun")) {
    mass = "333000";
    name = "Sun";
    color = "#FB923C";
  } else if (lower.includes("bumi") || lower.includes("earth")) {
    mass = "1";
    name = "Earth";
    color = "#22D3EE";
  } else if (lower.includes("bulan") || lower.includes("moon")) {
    mass = "0.0123";
    name = "Moon";
    color = "#F5F7FA";
  } else if (lower.includes("mars")) {
    mass = "0.107";
    name = "Mars";
    color = "#F87171";
  } else if (lower.includes("venus")) {
    mass = "0.815";
    name = "Venus";
    color = "#F59E0B";
  } else if (lower.includes("merkurius") || lower.includes("mercury")) {
    mass = "0.055";
    name = "Mercury";
    color = "#9CA3AF";
  } else if (lower.includes("neutron")) {
    mass = "1e8";
    name = "Neutron Star";
    color = "#22D3EE";
  }

  const nm = text.match(/(\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*(?:kg|massa|mass)/i);
  if (nm) mass = nm[1];

  const pm = text.match(
    /(?:di|at|position)\s+(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/i,
  );

  return {
    action: "create",
    data: {
      name,
      mass,
      color,
      x: pm ? parseFloat(pm[1]) : 0,
      y: 0,
      z: pm ? parseFloat(pm[2]) : 0,
    },
  };
}

function processAICommand(cmd) {
  if (cmd.action === "create" && cmd.data) {
    const d = cmd.data;
    const mass = parseMass(d.mass);
    if (mass && mass > 0) {
      createObject({
        name: d.name || "AI_Object",
        mass,
        color: d.color || "#FB923C",
        x: parseFloat(d.x) || 0,
        y: parseFloat(d.y) || 0,
        z: parseFloat(d.z) || 0,
      });
    }
  } else if (cmd.action === "delete" && cmd.data?.name) {
    const t = objects.find(
      (o) => o.name.toLowerCase() === cmd.data.name.toLowerCase(),
    );
    if (t) deleteObject(t.id);
  }
}

function createGravityFieldVisualization() {
  while (gravityFieldGroup.children.length > 0) {
    const c = gravityFieldGroup.children[0];
    gravityFieldGroup.remove(c);
    if (c.line) {
      if (c.line.geometry) c.line.geometry.dispose();
      if (c.line.material) c.line.material.dispose();
    }
    if (c.cone) {
      if (c.cone.geometry) c.cone.geometry.dispose();
      if (c.cone.material) c.cone.material.dispose();
    }
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
  }
  if (!showGravityField) return;
  if (dimensionMode === "2D") {
    const ac = 15,
      sp = GRID_SIZE_2D / ac;
    for (let i = 0; i < ac; i++) {
      for (let j = 0; j < ac; j++) {
        const x = -GRID_SIZE_2D / 2 + i * sp + sp / 2;
        const z = -GRID_SIZE_2D / 2 + j * sp + sp / 2;
        let fx = 0,
          fz = 0;
        for (const obj of objects) {
          const dx = obj.x - x;
          const dz = (obj.z || 0) - z;
          const distSq = dx * dx + dz * dz;
          const dist = Math.sqrt(distSq);
          if (dist < 0.1) continue;
          const f = (logScaleMass(obj.mass) * 10) / (distSq + SMOOTHING);
          fx += (dx / dist) * f;
          fz += (dz / dist) * f;
        }
        const fm = Math.sqrt(fx * fx + fz * fz);
        if (fm < 0.01) continue;
        gravityFieldGroup.add(
          new THREE.ArrowHelper(
            new THREE.Vector3(fx, 0, fz).normalize(),
            new THREE.Vector3(x, 0.5, z),
            Math.min(fm * 2, 5),
            0xf59e0b,
            0.5,
            0.3,
          ),
        );
      }
    }
  } else {
    const sp = GRID_SIZE_3D / (GRID_NODES_3D - 1);
    for (let ix = 0; ix < GRID_NODES_3D; ix++) {
      for (let iy = 0; iy < GRID_NODES_3D; iy++) {
        for (let iz = 0; iz < GRID_NODES_3D; iz++) {
          const x = -GRID_SIZE_3D / 2 + ix * sp;
          const y = -GRID_SIZE_3D / 2 + iy * sp;
          const z = -GRID_SIZE_3D / 2 + iz * sp;
          let fx = 0,
            fy = 0,
            fz = 0;
          for (const obj of objects) {
            const dx = obj.x - x;
            const dy = (obj.y || 0) - y;
            const dz = (obj.z || 0) - z;
            const distSq = dx * dx + dy * dy + dz * dz;
            const dist = Math.sqrt(distSq);
            if (dist < 0.1) continue;
            const f = (logScaleMass(obj.mass) * 10) / (distSq + SMOOTHING);
            fx += (dx / dist) * f;
            fy += (dy / dist) * f;
            fz += (dz / dist) * f;
          }
          const fm = Math.sqrt(fx * fx + fy * fy + fz * fz);
          if (fm < 0.01) continue;
          gravityFieldGroup.add(
            new THREE.ArrowHelper(
              new THREE.Vector3(fx, fy, fz).normalize(),
              new THREE.Vector3(x, y, z),
              Math.min(fm * 2, 5),
              0xf59e0b,
              0.5,
              0.3,
            ),
          );
        }
      }
    }
  }
}

function updateGravityField() {
  if (!showGravityField) return;
  createGravityFieldVisualization();
}

// Orbit Trail
function updateOrbitTrail() {
  while (orbitTrailGroup.children.length > 0) {
    const c = orbitTrailGroup.children[0];
    orbitTrailGroup.remove(c);
    if (c.geometry) c.geometry.dispose();
    if (c.material) c.material.dispose();
  }

  if (!showOrbitTrail) return;

  objects.forEach((obj) => {
    if (obj.orbitTrail.length < 2) return;
    const geo = new THREE.BufferGeometry().setFromPoints(obj.orbitTrail);
    const mat = new THREE.LineBasicMaterial({
      color: obj.color,
      transparent: true,
      opacity: 0.7,
    });
    orbitTrailGroup.add(new THREE.Line(geo, mat));
  });
}

const tg = document.getElementById("toggle-gravity-field");
if (tg) {
  tg.addEventListener("change", (e) => {
    showGravityField = e.target.checked;
    if (!showGravityField) {
      while (gravityFieldGroup.children.length > 0) {
        const c = gravityFieldGroup.children[0];
        gravityFieldGroup.remove(c);
        // Deep dispose untuk ArrowHelper
        if (c.line) {
          if (c.line.geometry) c.line.geometry.dispose();
          if (c.line.material) c.line.material.dispose();
        }
        if (c.cone) {
          if (c.cone.geometry) c.cone.geometry.dispose();
          if (c.cone.material) c.cone.material.dispose();
        }
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      }
    }
  });
}

const to = document.getElementById("toggle-orbit-trail");
if (to) {
  to.addEventListener("change", (e) => {
    showOrbitTrail = e.target.checked;
    if (!showOrbitTrail) {
      objects.forEach((o) => (o.orbitTrail = []));
      while (orbitTrailGroup.children.length > 0) {
        const c = orbitTrailGroup.children[0];
        orbitTrailGroup.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      }
    }
  });
}

// Mouse
let mouseDownPos = null;

renderer.domElement.addEventListener("mousedown", (e) => {
  mouseDownPos = { x: e.clientX, y: e.clientY };
  if (e.button === 0) startDrag(e);
});

renderer.domElement.addEventListener("mousemove", (e) => {
  if (isDragging) moveDrag(e);
});

renderer.domElement.addEventListener("mouseup", (e) => {
  if (e.button === 0 && mouseDownPos) {
    const dx = e.clientX - mouseDownPos.x;
    const dy = e.clientY - mouseDownPos.y;
    if (Math.sqrt(dx * dx + dy * dy) < 5) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const intersects = raycaster.intersectObjects(objects.map((o) => o.mesh));
      if (intersects.length > 0) {
        selectObject(intersects[0].object.userData.objId);
        if (
          !document.getElementById("panel-explore").classList.contains("active")
        ) {
          showPanel("explore");
        }
      }
    }
  }
  endDrag(e);
  mouseDownPos = null;
});

renderer.domElement.addEventListener("mouseleave", () => endDrag());

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation
function animate() {
  requestAnimationFrame(animate);
  try {
    if (!isPaused) {
      calculateDeformation();
      updateGrid();
      updateOrbits();
      checkOrbitTriggers();
      checkCollisions();
      updateGravityField();
      updateOrbitTrail();

      if (selectedObjectId) {
        const obj = objects.find((o) => o.id === selectedObjectId);
        if (obj) updateObjectAnalysisDisplay(obj);
      }
    }
    controls.update();
    renderer.render(scene, camera);
  } catch (e) {
    console.error("Animation error:", e);
  }
}

// Loading Screen Effects
let loadingCanvas, loadingCtx;
let loadingAnimId = null;
let loadingStartTime = 0;
let ripples = [];
let particles = [];
let loadingActive = true;

function initLoadingEffects() {
  loadingCanvas = document.getElementById("loading-canvas");
  if (!loadingCanvas) return;
  loadingCtx = loadingCanvas.getContext("2d");
  resizeLoadingCanvas();
  window.addEventListener("resize", resizeLoadingCanvas);
  loadingStartTime = performance.now();
  animateLoading();
}

function resizeLoadingCanvas() {
  if (!loadingCanvas) return;
  loadingCanvas.width = window.innerWidth;
  loadingCanvas.height = window.innerHeight;
}

function drawGrid3D(ctx, time) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const cx = w / 2;
  const cy = h / 2 + 80;
  const gridSize = 20;
  const spacing = 50;
  const rotation = time * 0.00005;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const cameraZ = 500;
  const focalLength = 600;
  const bhRadius = 100;
  const bhDepth = 280;

  ctx.lineWidth = 1;

  // Gambar grid horizontal dengan opacity lebih rendah
  for (let iz = -gridSize / 2; iz <= gridSize / 2; iz++) {
    ctx.beginPath();
    let first = true;
    for (let ix = -gridSize / 2; ix <= gridSize / 2; ix++) {
      let x = ix * spacing;
      let z = iz * spacing;

      const rx = x * cosR - z * sinR;
      const rz = x * sinR + z * cosR;

      const distFromCenter = Math.sqrt(rx * rx + rz * rz);
      let y = 0;

      // Grid melengkung ke BAWAH (positif = ke bawah)
      if (distFromCenter < bhRadius * 3) {
        const factor = Math.max(0, 1 - distFromCenter / (bhRadius * 3));
        y = bhDepth * factor * factor;
      }

      const scale = focalLength / (cameraZ + rz);
      const px = cx + rx * scale;
      const py = cy + y * scale - rz * 0.4;

      // Warna lebih soft dengan gradasi berdasarkan kedalaman
      const depth = y / bhDepth;
      const alpha = 0.15 + depth * 0.25; // Opacity lebih rendah (0.15 - 0.4)
      const hue = 180 + depth * 120;

      ctx.strokeStyle = `hsla(${hue}, 70%, 60%, ${alpha})`;

      if (first) {
        ctx.moveTo(px, py);
        first = false;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
  }

  // Gambar grid vertikal dengan opacity lebih rendah
  for (let ix = -gridSize / 2; ix <= gridSize / 2; ix++) {
    ctx.beginPath();
    let first = true;
    for (let iz = -gridSize / 2; iz <= gridSize / 2; iz++) {
      let x = ix * spacing;
      let z = iz * spacing;

      const rx = x * cosR - z * sinR;
      const rz = x * sinR + z * cosR;

      const distFromCenter = Math.sqrt(rx * rx + rz * rz);
      let y = 0;

      if (distFromCenter < bhRadius * 3) {
        const factor = Math.max(0, 1 - distFromCenter / (bhRadius * 3));
        y = bhDepth * factor * factor;
      }

      const scale = focalLength / (cameraZ + rz);
      const px = cx + rx * scale;
      const py = cy + y * scale - rz * 0.4;

      const depth = y / bhDepth;
      const alpha = 0.15 + depth * 0.25;
      const hue = 180 + depth * 120;

      ctx.strokeStyle = `hsla(${hue}, 70%, 60%, ${alpha})`;

      if (first) {
        ctx.moveTo(px, py);
        first = false;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
  }
}

function updateRipples(time) {
  if (
    ripples.length === 0 ||
    time - ripples[ripples.length - 1].spawnTime > 2000
  ) {
    ripples.push({ spawnTime: time, radius: 0 });
  }
  ripples = ripples.filter((r) => {
    r.radius += 1.5;
    return r.radius < Math.max(window.innerWidth, window.innerHeight) * 0.8;
  });
}

function drawRipples(ctx) {
  const cx = ctx.canvas.width / 2;
  const cy = ctx.canvas.height / 2 + 80;
  ripples.forEach((r) => {
    const opacity = Math.max(0, 1 - r.radius / 500);
    const gradient = ctx.createRadialGradient(
      cx,
      cy,
      r.radius * 0.8,
      cx,
      cy,
      r.radius,
    );
    gradient.addColorStop(0, `rgba(34, 211, 238, 0)`);
    gradient.addColorStop(0.5, `rgba(139, 92, 246, ${opacity * 0.4})`);
    gradient.addColorStop(1, `rgba(34, 211, 238, 0)`);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r.radius, r.radius * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function updateParticles(time) {
  if (particles.length < 30 && Math.random() < 0.2) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.max(window.innerWidth, window.innerHeight) * 0.7;
    particles.push({
      x: window.innerWidth / 2 + Math.cos(angle) * dist,
      y: window.innerHeight / 2 + Math.sin(angle) * dist,
      angle: angle,
      speed: 0.3 + Math.random() * 0.4,
      size: 1 + Math.random() * 1.5,
      opacity: 0.4 + Math.random() * 0.4,
      trail: [],
    });
  }
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2 + 80;
  particles = particles.filter((p) => {
    const dx = cx - p.x;
    const dy = cy - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 40) return false;
    const angle = Math.atan2(dy, dx);
    const tangent = angle + Math.PI / 2;
    const speedFactor = 1 + 400 / Math.max(dist, 50);
    p.x += Math.cos(angle) * p.speed * speedFactor + Math.cos(tangent) * 0.3;
    p.y += Math.sin(angle) * p.speed * speedFactor + Math.sin(tangent) * 0.3;
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 8) p.trail.shift();
    return true;
  });
}

function drawParticles(ctx) {
  particles.forEach((p) => {
    if (p.trail.length > 1) {
      const gradient = ctx.createLinearGradient(
        p.trail[0].x,
        p.trail[0].y,
        p.trail[p.trail.length - 1].x,
        p.trail[p.trail.length - 1].y,
      );
      gradient.addColorStop(0, `rgba(255, 255, 255, 0)`);
      gradient.addColorStop(1, `rgba(255, 255, 255, ${p.opacity * 0.5})`);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.trail[0].x, p.trail[0].y);
      for (let i = 1; i < p.trail.length; i++)
        ctx.lineTo(p.trail[i].x, p.trail[i].y);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawBlackHole(ctx, time) {
  const cx = ctx.canvas.width / 2;
  const cy = ctx.canvas.height / 2 + 80;
  const outerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 150);
  outerGlow.addColorStop(0, "rgba(236, 72, 153, 0.3)");
  outerGlow.addColorStop(0.3, "rgba(139, 92, 246, 0.2)");
  outerGlow.addColorStop(0.7, "rgba(34, 211, 238, 0.1)");
  outerGlow.addColorStop(1, "rgba(34, 211, 238, 0)");
  ctx.fillStyle = outerGlow;
  ctx.beginPath();
  ctx.arc(cx, cy, 150, 0, Math.PI * 2);
  ctx.fill();
  const pulse = 1 + Math.sin(time * 0.002) * 0.05;
  ctx.fillStyle = "rgba(8, 11, 20, 1)";
  ctx.beginPath();
  ctx.arc(cx, cy, 35 * pulse, 0, Math.PI * 2);
  ctx.fill();
  const ringGradient = ctx.createRadialGradient(
    cx,
    cy,
    30 * pulse,
    cx,
    cy,
    45 * pulse,
  );
  ringGradient.addColorStop(0, "rgba(236, 72, 153, 0.9)");
  ringGradient.addColorStop(0.5, "rgba(139, 92, 246, 0.7)");
  ringGradient.addColorStop(1, "rgba(34, 211, 238, 0)");
  ctx.strokeStyle = ringGradient;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, 35 * pulse, 0, Math.PI * 2);
  ctx.stroke();
}

function animateLoading() {
  if (!loadingActive) return;
  const time = performance.now() - loadingStartTime;
  loadingCtx.fillStyle = "rgba(8, 11, 20, 0.15)";
  loadingCtx.fillRect(0, 0, loadingCanvas.width, loadingCanvas.height);
  drawGrid3D(loadingCtx, time);
  updateRipples(time);
  drawRipples(loadingCtx);
  updateParticles(time);
  drawParticles(loadingCtx);
  drawBlackHole(loadingCtx, time);
  loadingAnimId = requestAnimationFrame(animateLoading);
}

function stopLoadingEffects() {
  loadingActive = false;
  if (loadingAnimId) cancelAnimationFrame(loadingAnimId);
}

function createAsteroids() {
  const container = document.getElementById("asteroids-container");
  for (let i = 0; i < 25; i++) {
    const ast = document.createElement("div");
    ast.className = "asteroid";
    ast.style.left = Math.random() * 100 + "%";
    ast.style.top = -100 + "px";
    ast.style.animationDuration = Math.random() * 1.5 + 0.8 + "s";
    ast.style.animationDelay = Math.random() * 3 + "s";
    ast.style.opacity = Math.random() * 0.6 + 0.2;
    container.appendChild(ast);
  }
}

function startLoadingSequence() {
  createAsteroids();
  initLoadingEffects();
  let progress = 0;
  const progressBar = document.getElementById("progress-bar");
  const progressText = document.getElementById("progress-text");
  const startBtn = document.getElementById("btn-start-sim");
  const interval = setInterval(() => {
    progress += Math.random() * 8 + 2;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      startBtn.disabled = false;
    }
    progressBar.style.width = progress + "%";
    progressText.textContent = Math.floor(progress) + "%";
  }, 60);
  startBtn.addEventListener("click", () => {
    stopLoadingEffects();
    document.getElementById("loading-screen").classList.add("hidden");
    setTimeout(() => {
      document.getElementById("loading-screen").style.display = "none";
    }, 500);
  });
}

function init() {
  try {
    calculateDeformation();
    animate();
  } catch (e) {
    console.error("Init error:", e);
  }
  startLoadingSequence();
}

init();
