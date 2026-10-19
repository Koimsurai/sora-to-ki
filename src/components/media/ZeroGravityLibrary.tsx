import { Component, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Billboard, Html, OrbitControls, PerformanceMonitor, Stars, useTexture } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { a, useSpring } from '@react-spring/three';
import * as THREE from 'three';
import { useTranslation } from 'react-i18next';
import type { BookRow } from '@koimsurai/api-types';

import { useMediaQuery } from '@/hooks/useMediaQuery';
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

const coverSrc = (url?: string | null) => (url ? `/api/image-proxy?url=${encodeURIComponent(url)}` : '');

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
  // 封面不受光、不走色調映射：書的顏色就是封面的顏色
  return <meshBasicMaterial attach="material-4" map={texture} toneMapped={false} />;
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

  const url = coverSrc(book.cover_url);

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

// ── 黑洞 ──────────────────────────────────────────────────────────────
//
// 三層：事件視界（純黑球）、吸積盤（高速差速旋轉＋都卜勒增亮）、重力透鏡（盤的背面被彎到黑洞上下方）。
// 外加一群往內螺旋、在事件視界消失的光點——「光被吸進去」。全部在 shader 裡算，CPU 每幀只更新一個 uTime。

const DISK_TILT = Math.PI / 2.15;

const diskVertexShader = `
  varying vec3 vPos;
  varying float vDop;
  void main() {
    vPos = position;
    // 盤面上這一點的公轉方向（切線），換到視角座標：z 分量為正＝朝鏡頭過來
    // 都卜勒增亮要用「相對鏡頭」的方向，鏡頭繞著轉時亮的那一側才會跟著換
    vec3 tangent = normalize(vec3(-position.y, position.x, 0.0));
    vDop = normalize((modelViewMatrix * vec4(tangent, 0.0)).xyz).z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NOISE_GLSL = `
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
    for (int i = 0; i < 5; i++) { v += noise(p) * a; p *= 2.0; a *= 0.5; }
    return v;
  }
  // 溫度配色：內圈偏白、外圈轉橙紅再到暗紅
  vec3 diskColor(float nr) {
    float temp = pow(1.0 - nr, 0.8);
    vec3 c = mix(vec3(0.10, 0.02, 0.06), vec3(0.65, 0.14, 0.05), smoothstep(0.0, 0.3, temp));
    c = mix(c, vec3(0.95, 0.45, 0.10), smoothstep(0.3, 0.65, temp));
    return mix(c, vec3(1.0, 0.85, 0.65), smoothstep(0.65, 1.0, temp));
  }
`;

const diskFragmentShader = `
  uniform float uTime;
  varying vec3 vPos;
  varying float vDop;
  ${NOISE_GLSL}

  void main() {
    float r = length(vPos.xy);
    float angle = atan(vPos.y, vPos.x);
    float nr = clamp((r - 1.8) / (5.0 - 1.8), 0.0, 1.0);

    // 克卜勒差速：ω ∝ r^-1.5，內圈轉得比外圈快很多——看得出「高速旋轉」
    float omega = 3.2 / pow(max(r, 0.5), 1.5);
    float a1 = angle - uTime * omega;
    float n = fbm(vec2(a1 * 3.0, r * 5.0)) * 0.6 + fbm(vec2(a1 * 7.0 + 1.7, r * 9.0)) * 0.4;
    // 被拉長的條紋：角度方向的頻率高、徑向頻率低，就是高速剪切流的樣子
    float streak = pow(noise(vec2(a1 * 22.0, r * 3.0)), 3.0);
    n = n * 0.8 + streak * 0.5;

    vec3 color = diskColor(nr);
    float radial = smoothstep(0.0, 0.16, nr) * smoothstep(1.0, 0.62, nr);

    // 相對論性都卜勒增亮：朝鏡頭轉過來的那側更亮、偏藍白；遠離的那側變暗、偏紅
    // 指數不能太大：3 次方時遠離的那側只剩 1.5%，整半邊的盤消失，看起來像只有半個盤
    float beam = pow(clamp(1.0 + 0.45 * vDop, 0.5, 1.45), 2.2);
    color = mix(color, color * vec3(0.8, 0.9, 1.25) + 0.08, clamp(vDop, 0.0, 1.0) * 0.6);
    color = mix(color, color * vec3(1.15, 0.7, 0.55), clamp(-vDop, 0.0, 1.0) * 0.5);

    float brightness = (n * 0.65 + 0.35) * radial * beam * 0.85;
    gl_FragColor = vec4(color * brightness, min(brightness, 1.0) * 0.9);
  }
`;

const billboardVertexShader = `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 重力透鏡：盤的背面被黑洞的重力彎過來，在事件視界上下方各形成一道弧（星際效應裡那個樣子）。
// 用一張面向鏡頭的面畫一圈帶狀的盤面紋理，上下方強、左右兩側弱（左右正好是盤面本身的位置）。
const lensFragmentShader = `
  uniform float uTime;
  varying vec3 vPos;
  ${NOISE_GLSL}

  void main() {
    float r = length(vPos.xy);
    float angle = atan(vPos.y, vPos.x);

    // 光子環：事件視界外緣一圈細而亮的光
    float ring = exp(-pow((r - 1.52) / 0.05, 2.0));
    // 透鏡弧：r 在 1.55～2.6 之間的帶狀，越靠內越亮
    float band = smoothstep(1.5, 1.62, r) * smoothstep(2.7, 1.75, r);
    float vertical = pow(abs(sin(angle)), 1.4);
    float n = fbm(vec2((angle - uTime * 0.9) * 4.0, r * 6.0));
    float nr = clamp((r - 1.55) / 1.1, 0.0, 1.0);
    vec3 lens = diskColor(nr) * band * vertical * (0.35 + 0.65 * n) * 1.2;

    float glow = exp(-pow((r - 1.6) / 0.6, 2.0)) * 0.12;
    float hole = smoothstep(1.38, 1.47, r);
    vec3 c = (vec3(1.0, 0.82, 0.55) * (ring * 0.9 + glow) + lens) * hole;
    float a = max(max(c.r, c.g), c.b);
    gl_FragColor = vec4(c, a);
  }
`;

// 被吸進去的光：每顆光點沿著越來越緊的螺旋往內掉，越靠近越快越亮，到事件視界就消失，接著從外圈重生
const infallVertexShader = `
  uniform float uTime;
  uniform float uScale;
  attribute float aSeed;   // 起始角度
  attribute float aPhase;  // 起始的落下進度
  attribute float aSpeed;
  varying float vAlpha;
  void main() {
    float life = fract(uTime * aSpeed + aPhase);
    float fall = pow(life, 1.8);                    // 前段慢、後段急
    float r = mix(6.2, 1.38, fall);
    float angle = aSeed * 6.2831 + uTime * 0.25 + 2.2 * log(6.2 / r) * 2.5; // 角度隨半徑縮小而累積：螺旋
    float h = (aSeed - 0.5) * 0.5 * (r - 1.38) / 4.8;   // 外圈有點厚度，越內越貼平
    vec3 p = vec3(cos(angle) * r, sin(angle) * r, h);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // 淡入 → 越掉越亮 → 碰到事件視界前一刻熄滅（被吸收）
    vAlpha = smoothstep(0.0, 0.15, life) * (0.2 + fall * 0.7) * smoothstep(1.38, 1.6, r);
    gl_PointSize = (1.2 + fall * 2.2) * uScale / -mv.z;
  }
`;

const infallFragmentShader = `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vAlpha;
    gl_FragColor = vec4(vec3(1.0, 0.85, 0.65) * a, a);
  }
`;

/** 有種子的 32-bit PRNG（mulberry32）：同一個種子永遠產生同一串數字。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function InfallingLight({ count, reduced }: { count: number; reduced: boolean }) {
  const { size, viewport } = useThree();
  const uniformsRef = useRef({ uTime: { value: 0 }, uScale: { value: 1 } });
  // 點的大小跟著畫面高度走（像素密度不同時大小一致）
  uniformsRef.current.uScale.value = (size.height * viewport.dpr) / 22;

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const seeds = new Float32Array(count);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    // ⚠ 角度、起始進度、速度要是**三個互相獨立**的亂數。第一版三個都從同一個 i 用線性序列
    //   （i × 黃金比例）算，彼此相關，結果光點排成一圈圈的同心環與弧線，而不是散開的螺旋流。
    //   用有種子的 PRNG：分佈自然、每次開起來又一樣。
    const rand = mulberry32(0x6b6f696d);
    for (let i = 0; i < count; i++) {
      seeds[i] = rand();
      phases[i] = rand();
      speeds[i] = 0.05 + rand() * 0.08;
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    g.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    return g;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    if (!reduced) uniformsRef.current.uTime.value = state.clock.elapsedTime;
  });

  return (
    // frustumCulled=false：position 屬性全是 0（真正的位置在 shader 裡算），包圍球是錯的
    <points geometry={geometry} rotation={[DISK_TILT, 0, 0]} frustumCulled={false} renderOrder={7}>
      <shaderMaterial
        vertexShader={infallVertexShader}
        fragmentShader={infallFragmentShader}
        uniforms={uniformsRef.current}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function KnowledgeBlackHole({ reduced, lowQuality }: { reduced: boolean; lowQuality: boolean }) {
  const diskUniformsRef = useRef({ uTime: { value: 0 } });
  const lensUniformsRef = useRef({ uTime: { value: 0 } });
  useFrame((state) => {
    if (reduced) return;
    diskUniformsRef.current.uTime.value = state.clock.elapsedTime;
    lensUniformsRef.current.uTime.value = state.clock.elapsedTime;
  });

  return (
    <group>
      {/* 事件視界：純黑、不受光也不參與 Bloom */}
      <mesh renderOrder={10}>
        <sphereGeometry args={[1.4, 48, 48]} />
        <meshBasicMaterial color="#000000" toneMapped={false} />
      </mesh>

      <mesh rotation={[DISK_TILT, 0, 0]} renderOrder={5}>
        <ringGeometry args={[1.8, 5.0, 192, 24]} />
        <shaderMaterial
          vertexShader={diskVertexShader}
          fragmentShader={diskFragmentShader}
          uniforms={diskUniformsRef.current}
          transparent
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <InfallingLight count={lowQuality ? 600 : 1200} reduced={reduced} />

      <Billboard>
        <mesh renderOrder={11}>
          <planeGeometry args={[5.6, 5.6]} />
          <shaderMaterial
            vertexShader={billboardVertexShader}
            fragmentShader={lensFragmentShader}
            uniforms={lensUniformsRef.current}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </Billboard>
    </group>
  );
}

// ── 場景 ──────────────────────────────────────────────────────────────

interface SceneProps {
  books: Book[];
  selectedId: number | null;
  onSelect: (b: Book) => void;
  reduced: boolean;
  lowQuality: boolean;
}

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
 */
function CameraRig() {
  const { camera, size } = useThree();
  const aspect = size.width / Math.max(size.height, 1);
  useEffect(() => {
    const k = aspect >= 1.2 ? 1 : Math.min(1.8, 1.2 / aspect);
    camera.position.set(0, 6.2 * k, 23.5 * k);
    camera.lookAt(0, 0, 0);
  }, [camera, aspect]);
  return null;
}

function Scene({ books, selectedId, onSelect, reduced, lowQuality }: SceneProps) {
  const [dragCount, setDragCount] = useState(0);
  // 每本書的軌道參數：Book3D 每幀直接改寫（公轉、拖曳後的新軌道、被吸進去再出現），不觸發重繪
  const orbits = useMemo(() => initialOrbits(books.length), [books.length]);

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[8, 10, 6]} intensity={0.9} />
      {/* 黑洞的暖光：只照書的側邊（封面不受光） */}
      <pointLight color="#ff9a4d" intensity={2} distance={20} decay={1.2} />

      <Stars
        radius={260}
        depth={60}
        count={lowQuality ? 2500 : 5000}
        factor={4}
        saturation={0}
        fade
        speed={reduced ? 0 : 0.6}
      />

      <CameraRig />
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
        minDistance={6}
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
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedRef.current) setSelected(null);
      else onCloseRef.current();
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
    // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- 同 BookDetailDrawer：全螢幕覆蓋層，<dialog> 的 top-layer 生命週期跟 R3F 的畫布搶同一件事
    <div className="zero-gravity-container" role="dialog" aria-modal="true" aria-label={t('bookshelf.zeroGravity')}>
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
          <button ref={closeRef} type="button" className="zg-close-btn" onClick={onClose}>
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
                  src={coverSrc(selected.cover_url)}
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
