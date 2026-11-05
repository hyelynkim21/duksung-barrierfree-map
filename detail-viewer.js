// ==================== 상세 캠퍼스 탭: 3D 모델 보기 ====================
// - Blender에서 내보낸 glb를 three.js로 띄움. 설정은 index.html CONFIG.detail 한 곳
//   (모델의 구조·건물 위치·모양은 바꾸지 않고, 보여 주는 방식만 여기서 정함)
// - glTF에는 Blender 셰이더·그림자·색 관리(AgX)가 담기지 않아서 여기서 다시 입힘:
//   툰 재질(명암 단계) + 해 그림자 + AgX 색 관리 + 먼 곳 안개 + 하늘
// - 잔디는 기준 녹색으로, 도로는 조금 어둡게·보행로는 조금 밝게, 나무는 4가지 초록으로 (건물 색은 그대로)
// - 접촉 그림자(지면 AO): 불러올 때 한 번 계산해 건물·나무 밑동 둘레 땅을 부드럽게 어둡게
// - 외곽선은 건물에만 (나무·가로등처럼 작은 것과 바닥 판은 뺌)
// - 처음 시점은 화면 크기에 맞춰 자동 계산 (캠퍼스가 가로 약 88%를 채우는 높은 항공 시점)
// - 조작·버튼·안내 상자 모양은 접근성 지도 탭(MapLibre)과 같게
// - 모델은 '상세 캠퍼스' 탭을 처음 열 때만 불러옴 → 지도만 보는 사람은 glb를 받지 않음
// - 탭을 떠나면 그리기를 멈춰 휴대폰 배터리를 아낌
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const DEF = {
  model: 'models/campus_detail.glb',
  image: '',            // 모델을 못 불러올 때 대신 보여 줄 렌더 이미지 (예: 'models/campus_detail.jpg')
  toon: false,          // true면 카툰 재질(명암 단계). false = Blender 재질 그대로 사실적으로
  toonSteps: [155, 205, 255],   // 명암 단계 밝기 (어두운 쪽 → 밝은 쪽, 0~255). 첫 칸이 낮을수록 지붕·벽 명암 차가 커짐
  outline: false,       // 건물 외곽선 (카툰 느낌일 때만 권장)
  outlineThickness: 0.002,
  outlineColor: '#4a4a50',
  // 외곽선을 빼는 것: 이름(물체·부모·재질)에 이 글자가 들어가거나, 크기가 outlineMinSize(m)보다 작은 것
  outlineSkip: 'tree|나무|leaf|leaves|foliage|canopy|bush|shrub|lamp|light|pole|bollard|볼라드|flag|국기|태극',
  outlineMinSize: 8,
  flatMaxHeight: 0.6,   // 이보다 얇은 판(m)은 바닥 층으로 봄 (잔디·도로·인도·코트)
  flatMaxElev: 1.5,     // 단, 땅에서 이 높이(m) 안에 있는 판만 (평평한 지붕 판은 바닥이 아님)
  // 바닥 색 (건물 색은 그대로)
  //  - grass: 캠퍼스 잔디 기준색. 다른 잔디 구역은 이 색에 원래 밝기 차이만 남김
  //  - farGround: 캠퍼스 밖 지면 (조금 더 어둡게 구분)
  //  - road: 도로 밝기 배율(낮을수록 어둡게), path: 보행로 밝기 배율(높을수록 밝게)
  //  - farGround를 'auto'로 두면 바탕 잔디와 같은 색 (모델 바닥판의 네모난 테두리가 안 보임)
  //  - edge: 캠퍼스 밖 둥근 땅의 크기 (캠퍼스 크기 배율). 캠퍼스 바로 바깥부터 배경색으로 흐려짐
  //  - outer: 캠퍼스 밖 둥근 땅 색 (캠퍼스 땅보다 옅고 차분하게 → 캠퍼스와 바깥을 구분)
  //  - vary: 잔디 구역마다 주는 미세한 명도 차이 (0~0.05)
  ground: { grass: '#7EA85E', farGround: 'auto', outer: '#7E9E62', road: 0.85, path: 1.06, edge: 2.2, vary: 0.03 },
  // 나무: 원래 색을 바탕으로 나무마다 조금씩 다른 4가지 초록 (모양·위치·크기는 그대로)
  //  - scaleJitter: 나무마다 크기를 ±이 비율만큼 다르게 (밑동 높이는 그대로, 위치·개수는 그대로)
  //  - singleMax: 이보다 큰 나무 메시(m)는 여러 그루가 합쳐진 것으로 보고 크기를 바꾸지 않음
  //  - leaves: 잎 색 [기본, 밝은, 어두운, 가장 어두운], weights: 각 색을 쓰는 나무 비율
  //  - trunk: 줄기 색, roughness: 무광 정도 (1에 가까울수록 광택 없음)
  //  - fill: 그늘진 쪽 잎이 검게 뭉치지 않게 잎 색을 살짝 스스로 밝힘 (0~0.3)
  tree: {
    leaves: ['#69A04A', '#84B25E', '#5A8C44', '#84A04E'], weights: [0.40, 0.25, 0.20, 0.15],   // 중간 녹색, 세이지, 짙은 녹색, 올리브
    trunk: '#5B4838', roughness: 0.9, fill: 0.06,
    tone: 1.0,   // 화면 전체 밝기(exposure)와 햇빛을 받아도 정해 준 색에 가깝게 보이도록 잎 색에 곱함
    scaleJitter: 0.12, singleMax: 14
  },
  treePattern: 'tree|나무|leaf|leaves|foliage|canopy|bush|shrub',
  // 접촉 그림자(지면 Ambient Occlusion): 건물·나무 밑동 둘레의 땅을 부드럽게 어둡게
  // 불러올 때 한 번 위에서 내려다본 모양으로 계산해 바닥에 얹음 (움직일 때 추가 부담 없음)
  //  - treeShade: 나무 밑 접촉 그림자는 건물보다 이 비율만큼만 (검은 얼룩 완화)
  ao: { on: true, strength: 0.34, radiusM: 3, treeShade: 0.42 },
  fog: false,           // 끔: 초록 땅과 하늘색이 섞여 생기던 지평선의 회색 띠 제거
  shadows: true,        // 해 그림자 (휴대폰에서 버벅이면 false)
  // 'linear' = 색을 그대로 두고 밝기만 exposure배 / 'agx' = Blender 기본과 비슷(조금 뿌옇게 눌림) / 'none'
  // 'agx' = 밝은 곳이 덜 날아가고 붉은 벽돌이 덜 검붉음(채택) / 'aces' = 대비가 세고 어두운 붉은색이 더 짙어짐
  toneMapping: 'agx',
  exposure: 1.3,
  // 빛: 환경광(하늘·땅 빛)을 줄여 뿌연 느낌을 없애고, 해(Directional Light)로 지붕·벽 명암을 만듦
  //  - 해를 높게 두어 지붕은 밝고 벽은 한 단계 어둡게, 환경광은 그림자가 너무 진하지 않을 만큼
  //  - env: 주변 반사광(하늘·주변이 비치는 부드러운 빛) 세기
  //  - bounce: 건물(유리 제외) 재질에 더하는 아주 약한 간접광 (그늘진 벽이 검붉어지지 않게)
  //  - sunDir: 카메라가 있는 남서쪽 높은 곳에서 비춤 → 보이는 벽면이 햇빛을 받음
  //  - sunColor: 따뜻한 오전~오후 햇빛 색
  light: { hemi: 1.2, sun: 3.3, sunColor: '#FFE7C9', env: 1.1, bounce: 0.14, sunDir: [-0.7, 1.45, 0.4] },
  // 최종 색 보정: 채도·대비를 살짝 올려 뿌연 느낌을 줄임 (1 = 그대로)
  grade: { saturate: 1.12, contrast: 1.06 },
  sky: ['#9CCBEE', '#DCEBF7'],   // 하늘 꼭대기 → 지평선 색
  clouds: { on: true, cover: 0.52, scale: 1.4 },   // 구름: cover가 클수록 구름이 적음
  eyeHeight: 1.6,       // 땅에서 눈높이(m): 카메라가 이보다 낮아지지 않음
  lookUpNear: 0.12,     // 모델 크기 대비 이 거리 안으로 다가가면 올려다보기 가능
  lookUpMax: 0.82,      // 가장 많이 돌렸을 때 각도 (0.5π = 수평, 0.82π ≈ 위로 58°)
  // 처음 시점 (자동 계산)
  //  - azimuth: 바라보는 방향(°, 지도 bearing과 같은 뜻), polar: 수직에서 기운 각도(45 = 수평에서 45° 내려다봄)
  //  - fillW·fillH: 캠퍼스가 화면 가로·세로를 채우는 비율 (둘 중 먼저 닿는 쪽에 맞춤)
  //  - position·target을 직접 적으면 그 자리로 고정 (주소 뒤 ?pick 으로 값 따기)
  //  (polar 66 = 수평에서 약 24° 내려다보는 낮은 사선 시점. fillW가 1보다 크면 양옆이 화면 밖으로 조금 나감)
  //  - mobile: 휴대폰(세로 화면)에서만 덮어쓸 값. 세로 화면은 가로가 좁아 캠퍼스 전체를 넣으면 너무 작아서,
  //    조금 더 내려다보며 가운데를 크게 보여 줌 (양옆은 손가락으로 옮겨 보기)
  view: { azimuth: 75, polar: 66, fillW: 1.15, fillH: 1.15, mobile: { polar: 58, fillW: 2.1, fillH: 1.1 } }
};
const C = Object.assign({}, DEF, (typeof CONFIG !== 'undefined' && CONFIG.detail) || {});
C.view = Object.assign({}, DEF.view, C.view || {});
['ground', 'tree', 'ao', 'light', 'clouds', 'grade'].forEach(k => { C[k] = Object.assign({}, DEF[k], C[k] || {}); });
const PICK = new URLSearchParams(location.search).has('pick');

const root = document.getElementById('detail-view');
const stage = document.getElementById('detail-stage');
const msg = document.getElementById('detail-msg');
const oldReset = document.getElementById('detail-reset');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => window.innerWidth <= 700;

let renderer, scene, camera, controls, effect, sun, sky = null;
let radius = 100, groundY = 0, topFlatY = 0, flatCount = 0, fitPoints = [], home = null;
let started = false, running = false, userMoved = false, anim = null;

// ---------- 화면 모양: 접근성 지도 탭과 같은 버튼·안내 상자 ----------
// (index.html을 다시 고치지 않아도 되게 여기서 넣음)
const css = document.createElement('style');
css.textContent = `
  #detail-view { background: #E8F1F5; }
  #detail-view .detail-cap {
    left: 16px; bottom: 24px; max-width: min(520px, calc(100% - 100px));
    display: block; padding: 12px 22px; border-radius: 28px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, .25); font-size: 13px; line-height: 1.5;
  }
  #detail-view .detail-cap b { font-size: 14px; margin-right: 8px; }
  #detail-view .detail-cap .meta { display: block; margin-top: 2px; font-size: 12px; }
  #detail-view .dv-ctrls { position: absolute; right: 12px; bottom: 28px; z-index: 2; display: grid; gap: 10px; }
  #detail-view .dv-ctrls .maplibregl-ctrl-group { margin: 0; border-radius: 8px; float: none; }
  #detail-view .dv-ctrls button { width: 36px; height: 36px; display: grid; place-items: center; color: var(--ink); }
  #detail-view .dv-ctrls svg { width: 20px; height: 20px; }
  #detail-view .detail-reset { display: none !important; }
  @media (max-width: 700px) {
    #detail-view .detail-cap { left: 8px; bottom: 16px; padding: 8px 14px; border-radius: 18px; font-size: 11.5px; line-height: 1.45; max-width: calc(100% - 68px); }
    #detail-view .detail-cap b { font-size: 12.5px; }
    #detail-view .detail-cap .meta { font-size: 11px; }
    #detail-view .dv-ctrls { right: 8px; bottom: 16px; }
  }`;
document.head.appendChild(css);

function buildUI() {
  const cap = root.querySelector('.detail-cap');
  if (cap) cap.innerHTML = `<b>상세 캠퍼스</b><span>건물 외형 참고용 3D 모델이에요. 접근성 정보는 '접근성 지도' 탭에서 확인해 주세요.</span>
    <span class="meta">${isMobile() ? '한 손가락으로 옮기기, 두 손가락으로 확대·돌리기' : '끌어서 옮기기, 오른쪽 버튼으로 돌리기, 휠로 확대'}</span>`;
  const I = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const btn = (act, label, icon) => `<button type="button" data-act="${act}" title="${label}" aria-label="${label}">${icon}</button>`;
  const box = document.createElement('div');
  box.className = 'dv-ctrls';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', '3D 화면 조작');
  box.innerHTML = `
    <div class="maplibregl-ctrl maplibregl-ctrl-group">${btn('home', '처음 시점으로', I('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'))}</div>
    <div class="maplibregl-ctrl maplibregl-ctrl-group">
      ${btn('left', '왼쪽으로 돌리기', I('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v5h5"/>'))}
      ${btn('right', '오른쪽으로 돌리기', I('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v5h-5"/>'))}
    </div>
    <div class="maplibregl-ctrl maplibregl-ctrl-group">
      ${btn('in', '확대', I('<path d="M12 5v14M5 12h14"/>'))}
      ${btn('out', '축소', I('<path d="M5 12h14"/>'))}
    </div>`;
  root.appendChild(box);
  box.hidden = true;   // 모델이 뜬 뒤에 보임
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || !home) return;
    const a = b.dataset.act;
    if (a === 'home') { goHome(true); return; }
    userMoved = true;
    if (a === 'left' || a === 'right') orbitBy(a === 'left' ? 30 : -30);
    else dollyBy(a === 'in' ? 0.7 : 1 / 0.7);
  });
  return box;
}

function say(text, isError) {
  msg.textContent = text;
  msg.hidden = !text;
  msg.classList.toggle('error', !!isError);
}

// 명암 단계 그림 (가로 n칸, 칸 사이를 섞지 않아 계단처럼 끊김)
function gradientMap(steps) {
  const tex = new THREE.DataTexture(new Uint8Array(steps), steps.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const isGlass = m => m.transmission > 0 || m.transparent || m.opacity < 1;
const meshSize = (o, box = new THREE.Box3(), s = new THREE.Vector3()) => box.setFromObject(o).getSize(s);

// ---------- 색 ----------
const hsl = {}, tgt = {};
const isGreen = h => h.h > 0.17 && h.h < 0.45 && h.s > 0.12;
// 바닥 판 색: 잔디 → 기준 녹색(원래 밝기 차이만 남김), 회색 → 도로(조금 어둡게), 베이지 → 보행로(조금 밝게)
function groundColor(col, baseL, rank = 0) {
  col.getHSL(hsl);
  if (isGreen(hsl)) {
    new THREE.Color(C.ground.grass).getHSL(tgt);
    const n = Math.sin(rank * 91.7 + 13.1) * 43758.5453, jit = ((n - Math.floor(n)) * 2 - 1) * C.ground.vary;   // 구역마다 다른 미세 명도
    col.setHSL(tgt.h, tgt.s, THREE.MathUtils.clamp(tgt.l + (hsl.l - baseL) * 0.9 + jit, 0.15, 0.85));
  } else if (hsl.s < 0.12 && hsl.l < 0.7) {
    col.setHSL(hsl.h, hsl.s, hsl.l * C.ground.road);
  } else if (hsl.h > 0.04 && hsl.h < 0.17 && hsl.l > 0.45) {
    col.setHSL(hsl.h, hsl.s * 0.9, Math.min(0.88, hsl.l * C.ground.path));
  }
}
// 나무 재질: 잎(초록 재질)은 정해 준 세이지·올리브 그린 4색 중 하나, 줄기는 어두운 갈색
// 둘 다 광택 없는 무광 재질 (MeshStandardMaterial, roughness 0.9) — 툰 명암 단계를 쓰지 않아 잎이 검게 끊기지 않음
const treeMatCache = new Map();
function treeMaterial(m, idx) {
  m.color && m.color.getHSL(hsl);
  const leaf = m.color && isGreen(hsl);
  const key = m.uuid + ':' + (leaf ? 'leaf' + idx : 'trunk');
  if (treeMatCache.has(key)) return treeMatCache.get(key);
  const brown = m.color && hsl.h < 0.14 && hsl.s > 0.1 && hsl.l < 0.5;   // 원래 갈색 계열 = 줄기
  const col = leaf ? new THREE.Color(C.tree.leaves[idx]).multiplyScalar(C.tree.tone)
    : brown ? new THREE.Color(C.tree.trunk) : (m.color ? m.color.clone() : new THREE.Color('#ffffff'));
  const t = new THREE.MeshStandardMaterial({
    name: m.name, color: col, map: m.map || null,
    roughness: C.tree.roughness, metalness: 0, envMapIntensity: C.light.env * 0.6,
    emissive: leaf ? col.clone().multiplyScalar(C.tree.fill) : new THREE.Color(0x000000),
    alphaMap: m.alphaMap || null, alphaTest: m.alphaTest || 0, side: m.side,
    transparent: m.transparent, opacity: m.opacity
  });
  t.userData.outlineParameters = { visible: false };
  treeMatCache.set(key, t);
  return t;
}
// 나무마다 잎 색 고르기 (weights 비율대로, 위치로 정해져서 불러올 때마다 같음)
function leafIndex(o) {
  const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
  const qx = Math.round(c.x * 2) / 2, qz = Math.round(c.z * 2) / 2;   // 줄기·잎이 같은 값을 받도록
  const n = Math.sin(qx * 12.9898 + qz * 78.233) * 43758.5453, h = n - Math.floor(n);
  let acc = 0;
  for (let i = 0; i < C.tree.weights.length; i++) { acc += C.tree.weights[i]; if (h < acc) return i; }
  return 0;
}
// 나무 하나 크기를 위치에 따라 ±scaleJitter 만큼
// 땅 위 나무 밑동 지점(테두리 상자 가운데의 바로 아래 땅)을 중심으로 키우고 줄여서
// 줄기와 잎이 따로 된 나무도 같이 커지고, 밑동은 땅에 붙은 채로 있음
function jitterScale(o) {
  const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3());
  const qx = Math.round(c.x * 2) / 2, qz = Math.round(c.z * 2) / 2;   // 줄기·잎이 같은 값을 받도록 0.5m 단위
  const n = Math.sin(qx * 39.346 + qz * 11.135) * 24634.6345;
  const k = 1 + ((n - Math.floor(n)) * 2 - 1) * C.tree.scaleJitter;
  const pivot = new THREE.Vector3(qx, groundY, qz);
  const m = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(new THREE.Matrix4().makeScale(k, k, k))
    .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z))
    .multiply(o.matrixWorld);
  const local = o.parent ? new THREE.Matrix4().copy(o.parent.matrixWorld).invert().multiply(m) : m;
  local.decompose(o.position, o.quaternion, o.scale);
  o.updateMatrixWorld(true);
}

// Blender 재질 → 툰 재질 (색·텍스처·투명도는 그대로 옮김, 같은 재질은 한 번만 바꿈)
function toonify(model) {
  const grad = gradientMap(C.toonSteps);
  const done = new Map();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const skyTint = new THREE.Color(C.sky[0]);
  const conv = m => {
    if (done.has(m)) return done.get(m);
    const glass = isGlass(m);
    // 비스듬한 벽면 텍스처(벽돌·창)를 또렷하게
    [m.map, m.emissiveMap, m.alphaMap].forEach(tx => { if (tx) { tx.anisotropy = aniso; tx.needsUpdate = true; } });
    const t = new THREE.MeshToonMaterial({
      name: m.name,
      color: m.color ? m.color.clone() : new THREE.Color('#ffffff'),
      map: m.map || null,
      gradientMap: grad,
      emissive: m.emissive ? m.emissive.clone() : new THREE.Color('#000000'),
      emissiveMap: m.emissiveMap || null,
      alphaMap: m.alphaMap || null,
      alphaTest: m.alphaTest || 0,
      side: m.side,
      transparent: glass,
      opacity: m.transmission > 0 ? Math.min(m.opacity ?? 1, 0.5) : (m.opacity ?? 1),
      depthWrite: !glass
    });
    // 유리: 하늘빛이 살짝 비치는 느낌 (반사 계산 없이 하늘색을 약하게 더함)
    if (glass) { t.emissive.copy(skyTint).multiplyScalar(0.18); t.color.lerp(skyTint, 0.25); }
    m.dispose();
    done.set(m, t);
    return t;
  };
  model.traverse(o => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
}

// 메시마다 재질을 바꿔 끼우는 도우미 (같은 재질은 key별로 한 번만 복사)
function swapMaterials(o, cache, keyOf, edit) {
  const one = m => {
    const key = m.uuid + ':' + keyOf;
    if (!cache.has(key)) { const c = m.clone(); edit(c); cache.set(key, c); }
    return cache.get(key);
  };
  o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
}

// 외곽선 규칙 + 나무 재질: 건물만 선을 그림
function outlineRules(model) {
  const skipRe = new RegExp(C.outlineSkip, 'i'), treeRe = new RegExp(C.treePattern, 'i');
  const cache = new Map();
  let skipped = 0, kept = 0;
  model.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(m => { m.userData.outlineParameters = { visible: !isGlass(m) }; });
    const names = [o.name, o.parent && o.parent.name, ...mats.map(m => m.name)].join(' ');
    const s = meshSize(o);
    const small = Math.max(s.x, s.y, s.z) < C.outlineMinSize;
    // 이름에 tree가 들어가도 얇은 바닥 판(가로수 줄 밑 잔디 등)은 나무가 아님
    const tree = treeRe.test(names) && s.y >= C.flatMaxHeight;
    if (!skipRe.test(names) && !small) { kept++; return; }
    skipped++;
    if (tree) {
      o.userData.tree = true;
      const idx = leafIndex(o);
      if (Math.max(s.x, s.z) < C.tree.singleMax) jitterScale(o);
      o.material = Array.isArray(o.material) ? o.material.map(m => treeMaterial(m, idx)) : treeMaterial(o.material, idx);
      return;
    }
    swapMaterials(o, cache, 'noline', c => { c.userData.outlineParameters = { visible: false }; });
  });
  console.log(`[상세 캠퍼스] 외곽선: 그림 ${kept}개, 뺌 ${skipped}개 (나무·작은 물체)`);
}

// 건물 재질: 그늘진 벽도 칙칙하지 않게 (모양·텍스처는 그대로, 색 계수와 간접광만)
//  - 붉은 계열(벽돌): 색 계수를 따뜻한 밝은 테라코타 쪽으로
//  - 모든 비유리 건물 재질: 자기 색(텍스처)으로 아주 약하게 스스로 밝힘 = 약한 간접광
//  - 지붕 같은 무채색은 간접광만 더 약하게 (하얗게 날아가지 않게)
function warmBuildings(model) {
  if (C.toon) return;
  const done = new Set(), terracotta = new THREE.Color('#D9836A'), warmWhite = new THREE.Color('#FFEBDD');
  model.traverse(o => {
    if (!o.isMesh || o.userData.tree || o.userData.flat) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
      if (done.has(m) || isGlass(m) || !m.color || !('emissive' in m)) return;
      done.add(m);
      m.color.getHSL(hsl);
      const red = (hsl.h < 0.07 || hsl.h > 0.95) && hsl.s > 0.2;
      if (red && !m.map) m.color.lerp(terracotta, 0.35);      // 단색 벽돌: 밝은 테라코타 쪽으로
      else if (m.map) m.color.multiply(warmWhite);            // 벽돌 텍스처: 살짝 따뜻하게
      const gray = !m.map && hsl.s < 0.12;
      m.emissive.copy(m.color);
      if (m.map) m.emissiveMap = m.map;
      m.emissiveIntensity = C.light.bounce * (gray ? 0.35 : 1);
      m.needsUpdate = true;
    });
  });
}

// 겹친 바닥 층 정리 + 바닥 색 다듬기
// 잔디·도로·인도·코트처럼 얇고 넓은 판은 높이 순서대로 위층이 항상 앞에 그려지게 깊이를 살짝 당김
function layerFlats(model, totalArea) {
  const box = new THREE.Box3(), s = new THREE.Vector3(), c = new THREE.Vector3();
  const flats = [];
  model.traverse(o => {
    if (!o.isMesh) return;
    box.setFromObject(o).getSize(s);
    if (s.y < C.flatMaxHeight && s.x * s.z > 4 && box.min.y < groundY + C.flatMaxElev) flats.push({ o, y: box.getCenter(c).y, area: s.x * s.z });
  });
  flats.sort((a, b) => (a.y - b.y) || (b.area - a.area));
  const cache = new Map();
  let base = null;
  // 가장 넓은 판(바탕 잔디)의 원래 밝기: 다른 잔디 구역은 이것과의 차이만큼만 밝기를 다르게
  const widest = flats.reduce((m, f) => (!m || f.area > m.area ? f : m), null);
  const wm = widest && (Array.isArray(widest.o.material) ? widest.o.material[0] : widest.o.material);
  const baseL = wm && wm.color ? (wm.color.getHSL(tgt), tgt.l) : 0.5;
  topFlatY = flats.reduce((m, f) => Math.max(m, new THREE.Box3().setFromObject(f.o).max.y), groundY);
  flatCount = flats.length;
  flats.forEach((f, i) => {
    const rank = i + 1;
    swapMaterials(f.o, cache, 'flat' + rank, c2 => {
      c2.polygonOffset = true;
      c2.polygonOffsetFactor = -rank;
      c2.polygonOffsetUnits = -rank * 4;
      c2.userData.outlineParameters = { visible: false };
      if (c2.color) groundColor(c2.color, baseL, rank);
    });
    f.o.renderOrder = rank;
    f.o.userData.flat = true;
    // 캠퍼스 전체를 덮는 바탕 판(넓은 잔디판)은 처음 시점 계산에서 뺌
    if (f.area > totalArea * 0.5) f.o.userData.base = true;
    if (!base || f.area > base.area) base = f;
  });
  console.log(`[상세 캠퍼스] 바닥 층 ${flats.length}개 정리`);
  return base && (Array.isArray(base.o.material) ? base.o.material[0] : base.o.material);
}

// 하늘 돔: 위를 볼수록 하늘색, 지평선 근처는 안개와 같은 색 (카메라를 따라다녀서 끝이 안 보임)
function makeSky() {
  sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(C.sky[0]) }, horizon: { value: new THREE.Color(C.sky[1]) },
      cover: { value: C.clouds.cover }, cscale: { value: C.clouds.scale }, con: { value: C.clouds.on ? 1 : 0 }
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform float cover; uniform float cscale; uniform float con; varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main(){
        vec3 d = normalize(vDir);
        vec3 col = mix(horizon, top, smoothstep(0.0, 0.5, d.y));
        if (con > 0.5 && d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.12) * cscale;
          float n = fbm(uv + vec2(3.7, 1.3));
          float c = smoothstep(cover, cover + 0.22, n) * smoothstep(0.03, 0.22, d.y);
          vec3 cloud = mix(vec3(0.86, 0.9, 0.95), vec3(1.0), smoothstep(cover, cover + 0.35, n));
          col = mix(col, cloud, c * 0.92);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  sky.material.userData.outlineParameters = { visible: false };
  return sky;
}

// 캠퍼스 밖 지면: 끝없는 단색 평면 대신, 캠퍼스를 둥글게 두르는 땅을 깔고
// 가장자리는 투명하게 흐려져 지평선 색(배경)으로 스며들게 함 → 네모난 테두리·딱 끊긴 경계가 안 보임
function fadeTexture(from) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, '#fff');
  grd.addColorStop(from, '#fff');
  grd.addColorStop(1, '#000');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(cv);
}
function ringTexture(inner, outer, a, b) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, inner);
  grd.addColorStop(a, inner);
  grd.addColorStop(b, outer);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function addFarGround(box, baseMat) {
  const inner = C.ground.farGround === 'auto' && baseMat && baseMat.color
    ? baseMat.color.clone() : new THREE.Color(C.ground.farGround === 'auto' ? C.ground.grass : C.ground.farGround);
  // 캠퍼스(건물·나무·길) 크기: 바닥판을 뺀 점들로 잼
  const fb = new THREE.Box3().setFromPoints(fitPoints), fs = fb.getSize(new THREE.Vector3());
  const rCampus = Math.hypot(fs.x, fs.z) / 2;
  const r = rCampus * C.ground.edge;
  const f = rCampus / r;   // 캠퍼스 끝 (0~1)
  const opts = {
    color: 0xffffff,
    map: ringTexture('#' + inner.getHexString(), C.ground.outer, Math.min(0.85, f * 0.98), Math.min(0.9, f * 1.12)),
    alphaMap: fadeTexture(Math.max(0.78, Math.min(0.92, f * 1.15))),
    transparent: true, depthWrite: false
  };
  const mat = C.toon
    ? new THREE.MeshToonMaterial({ ...opts, gradientMap: gradientMap(C.toonSteps) })
    : new THREE.MeshStandardMaterial({ ...opts, roughness: 1, envMapIntensity: C.light.env });
  mat.userData.outlineParameters = { visible: false };
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), mat);
  disc.rotation.x = -Math.PI / 2;
  const c = fb.getCenter(new THREE.Vector3());
  disc.position.set(c.x, groundY - 0.3, c.z);
  disc.receiveShadow = true;
  disc.renderOrder = -1;
  scene.add(disc);
}

// ---------- 접촉 그림자 (지면 Ambient Occlusion) ----------
// 1) 위에서 내려다본 건물·나무 모양을 검은 실루엣으로 한 번 그림 (바닥 판은 숨김)
// 2) 흐리게 번지게 해서 밑동 둘레만 부드럽게 어두워지는 그림을 만듦
// 3) 바닥 바로 위에 반투명 판 하나로 얹음 (건물이 가리는 곳은 안 보임). 모델은 건드리지 않음
function boxBlur(a, N, r) {
  const t = new Float32Array(N * N), w = 2 * r + 1;
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < N; y++) {           // 가로
      let s = 0; const row = y * N;
      for (let x = -r; x <= r; x++) s += a[row + Math.min(N - 1, Math.max(0, x))];
      for (let x = 0; x < N; x++) {
        t[row + x] = s / w;
        s += a[row + Math.min(N - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < N; x++) {           // 세로
      let s = 0;
      for (let y = -r; y <= r; y++) s += t[Math.min(N - 1, Math.max(0, y)) * N + x];
      for (let y = 0; y < N; y++) {
        a[y * N + x] = s / w;
        s += t[Math.min(N - 1, y + r + 1) * N + x] - t[Math.max(0, y - r) * N + x];
      }
    }
  }
}
function bakeGroundAO(model, box) {
  const N = isMobile() ? 512 : 1024;
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const w = size.x * 1.04, d = size.z * 1.04;
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, d / 2, -d / 2, 0.1, size.y + 100);
  cam.up.set(0, 0, -1);
  cam.position.set(c.x, box.max.y + 20, c.z);
  cam.lookAt(c.x, box.min.y, c.z);
  const rt = new THREE.WebGLRenderTarget(N, N);
  const hidden = [];
  model.traverse(o => { if (o.isMesh && o.userData.flat && o.visible) { o.visible = false; hidden.push(o); } });
  sky.visible = false;
  const fog = scene.fog; scene.fog = null;
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const grey = new THREE.MeshBasicMaterial({ color: new THREE.Color(1 - C.ao.treeShade, 1 - C.ao.treeShade, 1 - C.ao.treeShade) });
  const saved = [];
  model.traverse(o => { if (o.isMesh) { saved.push([o, o.material]); o.material = o.userData.tree ? grey : black; } });
  const prev = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
  const auto = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0xffffff, 1);
  renderer.setRenderTarget(rt);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  renderer.setClearColor(prev, prevA);
  renderer.shadowMap.autoUpdate = auto;
  saved.forEach(([o, m]) => { o.material = m; });
  scene.fog = fog;
  sky.visible = true;
  hidden.forEach(o => { o.visible = true; });
  const px = new Uint8Array(N * N * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, N, N, px);
  rt.dispose(); black.dispose(); grey.dispose();
  const a = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) a[i] = 1 - px[i * 4] / 255;
  boxBlur(a, N, Math.max(1, Math.round(C.ao.radiusM / (w / N))));
  const out = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) out[i * 4 + 3] = Math.round(Math.min(1, a[i] * 1.6) * C.ao.strength * 255);
  const tex = new THREE.DataTexture(out, N, N, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, toneMapped: false
  });
  mat.userData.outlineParameters = { visible: false };
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(c.x, topFlatY + 0.05, c.z);
  plane.renderOrder = flatCount + 10;
  scene.add(plane);
}

// 해 그림자: 모델 전체를 덮게 범위를 맞추고, 움직이지 않는 장면이라 한 번만 계산
function setupShadows(model, center) {
  model.traverse(o => { if (o.isMesh) { o.castShadow = !o.userData.flat; o.receiveShadow = true; } });
  const dir = new THREE.Vector3(...C.light.sunDir).normalize();
  sun.position.copy(center).add(dir.multiplyScalar(radius * 1.5));
  sun.target.position.copy(center);
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -radius;
  cam.right = cam.top = radius;
  cam.near = radius * 0.1;
  cam.far = radius * 3.5;
  cam.updateProjectionMatrix();
  sun.shadow.mapSize.setScalar(isMobile() ? 2048 : 4096);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = radius / 1500;
  sun.shadow.radius = 1.6;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
}

// ---------- 처음 시점: 화면 크기에 맞춰 자동 계산 ----------
// 건물·나무 등 메시마다 테두리 상자 꼭짓점을 모아 두고, 그 점들이 화면의 fillW×fillH 안에 들어오는
// 가장 가까운 거리를 찾은 뒤, 화면 가운데에 오도록 바라보는 점(땅 위)을 옮김
function collectFitPoints(model) {
  const b = new THREE.Box3();
  model.traverse(o => {
    if (!o.isMesh || o.userData.base) return;
    b.setFromObject(o);
    for (let i = 0; i < 8; i++) fitPoints.push(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
  });
}
// 지금 화면에 쓸 시점 값 (휴대폰이면 mobile 값으로 덮어씀)
const viewNow = () => (isMobile() && C.view.mobile ? { ...C.view, ...C.view.mobile } : C.view);
const viewDir = () => {
  const V = viewNow();
  const az = V.azimuth * Math.PI / 180, po = V.polar * Math.PI / 180;
  return new THREE.Vector3(-Math.sin(po) * Math.sin(az), Math.cos(po), Math.sin(po) * Math.cos(az));
};
function extentsAt(cam) {
  cam.updateMatrixWorld();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const v = new THREE.Vector3();
  for (const p of fitPoints) {
    // 카메라 뒤에 있는 점이 있으면 '안 들어감'으로 봄 (뒤쪽 점은 화면에 뒤집혀 찍혀서 계산이 틀어짐)
    v.copy(p).applyMatrix4(cam.matrixWorldInverse);
    if (v.z > -cam.near) return { x0: -Infinity, x1: Infinity, y0: -Infinity, y1: Infinity };
    v.copy(p).project(cam);
    if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x;
    if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y;
  }
  return { x0, x1, y0, y1 };
}
function computeHome() {
  if (C.view.position && C.view.target) {
    const target = new THREE.Vector3(...C.view.target);
    return { target, pos: new THREE.Vector3(...C.view.position) };
  }
  const cam = camera.clone();
  const dir = viewDir();
  const b = new THREE.Box3().setFromPoints(fitPoints);
  const target = b.getCenter(new THREE.Vector3());
  target.y = groundY;
  const place = d => { cam.position.copy(target).addScaledVector(dir, d); cam.lookAt(target); };
  for (let pass = 0; pass < 3; pass++) {
    // 거리 찾기 (이분 탐색)
    let lo = radius * 0.05, hi = radius * 20;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      place(mid);
      const e = extentsAt(cam);
      const V = viewNow();
      const fits = (e.x1 - e.x0) / 2 <= V.fillW && (e.y1 - e.y0) / 2 <= V.fillH;
      if (fits) hi = mid; else lo = mid;
    }
    place(hi);
    // 화면 가운데로: 모델이 치우친 만큼 바라보는 점을 땅 위에서 옮김
    const e = extentsAt(cam);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2), cam);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY), new THREE.Vector3());
    if (hit) target.copy(hit);
    if (pass === 2) return { target, pos: cam.position.clone() };
  }
}
function applyHome(animate) {
  home = computeHome();
  controls.maxDistance = Math.max(radius * 2.2, home.pos.distanceTo(home.target) * 1.6);
  if (animate && !reduceMotion) startAnim(home.pos, home.target);
  else { anim = null; camera.position.copy(home.pos); controls.target.copy(home.target); controls.update(); }
}
function goHome(animate) {
  userMoved = false;
  applyHome(animate);
}

// ---------- 버튼 조작 (부드럽게 움직임) ----------
function startAnim(pos, target, ms = 450) {
  anim = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), start: performance.now(), ms };
}
function orbitBy(deg) {
  const t = controls.target, off = camera.position.clone().sub(t);
  off.applyAxisAngle(new THREE.Vector3(0, 1, 0), deg * Math.PI / 180);
  if (reduceMotion) { camera.position.copy(t).add(off); controls.update(); }
  else startAnim(t.clone().add(off), t.clone(), 350);
}
function dollyBy(k) {
  const t = controls.target, off = camera.position.clone().sub(t);
  const len = THREE.MathUtils.clamp(off.length() * k, controls.minDistance, controls.maxDistance);
  off.setLength(len);
  if (reduceMotion) { camera.position.copy(t).add(off); controls.update(); }
  else startAnim(t.clone().add(off), t.clone(), 300);
}
function stepAnim(now) {
  if (!anim) return;
  const k = Math.min(1, (now - anim.start) / anim.ms), e = 1 - Math.pow(1 - k, 3);
  camera.position.lerpVectors(anim.p0, anim.p1, e);
  controls.target.lerpVectors(anim.t0, anim.t1, e);
  if (k === 1) anim = null;
}

// 가까이 갈수록 더 눕힐 수 있게: 건물 가까이에서는 땅에 선 눈높이에서 위를 올려다볼 수 있음
function lookUpRules() {
  const d = camera.position.distanceTo(controls.target);
  const near = radius * C.lookUpNear, far = near * 3;
  const k = Math.min(1, Math.max(0, (far - d) / (far - near)));
  controls.maxPolarAngle = Math.PI * (0.47 + (C.lookUpMax - 0.47) * k);
  const minY = groundY + C.eyeHeight;
  if (camera.position.y < minY) {
    const up = minY - camera.position.y;
    camera.position.y += up;
    controls.target.y += up;
  }
  if (k === 0 && !anim && controls.target.y > groundY + 0.5) {
    const down = Math.min(controls.target.y - groundY, radius * 0.01);
    controls.target.y -= down;
    camera.position.y -= down;
  }
}

function resize() {
  if (!renderer) return;
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // 직접 움직이기 전이면 바뀐 화면 크기에 맞춰 처음 시점을 다시 계산 (캠퍼스가 잘리지 않게)
  if (home && !userMoved) applyHome(false);
}

function frame(now) {
  stepAnim(now);
  controls.update();
  lookUpRules();
  if (sky) sky.position.copy(camera.position);
  const dist = camera.position.distanceTo(controls.target);
  const near = Math.max(0.3, dist * 0.02);
  if (Math.abs(near - camera.near) > camera.near * 0.1) { camera.near = near; camera.updateProjectionMatrix(); }
  if (scene.fog) {
    scene.fog.near = dist + radius * 1.4;
    scene.fog.far = dist + radius * 5.5;
  }
  (effect || renderer).render(scene, camera);
}

function setRunning(on) {
  if (!renderer || running === on) return;
  running = on;
  renderer.setAnimationLoop(on ? frame : null);
}

function showImage() {
  if (!C.image) return false;
  stage.innerHTML = `<img class="detail-img" src="${C.image}" alt="덕성여자대학교 캠퍼스 3D 모델 렌더 이미지">`;
  return true;
}

function start() {
  started = true;
  const ctrls = buildUI();
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) {
    if (!showImage()) say('이 기기에서는 3D 모델을 볼 수 없어요.', true);
    return;
  }

  // logarithmicDepthBuffer: 멀리서 볼 때 겹친 바닥이 깜빡이는 것을 줄임
  renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile() ? 1.5 : 2));
  renderer.setClearColor(C.sky[1]);
  const TM = { agx: THREE.AgXToneMapping ?? THREE.ACESFilmicToneMapping, aces: THREE.ACESFilmicToneMapping, linear: THREE.LinearToneMapping };
  if (TM[C.toneMapping]) {
    renderer.toneMapping = TM[C.toneMapping];
    renderer.toneMappingExposure = C.exposure;
  }
  if (C.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;   // PCFSoft보다 경계가 조금 더 또렷 (radius로 부드러움 조절)
  }
  stage.appendChild(renderer.domElement);
  if (C.grade.saturate !== 1 || C.grade.contrast !== 1)
    renderer.domElement.style.filter = `saturate(${C.grade.saturate}) contrast(${C.grade.contrast})`;
  renderer.domElement.setAttribute('aria-hidden', 'true');

  scene = new THREE.Scene();
  scene.fog = C.fog ? new THREE.Fog(C.sky[1], 1000, 2000) : null;
  scene.add(makeSky());
  camera = new THREE.PerspectiveCamera(40, 1, 0.5, 5000);
  // 빛: 하늘·땅 빛(부드러운 환경광) + 비스듬한 해 (따뜻한 흰색)
  scene.add(new THREE.HemisphereLight('#e4f1ff', '#cdbf9f', C.light.hemi));
  // 주변 반사광: 벽·유리·지붕에 하늘과 주변이 은은하게 비치는 사실적인 빛 (한 번만 계산)
  if (C.light.env > 0) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  sun = new THREE.DirectionalLight(C.light.sunColor || '#fff6ea', C.light.sun);
  sun.castShadow = !!C.shadows;
  scene.add(sun, sun.target);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reduceMotion;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 3;
  controls.screenSpacePanning = false;       // 끌어서 옮길 때 땅을 따라 움직임
  controls.zoomToCursor = true;              // 마우스가 가리키는 곳으로 확대 (접근성 지도와 같게)
  // 조작을 접근성 지도와 같게: 왼쪽 끌기 = 옮기기, 오른쪽 끌기 = 돌리기·기울이기
  // 휴대폰: 한 손가락 = 옮기기, 두 손가락 = 확대·돌리기
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.listenToKeyEvents(root);
  controls.addEventListener('start', () => { userMoved = true; anim = null; });

  if (C.outline) {
    effect = new OutlineEffect(renderer, {
      defaultThickness: C.outlineThickness,
      defaultColor: new THREE.Color(C.outlineColor).toArray(),
      defaultAlpha: 1
    });
  }

  resize();
  new ResizeObserver(resize).observe(stage);
  if (PICK) {
    msg.style.userSelect = 'text';
    msg.style.whiteSpace = 'pre-line';
    controls.addEventListener('end', () => {
      const f = v => '[' + v.toArray().map(n => +n.toFixed(1)).join(', ') + ']';
      const line = `view: { position: ${f(camera.position)}, target: ${f(controls.target)} }`;
      say('처음 시점을 고정하려면 index.html CONFIG.detail에 붙여 넣기\n' + line);
      console.log('[상세 캠퍼스] ' + line);
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(line).catch(() => { });
    });
  }

  say('3D 모델을 불러오는 중이에요…');
  new GLTFLoader().load(C.model, gltf => {
    const model = gltf.scene;
    if (C.toon) toonify(model);
    else {
      const aniso = renderer.capabilities.getMaxAnisotropy();
      model.traverse(o => {
        if (!o.isMesh) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
          [m.map, m.emissiveMap, m.normalMap, m.roughnessMap].forEach(tx => { if (tx) { tx.anisotropy = aniso; tx.needsUpdate = true; } });
          if ('envMapIntensity' in m) m.envMapIntensity = C.light.env;
        });
      });
    }
    groundY = new THREE.Box3().setFromObject(model).min.y;   // 나무 크기 조절의 기준 땅 높이
    outlineRules(model);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    radius = size.length() / 2;
    groundY = box.min.y;
    const baseMat = layerFlats(model, size.x * size.z);
    warmBuildings(model);
    scene.add(model);
    const center = box.getCenter(new THREE.Vector3());
    if (C.ao.on) {
      try { bakeGroundAO(model, box); } catch (err) { console.warn('[상세 캠퍼스] 접촉 그림자 계산 실패, 없이 진행:', err); }
    }
    collectFitPoints(model);
    // 모델의 큰 네모 바닥판은 같은 색 둥근 땅이 대신함 (네모 테두리가 지평선에 딱 끊겨 보이던 문제)
    model.traverse(o => { if (o.userData.base) o.visible = false; });
    addFarGround(box, baseMat);
    if (C.shadows) setupShadows(model, center);
    else sun.position.copy(center).add(new THREE.Vector3(...C.light.sunDir).normalize().multiplyScalar(radius * 1.5));
    sun.target.position.copy(center);
    camera.far = radius * 300;
    camera.updateProjectionMatrix();
    sky.scale.setScalar(radius * 250);
    applyHome(false);
    say(PICK ? '시점 따기 모드: 원하는 화면으로 맞추면 값이 여기에 나와요' : '');
    ctrls.hidden = false;
    setRunning(!root.hidden);
  }, e => {
    const mb = (e.loaded / 1048576).toFixed(1);
    say(e.lengthComputable && e.total
      ? `3D 모델을 불러오는 중이에요… ${Math.round(e.loaded / e.total * 100)}%`
      : `3D 모델을 불러오는 중이에요… ${mb}MB`);
  }, err => {
    console.error('[상세 캠퍼스] glb 불러오기 실패:', C.model, err);
    renderer.domElement.remove();
    if (!showImage()) say('3D 모델을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.', true);
  });
}

// index.html의 setTab이 탭을 바꿀 때 부름
window.detailViewer = {
  open() {
    if (!started) start();
    else { resize(); setRunning(true); }
  },
  close() { setRunning(false); }
};
if (oldReset) oldReset.hidden = true;   // 예전 오른쪽 위 버튼은 오른쪽 아래 버튼 묶음으로 옮김
if (!root.hidden) window.detailViewer.open();
