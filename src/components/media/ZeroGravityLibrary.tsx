import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Billboard, Html, OrbitControls, PerformanceMonitor, Stars, useTexture } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { a, useSpring } from '@react-spring/three';
import * as THREE from 'three';
import { useTranslation } from 'react-i18next';
import type { BookRow } from '@koimsurai/api-types';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { proxiedImage } from '@/lib/api';
import './ZeroGravityLibrary.css';

/**
 * 零重力圖書館：書在黑洞周圍的軌道上漂浮。書櫃頁 lazy 載入（three.js 不進 SSR、不進首屏）。
 *
 * 效能的做法照首頁背景（backdrop/StarfieldGpu）：
 *   · 像素密度封頂、分頁切走時停止繪製（frameloop="never"）
 *   · 掉幀就降級：關 Bloom、星星減半——只降不升，避免在臨界點來回切換
 *   · 軟體渲染（SwiftShader / llvmpipe）不開這個模式，按鈕在書櫃頁就不顯示
 *   · prefers-reduced-motion：不自動轉、不漂浮
 *
 * ⚠ 不要再替每本書掛 pointLight。舊版每本書一盞（hover／選取時），每多一盞燈所有 fragment 都要多算
 *   一次光照，23 本書的場景因此很重。現在書的封面用不受光的材質（顏色也才不會被 ACES 洗白），
 *   選取／hover 的光暈是書背後一片半透明的面。
 */

type Book = BookRow;

const coverSrc = proxiedImage;

const BOOK_W = 0.8;
const BOOK_H = 1.2;
const BOOK_D = 0.12;

/** 分頁看不見時停止繪製：useSyncExternalStore 訂閱 visibilitychange。 */
function usePageVisible(): boolean {
  return useSyncExternalStore(
    (cb) => {
      document.addEventListener('visibilitychange', cb);
      return () => document.removeEventListener('visibilitychange', cb);
    },
    () => !document.hidden,
    () => true,
  );
}

/** 封面貼圖載入失敗（代理 404、圖片壞掉）時，只讓那一本退回純色，不能讓整個場景掛掉。 */
class CoverBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** 整個 3D 畫布掛掉（WebGL context 建不起來之類）時的退路。 */
class CanvasBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function CoverFace({ url }: { url: string }) {
  const texture = useTexture(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
  });
  // 封面＝自發光（顏色就是封面本身，不會被 ACES 洗白）＋一點受光：朝黑洞那側會染上吸積盤的暖光。
  // 完全不受光的話書像貼在畫面上的貼紙，跟黑洞不像在同一個空間裡。
  return (
    <meshStandardMaterial
      attach="material-4"
      map={texture}
      emissiveMap={texture}
      emissive="#ffffff"
      emissiveIntensity={0.78}
      roughness={0.85}
      metalness={0}
    />
  );
}

// 書背後的光暈：圓角矩形往外柔和衰減。用純色的面的話，邊緣是一條硬線，看起來是一塊紫色色塊。
const GLOW_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const GLOW_FRAGMENT = `
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    // 到書本外框（UV 中間 0.5×0.6 的範圍）的距離；框內最亮，往外指數衰減
    vec2 d = max(abs(vUv - 0.5) - vec2(0.2, 0.24), 0.0);
    float a = exp(-length(d) * 22.0) * uOpacity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

const PLAIN_COVER = (
  <meshStandardMaterial attach="material-4" color="#2b2346" emissive="#7f5af0" emissiveIntensity={0.25} />
);

/**
 * 一本書的軌道（可變物件：每幀改寫，不觸發重繪）。
 * 書各自繞黑洞公轉，角速度照克卜勒定律 ω ∝ r^-1.5——內圈比外圈快，不是整圈剛體一起轉。
 */
interface Orbit {
  r: number;
  angle: number;
  y: number;
  /** 軌道面的傾斜：y 隨角度起伏的幅度（相對於半徑） */
  tilt: number;
}

const KEPLER_K = 1.5;
/** 放開時離中心比這近，書就會被吸進去 */
const ABSORB_R = 3.6;
const ABSORB_SECS = 1.4;
const REAPPEAR_SECS = 0.8;
const OUTER_R = 11.5;

interface Book3DProps {
  book: Book;
  orbit: Orbit;
  selected: boolean;
  reduced: boolean;
  onSelect: () => void;
  onDragChange: (dragging: boolean) => void;
}

function Book3D({ book, orbit, selected, reduced, onSelect, onDragChange }: Book3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const stretchRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const { camera, raycaster } = useThree();

  // 拖曳用的暫存物件：每幀重用，不要在 useFrame 裡 new
  const planeRef = useRef(new THREE.Plane());
  const offsetRef = useRef(new THREE.Vector3());
  const hitRef = useRef(new THREE.Vector3());
  const tmpRef = useRef(new THREE.Vector3());
  const movedRef = useRef(false);
  /** 被吸進黑洞的動畫：null＝沒在被吸；否則是經過的秒數。之後接著「重新出現」。 */
  const absorbRef = useRef<{ t: number; fromR: number; phase: 'in' | 'out' } | null>(null);
  const phase = useMemo(() => (Number(book.id) * 1.618) % (Math.PI * 2), [book.id]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const u = glowUniformsRef.current.uOpacity;
    u.value += (glowTarget - u.value) * Math.min(1, dt * 10);
    const g = groupRef.current;
    const st = stretchRef.current;
    if (!g || !st) return;

    if (dragging) {
      if (raycaster.ray.intersectPlane(planeRef.current, hitRef.current)) {
        g.position.copy(hitRef.current).sub(offsetRef.current);
        movedRef.current = true;
      }
      return;
    }

    const ab = absorbRef.current;
    if (ab) {
      ab.t += dt;
      if (ab.phase === 'in') {
        // 越靠近越快地螺旋落入，同時被潮汐力拉長（麵條化），最後縮成一點消失
        const p = Math.min(ab.t / ABSORB_SECS, 1);
        const e = p * p;
        orbit.r = ab.fromR * (1 - e) + 1.3 * e;
        orbit.angle += dt * KEPLER_K * 6 * Math.pow(Math.max(orbit.r, 1.3), -1.5);
        orbit.y *= 1 - dt * 3;
        st.scale.set(Math.max(0.02, 1 - 0.9 * e), 1 + 3 * e, 1);
        st.scale.multiplyScalar(1 - 0.85 * Math.pow(p, 4));
        if (p >= 1) {
          // 從外圈的另一側重新出現
          orbit.r = OUTER_R;
          orbit.angle += Math.PI;
          orbit.y = -0.6;
          absorbRef.current = { t: 0, fromR: OUTER_R, phase: 'out' };
        }
      } else {
        const p = Math.min(ab.t / REAPPEAR_SECS, 1);
        st.scale.setScalar(p * p * (3 - 2 * p));
        if (p >= 1) absorbRef.current = null;
      }
    } else if (!reduced && !selected) {
      orbit.angle += dt * KEPLER_K * Math.pow(orbit.r, -1.5);
    }

    const float = reduced || selected ? 0 : Math.sin(state.clock.elapsedTime * 0.6 + phase) * 0.12;
    g.position.set(
      Math.cos(orbit.angle) * orbit.r,
      orbit.y + Math.sin(orbit.angle) * orbit.r * orbit.tilt + float,
      Math.sin(orbit.angle) * orbit.r,
    );
  });

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const g = groupRef.current;
    if (!g || absorbRef.current) return;
    camera.getWorldDirection(hitRef.current);
    planeRef.current.setFromNormalAndCoplanarPoint(hitRef.current, g.position);
    if (raycaster.ray.intersectPlane(planeRef.current, hitRef.current))
      offsetRef.current.copy(hitRef.current).sub(g.position);
    movedRef.current = false;
    setDragging(true);
    onDragChange(true);
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return;
    e.stopPropagation();
    const g = groupRef.current;
    if (g) {
      // 放開的位置換回軌道參數：之後從這裡繼續公轉
      const p = tmpRef.current.copy(g.position);
      orbit.r = Math.max(Math.hypot(p.x, p.z), 0.5);
      orbit.angle = Math.atan2(p.z, p.x);
      orbit.y = p.y - Math.sin(orbit.angle) * orbit.r * orbit.tilt;
      if (orbit.r < ABSORB_R && !reduced) absorbRef.current = { t: 0, fromR: orbit.r, phase: 'in' };
    }
    setDragging(false);
    onDragChange(false);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // 拖過的那一下放開不算點擊
    if (!movedRef.current) onSelect();
  };

  const { scale } = useSpring({
    scale: selected ? 1.6 : hovered || dragging ? 1.2 : 1,
    config: { tension: 260, friction: 26 },
  });
  // 光暈強度在 useFrame 裡緩動（shader uniform，不走 react 重繪）
  const glowUniformsRef = useRef({ uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#b8a4ff') } });
  const glowTarget = selected ? 0.9 : hovered || dragging ? 0.6 : 0;

  // 貼在 3D 書上的貼圖：256px 寬，拉近看也夠清楚
  const url = coverSrc(book.cover_url, 256);

  return (
    <a.group
      ref={groupRef}
      scale={scale}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'grab';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = '';
      }}
    >
      {/* 書永遠面向鏡頭：繞 Y 軸自轉的話大部分時間看到的是書背。外層 group 給「被吸進黑洞」的拉長用 */}
      <group ref={stretchRef}>
        <Billboard>
          {/* 光暈：書背後一片半透明的面，取代每本書一盞的 pointLight */}
          <mesh position={[0, 0, -0.08]}>
            <planeGeometry args={[BOOK_W * 2, BOOK_H * 1.7]} />
            <shaderMaterial
              vertexShader={GLOW_VERTEX}
              fragmentShader={GLOW_FRAGMENT}
              uniforms={glowUniformsRef.current}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
          <mesh>
            <boxGeometry args={[BOOK_W, BOOK_H, BOOK_D]} />
            {/* box 的六個面：+x −x +y −y +z(封面) −z */}
            <meshStandardMaterial attach="material-0" color="#e8e2f6" roughness={0.9} />
            <meshStandardMaterial attach="material-1" color="#1d1730" roughness={0.9} />
            <meshStandardMaterial attach="material-2" color="#e8e2f6" roughness={0.9} />
            <meshStandardMaterial attach="material-3" color="#e8e2f6" roughness={0.9} />
            {url ? (
              <CoverBoundary fallback={PLAIN_COVER}>
                <Suspense fallback={PLAIN_COVER}>
                  <CoverFace url={url} />
                </Suspense>
              </CoverBoundary>
            ) : (
              PLAIN_COVER
            )}
            <meshStandardMaterial attach="material-5" color="#1d1730" roughness={0.9} />
          </mesh>
        </Billboard>
      </group>

      {hovered && !selected && (
        <Html position={[0, BOOK_H / 2 + 0.35, 0]} center style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div className="book-label">{book.title}</div>
        </Html>
      )}
    </a.group>
  );
}

// ── 黑洞：逐像素光線追蹤 ─────────────────────────────────────────────
//
// 每個像素從鏡頭射一條光線，在史瓦西時空裡一步步積分它的彎曲（加速度 −1.5·h²·r̂/r⁴，
// h = |r × v| 為守恆量；這是 starless / oseiskar 那一派即時渲染用的近似），途中穿過吸積盤就累加盤的光，
// 掉進事件視界就是黑的，飛出包圍球就是透明（看得到後面的星星與書）。
//
// 所以盤的背面會自然地被彎到黑洞上下方、光子環自己出現，不用再用貼圖假裝。
// 之前那版是「平面的盤＋面向鏡頭的透鏡貼圖＋黑球」三層拼起來的，盤看起來不像繞著黑洞流動。
//
// 畫在一張面向鏡頭、穿過黑洞中心的面上，開深度測試：書在黑洞前面就蓋在上面，在後面就被陰影擋住、
// 透過半透明的盤看得到。單位：shader 裡以史瓦西半徑 rs = 1 計，世界座標 = rs × BH_SCALE。

const BH_SCALE = 0.55; // 1 rs 在世界座標裡的長度：陰影半徑 ≈ 2.6 rs ≈ 1.43
const BH_BOUND = 11; // 包圍球半徑（rs）：外面當直線走，省步數
const DISK_IN = 3; // 最內穩定圓軌道（ISCO）
const DISK_OUT = 9.5;

const bhVertexShader = `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const bhFragmentShader = `
  uniform vec3 uCam;      // 鏡頭的世界座標
  uniform float uScale;   // 1 rs 的世界長度
  uniform float uTime;
  uniform int uSteps;
  varying vec3 vWorld;

  const float RB = ${BH_BOUND.toFixed(1)};
  const float R_INNER = ${DISK_IN.toFixed(1)};
  const float R_OUTER = ${DISK_OUT.toFixed(1)};

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += noise(p) * a; p *= 2.03; a *= 0.5; }
    return v;
  }

  // 溫度配色：沿用前一版（站長說「材質跟光暈表現不錯」的那版）——內圈金白、外圈琥珀、最外緣暗紅。
  // ⚠ 第一版光線追蹤換成「黑體」那種暗紅→橘→白的漸層，加上這個 shader 不走色調映射，整片變得很橘。
  vec3 heat(float t) {
    vec3 c = mix(vec3(0.12, 0.04, 0.07), vec3(0.62, 0.24, 0.12), smoothstep(0.0, 0.3, t));
    c = mix(c, vec3(1.0, 0.68, 0.38), smoothstep(0.3, 0.65, t));
    return mix(c, vec3(1.0, 0.9, 0.78), smoothstep(0.65, 1.0, t));
  }

  // 光線在 p 穿過盤面（y=0）時盤發出的光；dir 是光線前進方向（從鏡頭出發），a 回傳不透明度
  vec3 disk(vec3 p, vec3 dir, out float a) {
    float r = length(p.xz);
    float ang = atan(p.z, p.x);
    // 克卜勒差速：內圈轉得快很多；紋理同時往內漂移（物質被吸進去）
    float omega = 2.6 / pow(r, 1.5);
    float rot = ang - uTime * omega;
    float lr = log(r);
    float n = fbm(vec2(rot * 2.5, lr * 7.0 + uTime * 0.35)) * 0.65
            + fbm(vec2(rot * 7.0 + 1.3, lr * 15.0 + uTime * 0.6)) * 0.35;
    // 被剪切流拉長的細條紋
    float streak = pow(noise(vec2(rot * 18.0, lr * 4.0 + uTime * 0.5)), 3.0);
    n = n * 0.75 + streak * 0.45;

    // 溫度：內圈最熱，往外遞減（跟前一版同一條曲線，用盤內的相對位置算）
    float nr = clamp((r - R_INNER) / (R_OUTER - R_INNER), 0.0, 1.0);
    float t = pow(1.0 - nr, 0.8);
    vec3 c = heat(t);

    // 盤的公轉速度（相對論 β）與光線方向決定都卜勒因子 D；光是往鏡頭跑的，方向是 -dir
    vec3 v = normalize(vec3(-p.z, 0.0, p.x));
    float beta = clamp(0.62 / sqrt(max(r - 1.0, 0.2)), 0.0, 0.7);
    float gamma = inversesqrt(1.0 - beta * beta);
    float D = 1.0 / (gamma * (1.0 - beta * dot(v, -normalize(dir))));
    float grav = sqrt(max(1.0 - 1.0 / r, 0.0));   // 重力紅移
    float g = D * grav;
    float beam = clamp(pow(g, 3.0), 0.08, 4.0);
    c = mix(c * vec3(1.2, 0.65, 0.45), c * vec3(0.8, 0.95, 1.3), smoothstep(0.6, 1.4, g));

    // ISCO 以內是「落入區」：物質不再穩定公轉，快速螺旋掉進事件視界——暗一點、條紋更緊
    float plunge = smoothstep(1.05, R_INNER, r);
    float edge = smoothstep(R_OUTER, R_OUTER * 0.45, r) * mix(0.35, 1.0, smoothstep(R_INNER * 0.9, R_INNER * 1.15, r));
    float I = (0.2 + 0.8 * n) * edge * plunge;
    // 外圈亮度與不透明度都隨溫度下降：外緣是半透明的薄霧，後面的書看得到
    float heatI = 0.35 + 0.65 * t;

    a = clamp(I * (0.55 + 0.6 * t), 0.0, 0.9);
    return c * I * heatI * beam * 2.8;
  }

  void main() {
    vec3 ro = uCam / uScale;
    vec3 rd = normalize(vWorld - uCam);

    // 包圍球外光線走直線：直接跳到球面
    float b = dot(ro, rd);
    float c = dot(ro, ro) - RB * RB;
    float disc = b * b - c;
    if (disc < 0.0) discard;
    float t0 = -b - sqrt(disc);
    vec3 pos = ro + rd * max(t0, 0.0);
    vec3 vel = rd;
    vec3 hv = cross(pos, vel);
    float h2 = dot(hv, hv);

    vec3 col = vec3(0.0);
    float T = 1.0;   // 透射率：1 = 後面的東西完全看得到
    for (int i = 0; i < 220; i++) {
      if (i >= uSteps) break;
      float r2 = dot(pos, pos);
      float r = sqrt(r2);
      // 步長隨距離縮放：遠處大步、靠近光子球（1.5 rs）時小步
      float dt = clamp(0.07 * (r - 0.9), 0.015, 0.9);
      vec3 acc = -1.5 * h2 * pos / (r2 * r2 * r);
      vec3 nvel = vel + acc * dt;
      vec3 npos = pos + nvel * dt;

      // 穿過盤面：線性內插出交點
      if (pos.y * npos.y < 0.0) {
        vec3 hit = mix(pos, npos, pos.y / (pos.y - npos.y));
        float hr = length(hit.xz);
        if (hr < R_OUTER && hr > 1.02) {
          float a;
          vec3 e = disk(hit, nvel, a);
          col += T * e;
          T *= 1.0 - a;
        }
      }
      pos = npos;
      vel = nvel;
      if (dot(pos, pos) < 1.0) { T = 0.0; break; }                 // 掉進事件視界
      if (dot(pos, pos) > RB * RB * 1.02 && dot(pos, vel) > 0.0) break; // 逃出包圍球
      if (T < 0.01) break;
    }
    // 曝光壓縮：這張面不走 renderer 的色調映射，亮處要自己壓——否則最亮的那圈停在飽和的橘，
    // 不會像相機那樣往白色收。1 − e^(−x) 是最簡單的一條，低亮度幾乎不變。
    col = 1.0 - exp(-col * 1.7);
    // 預乘 alpha：rgb 是發出的光，alpha 是擋住後面多少
    gl_FragColor = vec4(col, 1.0 - T);
  }
`;

function KnowledgeBlackHole({ reduced, lowQuality }: { reduced: boolean; lowQuality: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const uniformsRef = useRef({
    uCam: { value: new THREE.Vector3() },
    uScale: { value: BH_SCALE },
    uTime: { value: 0 },
    uSteps: { value: 160 },
  });
  uniformsRef.current.uSteps.value = lowQuality ? 90 : 160;

  useFrame((state) => {
    const u = uniformsRef.current;
    const cam = state.camera;
    u.uCam.value.copy(cam.position);
    if (!reduced) u.uTime.value = state.clock.elapsedTime;
    const m = meshRef.current;
    if (!m) return;
    // 面向鏡頭，大小剛好蓋住包圍球從鏡頭看出去的輪廓：R·d / √(d² − R²)
    m.quaternion.copy(cam.quaternion);
    const R = BH_BOUND * BH_SCALE;
    const d = Math.max(cam.position.length(), R * 1.05);
    m.scale.setScalar(((R * d) / Math.sqrt(d * d - R * R)) * 2.1);
  });

  return (
    <mesh ref={meshRef} renderOrder={5}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        vertexShader={bhVertexShader}
        fragmentShader={bhFragmentShader}
        uniforms={uniformsRef.current}
        transparent
        depthWrite={false}
        // 預乘 alpha：盤的光疊上去、事件視界把後面擋掉
        blending={THREE.CustomBlending}
        blendSrc={THREE.OneFactor}
        blendDst={THREE.OneMinusSrcAlphaFactor}
        toneMapped={false}
      />
    </mesh>
  );
}

// ── 場景 ──────────────────────────────────────────────────────────────

interface SceneProps {
  books: Book[];
  selectedId: number | null;
  onSelect: (b: Book) => void;
  reduced: boolean;
  lowQuality: boolean;
  /** 正在關閉：鏡頭往後拉，外框同時淡出 */
  leaving: boolean;
  /** 第一幀畫出來了 */
  onReady: () => void;
}

/** 關閉動畫的長度：外框淡出與鏡頭後拉都用它，結束才真的卸載 */
const EXIT_MS = 450;

/** 兩圈傾斜的軌道，第二圈較大、反向傾斜，書才不會排成一條直線。 */
function initialOrbits(n: number): Orbit[] {
  const inner = Math.min(n, 11);
  return Array.from({ length: n }, (_, i) => {
    const ring = i < inner ? 0 : 1;
    const k = ring === 0 ? i : i - inner;
    const count = ring === 0 ? inner : n - inner;
    return {
      r: ring === 0 ? 8 : OUTER_R,
      angle: (k / count) * Math.PI * 2 + ring * 0.3,
      y: ring === 0 ? 0.6 : -0.6,
      tilt: ring === 0 ? 0.12 : -0.18,
    };
  });
}

/**
 * 鏡頭距離跟著畫面比例走：直立的手機畫面水平視角很窄，用桌機的距離的話外圈的書全在畫面外。
 * 俯角維持約 15°（y / z ≈ 0.26）——再低吸積盤就變成一條線，再高黑洞會被盤面擋住。
 * 只在掛載與視窗改變比例時設定，使用者自己用 OrbitControls 拉近拉遠之後不會被蓋掉。
 *
 * 進場時鏡頭從遠處飛進來、離場時往後拉（配合外框的淡入淡出）。
 * ⚠ 起點與終點都夾在 FLY_MAX 內：OrbitControls 的 maxDistance 是 60，超過的話它下一幀
 *   就把鏡頭夾回 60，飛到一半會突然跳一下。
 */
const FLY_MAX = 56;
const ENTER_S = 1.4;
const EXIT_S = EXIT_MS / 1000;

function CameraRig({ leaving, reduced, onReady }: { leaving: boolean; reduced: boolean; onReady: () => void }) {
  const { camera, size } = useThree();
  const aspect = size.width / Math.max(size.height, 1);
  const introDoneRef = useRef(false);
  const readyRef = useRef(false);
  const flyRef = useRef<{
    t: number;
    dur: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    ease: (x: number) => number;
  } | null>(null);

  useEffect(() => {
    const k = aspect >= 1.2 ? 1 : Math.min(1.8, 1.2 / aspect);
    const target = new THREE.Vector3(0, 6.2 * k, 23.5 * k);
    if (introDoneRef.current || reduced) {
      camera.position.copy(target);
      camera.lookAt(0, 0, 0);
      return;
    }
    introDoneRef.current = true;
    // 從更高、更遠的地方往下飛進來，看起來像接近一顆黑洞
    const from = new THREE.Vector3(0, target.y * 3.2, target.z * 2).setLength(FLY_MAX);
    camera.position.copy(from);
    camera.lookAt(0, 0, 0);
    flyRef.current = { t: 0, dur: ENTER_S, from, to: target, ease: (x) => 1 - (1 - x) ** 3 };
  }, [camera, aspect, reduced]);

  useEffect(() => {
    if (!leaving || reduced) return;
    const from = camera.position.clone();
    const to = from.clone().setLength(Math.min(FLY_MAX, from.length() * 2));
    flyRef.current = { t: 0, dur: EXIT_S, from, to, ease: (x) => x * x };
  }, [camera, leaving, reduced]);

  useFrame((_, rawDt) => {
    // 第一幀真的畫出來了才通知外框淡入畫布：前面那段是在編 shader，主執行緒卡住、畫面還是黑的
    if (!readyRef.current) {
      readyRef.current = true;
      onReady();
    }
    const f = flyRef.current;
    if (!f) return;
    // 第一幀的 dt 包含編 shader 的那一秒，不夾住的話鏡頭一開始就飛完大半
    const dt = Math.min(rawDt, 1 / 30);
    f.t = Math.min(1, f.t + dt / f.dur);
    camera.position.lerpVectors(f.from, f.to, f.ease(f.t));
    camera.lookAt(0, 0, 0);
    if (f.t >= 1) flyRef.current = null;
  });
  return null;
}

function Scene({ books, selectedId, onSelect, reduced, lowQuality, leaving, onReady }: SceneProps) {
  const [dragCount, setDragCount] = useState(0);
  // 每本書的軌道參數：Book3D 每幀直接改寫（公轉、拖曳後的新軌道、被吸進去再出現），不觸發重繪
  const orbits = useMemo(() => initialOrbits(books.length), [books.length]);

  return (
    <>
      {/* 深度霧：遠的書淡進背景，跟黑洞同一個空間（光線追蹤那張面不吃霧，黑洞永遠清楚） */}
      <fog attach="fog" args={['#07050f', 20, 46]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[8, 10, 6]} intensity={0.35} />
      {/* 吸積盤的光：照在書朝黑洞的那一側（越近越亮）。偏淡的暖白，不要把整本書染成橘的 */}
      <pointLight color="#ffd9b8" intensity={3} distance={24} decay={1.4} />

      <Stars
        radius={260}
        depth={60}
        count={lowQuality ? 2500 : 5000}
        factor={4}
        saturation={0}
        fade
        speed={reduced ? 0 : 0.6}
      />

      <CameraRig leaving={leaving} reduced={reduced} onReady={onReady} />
      <KnowledgeBlackHole reduced={reduced} lowQuality={lowQuality} />

      <group>
        {books.map((book, i) => (
          <Book3D
            key={book.id}
            book={book}
            orbit={orbits[i]}
            selected={selectedId === book.id}
            reduced={reduced}
            onSelect={() => onSelect(book)}
            onDragChange={(d) => setDragCount((c) => c + (d ? 1 : -1))}
          />
        ))}
      </group>

      <OrbitControls
        enabled={dragCount === 0}
        enableDamping
        dampingFactor={0.06}
        enablePan={false}
        // 包圍球半徑 11 rs × 0.55 ≈ 6：再近就進到球裡，追蹤用的那張面蓋不住畫面
        minDistance={8}
        maxDistance={60}
        makeDefault
      />

      {!lowQuality && (
        <EffectComposer>
          <Bloom luminanceThreshold={0.7} luminanceSmoothing={0.25} intensity={0.55} radius={0.5} mipmapBlur />
        </EffectComposer>
      )}
    </>
  );
}

// ── 外框 ──────────────────────────────────────────────────────────────

interface ZeroGravityLibraryProps {
  books?: Book[];
  onClose: () => void;
}

export default function ZeroGravityLibrary({ books = [], onClose }: ZeroGravityLibraryProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Book | null>(null);
  const [lowQuality, setLowQuality] = useState(false);
  const visible = usePageVisible();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const closeRef = useRef<HTMLButtonElement>(null);
  const hints = t('bookshelf.zg.hint').split(' · ');

  // Esc：先關詳情，再關整個模式
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 關閉要先播完離場（淡出＋鏡頭後拉）才卸載；Esc 與關閉鈕都走這裡。減少動態時直接關。
  const [leaving, setLeaving] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = useCallback(() => {
    if (leaveTimerRef.current) return;
    if (reduced) {
      onCloseRef.current();
      return;
    }
    setLeaving(true);
    leaveTimerRef.current = setTimeout(() => onCloseRef.current(), EXIT_MS);
  }, [reduced]);
  useEffect(
    () => () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    },
    [],
  );
  const closeFnRef = useRef(close);
  closeFnRef.current = close;

  // 深色底立刻淡入（按下去有反應），3D 畫布等第一幀畫出來才淡入。
  // 兩秒還沒畫出來（WebGL 建不起來、走降級提示）也照樣顯示，不能整片空白。
  const [ready, setReady] = useState(false);
  const markReady = useCallback(() => setReady(true), []);
  useEffect(() => {
    const timer = setTimeout(markReady, 2000);
    return () => clearTimeout(timer);
  }, [markReady]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedRef.current) setSelected(null);
      else closeFnRef.current();
    };
    window.addEventListener('keydown', onKey);
    // 全螢幕覆蓋層開著的時候，底下的頁面不該還能捲
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.cursor = '';
    };
  }, []);

  const statusText = (s?: string | null) =>
    s === 'read'
      ? t('bookshelf.statuses.read')
      : s === 'reading'
        ? t('bookshelf.statuses.reading')
        : t('bookshelf.statuses.toRead');

  const fallback = (
    <div className="zg-fallback">
      <p>{t('bookshelf.zg.unavailable')}</p>
    </div>
  );

  return (
    <div
      className={`zero-gravity-container${ready ? ' is-ready' : ''}${leaving ? ' is-leaving' : ''}`}
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- 同 BookDetailDrawer：全螢幕覆蓋層，<dialog> 的 top-layer 生命週期跟 R3F 的畫布搶同一件事
      role="dialog"
      aria-modal="true"
      aria-label={t('bookshelf.zeroGravity')}
    >
      <CanvasBoundary fallback={fallback}>
        <Canvas
          className="zero-gravity-canvas"
          camera={{ position: [0, 6.2, 23.5], fov: 52 }}
          // 像素密度封頂（同首頁背景）；降級後只畫 1 倍
          dpr={lowQuality ? 1 : [1, 1.75]}
          frameloop={visible ? 'always' : 'never'}
          gl={{ antialias: !lowQuality, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1;
          }}
          onPointerMissed={() => setSelected(null)}
        >
          {/* 掉幀就降級，而且只降不升（同首頁背景：在臨界點來回切換比一直低畫質更難受） */}
          <PerformanceMonitor onDecline={() => setLowQuality(true)} flipflops={1}>
            <Suspense fallback={null}>
              <Scene
                books={books}
                selectedId={selected?.id ?? null}
                onSelect={setSelected}
                reduced={reduced}
                lowQuality={lowQuality}
                leaving={leaving}
                onReady={markReady}
              />
            </Suspense>
          </PerformanceMonitor>
        </Canvas>
      </CanvasBoundary>

      <div className="zg-overlay">
        <div className="zg-top-bar">
          <div className="zg-brand">
            <span className="zg-brand-title">Knowledge Black Hole</span>
            <span className="zg-brand-sub">{t('bookshelf.zg.inOrbit', { count: books.length })}</span>
          </div>
          <button ref={closeRef} type="button" className="zg-close-btn" onClick={close}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            {t('bookshelf.zg.back')}
          </button>
        </div>

        <div className="zg-hints" aria-hidden="true">
          {hints.map((h, i) => (
            <span key={h} className="zg-hint">
              {i > 0 && <span className="zg-hint-dot" />}
              {h}
            </span>
          ))}
        </div>

        {selected && (
          <aside className="zg-detail-panel" aria-label={selected.title}>
            <button
              type="button"
              className="zg-detail-close"
              aria-label={t('bookshelf.close')}
              onClick={() => setSelected(null)}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <div className="zg-detail-head">
              {selected.cover_url && (
                <img
                  src={coverSrc(selected.cover_url, 256)}
                  alt=""
                  className="zg-detail-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <div className="zg-detail-heading">
                <span className="zg-detail-status" data-status={selected.reading_status ?? 'to-read'}>
                  {statusText(selected.reading_status)}
                  {selected.rating != null && <span className="zg-detail-rating">★ {selected.rating}</span>}
                </span>
                <h2 className="zg-detail-title">{selected.title}</h2>
                {selected.authors && <p className="zg-detail-author">{selected.authors}</p>}
              </div>
            </div>
            {selected.personal_notes && <p className="zg-detail-notes">{selected.personal_notes}</p>}
            {selected.description && <p className="zg-detail-desc">{selected.description}</p>}
            <div className="zg-detail-meta">
              {selected.published_date && <span>{selected.published_date}</span>}
              {selected.page_count ? <span>{t('bookshelf.zg.pages', { count: selected.page_count })}</span> : null}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
