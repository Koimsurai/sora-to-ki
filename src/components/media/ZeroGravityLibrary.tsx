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

interface Book3DProps {
  book: Book;
  home: THREE.Vector3Tuple;
  selected: boolean;
  reduced: boolean;
  onSelect: () => void;
  onDragChange: (dragging: boolean) => void;
}

function Book3D({ book, home, selected, reduced, onSelect, onDragChange }: Book3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const { camera, raycaster } = useThree();

  // 拖曳用的暫存物件：每幀重用，不要在 useFrame 裡 new
  const planeRef = useRef(new THREE.Plane());
  const offsetRef = useRef(new THREE.Vector3());
  const hitRef = useRef(new THREE.Vector3());
  const tmpRef = useRef(new THREE.Vector3());
  const movedRef = useRef(false);
  const phase = useMemo(() => (Number(book.id) * 1.618) % (Math.PI * 2), [book.id]);

  useFrame((state, delta) => {
    const u = glowUniformsRef.current.uOpacity;
    u.value += (glowTarget - u.value) * Math.min(1, delta * 10);
    const g = groupRef.current;
    if (!g) return;
    if (dragging) {
      if (raycaster.ray.intersectPlane(planeRef.current, hitRef.current)) {
        // 交點是世界座標，書掛在會旋轉的軌道群組底下，要換回父層座標
        tmpRef.current.copy(hitRef.current).sub(offsetRef.current);
        g.parent?.worldToLocal(tmpRef.current);
        g.position.copy(tmpRef.current);
        movedRef.current = true;
      }
      return;
    }
    if (!reduced && !selected) {
      g.position.y = home[1] + Math.sin(state.clock.elapsedTime * 0.6 + phase) * 0.12;
    }
  });

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const g = groupRef.current;
    if (!g) return;
    g.getWorldPosition(tmpRef.current);
    camera.getWorldDirection(hitRef.current);
    planeRef.current.setFromNormalAndCoplanarPoint(hitRef.current, tmpRef.current);
    if (raycaster.ray.intersectPlane(planeRef.current, hitRef.current))
      offsetRef.current.copy(hitRef.current).sub(tmpRef.current);
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
      home[0] = g.position.x;
      home[1] = g.position.y;
      home[2] = g.position.z;
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
      position={home}
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
      {/* 書永遠面向鏡頭：繞 Y 軸自轉的話大部分時間看到的是書背 */}
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

      {hovered && !selected && (
        <Html position={[0, BOOK_H / 2 + 0.35, 0]} center style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <div className="book-label">{book.title}</div>
        </Html>
      )}
    </a.group>
  );
}

// ── 黑洞 ──────────────────────────────────────────────────────────────

const diskVertexShader = `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const diskFragmentShader = `
  uniform float uTime;
  varying vec3 vPos;

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

  void main() {
    float r = length(vPos.xy);
    float angle = atan(vPos.y, vPos.x);
    float nr = clamp((r - 1.8) / (5.0 - 1.8), 0.0, 1.0);

    // 克卜勒差速：越內圈轉越快
    float omega = 0.8 / pow(max(r, 0.5), 1.5);
    float n = fbm(vec2((angle + uTime * omega) * 3.0, r * 4.0)) * 0.65
            + fbm(vec2((angle + uTime * omega * 0.7) * 2.0 + 3.14, r * 2.5)) * 0.35;
    float spiral = pow(0.5 + 0.5 * sin((angle + log(max(r, 0.1)) * 2.0 - uTime * 0.3) * 3.0), 2.0);
    n *= 0.6 + 0.4 * spiral;

    // 溫度配色：內圈偏白、外圈轉橙紅再到暗紅
    float temp = pow(1.0 - nr, 0.8);
    vec3 color = mix(vec3(0.10, 0.02, 0.06), vec3(0.65, 0.14, 0.05), smoothstep(0.0, 0.3, temp));
    color = mix(color, vec3(0.95, 0.45, 0.10), smoothstep(0.3, 0.65, temp));
    color = mix(color, vec3(1.0, 0.85, 0.65), smoothstep(0.65, 1.0, temp));

    float radial = smoothstep(0.0, 0.18, nr) * smoothstep(1.0, 0.65, nr);
    float doppler = 1.0 + 0.45 * sin(angle - uTime * 0.2);
    // ⚠ 亮度係數原本是 2.5，加上加法混合與 Bloom，內圈整片爆成白色（看不出紋理）。
    float brightness = (n * 0.6 + 0.4) * radial * doppler * 1.15;
    gl_FragColor = vec4(color * brightness, brightness * 0.9);
  }
`;

// 光子環：事件視界外緣一圈細而亮的光，面向鏡頭。少了它，黑色球體看起來只是一顆黑球。
const haloFragmentShader = `
  varying vec3 vPos;
  void main() {
    float r = length(vPos.xy);
    float ring = exp(-pow((r - 1.52) / 0.06, 2.0));          // 細而亮的光子環
    float glow = exp(-pow((r - 1.6) / 0.55, 2.0)) * 0.22;     // 外面一圈柔和的散光
    float a = (ring * 0.9 + glow) * smoothstep(1.38, 1.46, r);
    gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * a, a);
  }
`;

function KnowledgeBlackHole({ reduced }: { reduced: boolean }) {
  const uniformsRef = useRef({ uTime: { value: 0 } });
  useFrame((state) => {
    if (!reduced) uniformsRef.current.uTime.value = state.clock.elapsedTime;
  });

  return (
    <group>
      {/* 事件視界：純黑、不受光也不參與 Bloom */}
      <mesh renderOrder={10}>
        <sphereGeometry args={[1.4, 48, 48]} />
        <meshBasicMaterial color="#000000" toneMapped={false} />
      </mesh>

      <mesh rotation={[Math.PI / 2.15, 0, 0]} renderOrder={5}>
        <ringGeometry args={[1.8, 5.0, 192, 24]} />
        <shaderMaterial
          vertexShader={diskVertexShader}
          fragmentShader={diskFragmentShader}
          uniforms={uniformsRef.current}
          transparent
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <Billboard>
        <mesh renderOrder={11}>
          <planeGeometry args={[4.4, 4.4]} />
          <shaderMaterial
            vertexShader={diskVertexShader}
            fragmentShader={haloFragmentShader}
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
function orbitPositions(n: number): THREE.Vector3Tuple[] {
  const inner = Math.min(n, 11);
  return Array.from({ length: n }, (_, i) => {
    const ring = i < inner ? 0 : 1;
    const k = ring === 0 ? i : i - inner;
    const count = ring === 0 ? inner : n - inner;
    const angle = (k / count) * Math.PI * 2 + ring * 0.3;
    const radius = ring === 0 ? 8 : 11.5;
    const tilt = ring === 0 ? 0.12 : -0.18;
    return [
      Math.cos(angle) * radius,
      Math.sin(angle) * radius * tilt + (ring === 0 ? 0.6 : -0.6),
      Math.sin(angle) * radius,
    ];
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
  const orbitRef = useRef<THREE.Group>(null);
  const [dragCount, setDragCount] = useState(0);
  // 每本書的「家」：拖曳放開後就停在新的位置（陣列在 Book3D 裡被直接改寫，不觸發重繪）
  const homes = useMemo(() => orbitPositions(books.length), [books.length]);

  useFrame((_, delta) => {
    // 整圈軌道緩緩繞黑洞公轉；拖曳中或選取中停下來，不然書會從游標底下溜走
    if (orbitRef.current && !reduced && dragCount === 0 && selectedId == null) {
      orbitRef.current.rotation.y += Math.min(delta, 0.05) * 0.035;
    }
  });

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
      <KnowledgeBlackHole reduced={reduced} />

      <group ref={orbitRef}>
        {books.map((book, i) => (
          <Book3D
            key={book.id}
            book={book}
            home={homes[i]}
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
