import React, { useRef, useState, useMemo, Suspense, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { 
  OrbitControls, 
  useTexture, 
  Html, 
  Environment,
  Stars,
  PerspectiveCamera
} from '@react-three/drei';
import { a, useSpring } from '@react-spring/three';
import * as THREE from 'three';
import './ZeroGravityLibrary.css';

// 自訂拖動 Hook - 修復版本
function useDragObject() {
  const [isDragging, setIsDragging] = useState(false);
  const { camera, gl } = useThree();
  const dragPlane = useRef(new THREE.Plane());
  const offset = useRef(new THREE.Vector3());
  const intersection = useRef(new THREE.Vector3());
  const currentPosition = useRef(new THREE.Vector3());

  const bind = useMemo(() => {
    const onPointerDown = (e) => {
      e.stopPropagation();
      
      // 保存當前位置
      currentPosition.current.copy(e.object.position);
      
      // 設定拖動平面 (平行於相機視角)
      const cameraDirection = new THREE.Vector3();
      camera.getWorldDirection(cameraDirection);
      dragPlane.current.setFromNormalAndCoplanarPoint(
        cameraDirection,
        currentPosition.current
      );
      
      // 計算點擊點與物體中心的偏移
      dragPlane.current.projectPoint(e.point, intersection.current);
      offset.current.copy(intersection.current).sub(currentPosition.current);
      
      setIsDragging(true);
      gl.domElement.style.cursor = 'grabbing';
    };

    const onPointerUp = (e) => {
      setIsDragging(false);
      gl.domElement.style.cursor = 'grab';
    };

    return {
      onPointerDown,
      onPointerUp,
    };
  }, [camera, gl]);

  return { ...bind, isDragging };
}

// 單本 3D 書籍組件 (有封面) - 支援拖動
function Book3DWithTexture({ book, initialPosition, onClick, isSelected, onDragStateChange }) {
  const groupRef = useRef();
  const meshRef = useRef();
  const [hovered, setHovered] = useState(false);
  const [position, setPosition] = useState(initialPosition);
  const { onPointerDown, onPointerUp, isDragging } = useDragObject();
  const { camera, raycaster, gl } = useThree();
  
  const dragPlane = useRef(new THREE.Plane());
  const offset = useRef(new THREE.Vector3());
  
  // 通知父組件拖動狀態改變
  useEffect(() => {
    if (onDragStateChange) {
      onDragStateChange(isDragging);
    }
  }, [isDragging, onDragStateChange]);
  
  // 建立指向後端代理的 URL,解決 CORS 問題
  const originalUrl = book.coverUrl;
  const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(originalUrl)}`;
  
  // 使用代理 URL 載入貼圖
  const texture = useTexture(proxyUrl, (tex) => {
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
  });

  // 書本漂浮動畫 (拖動時停用)
  useFrame((state) => {
    if (groupRef.current && !isDragging && !isSelected) {
      meshRef.current.rotation.y += 0.002;
      const floatY = Math.sin(state.clock.elapsedTime + position[0]) * 0.1;
      groupRef.current.position.y = position[1] + floatY;
    }
    
    // 拖動時更新位置
    if (isDragging && groupRef.current) {
      const intersection = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane.current, intersection);
      if (intersection) {
        groupRef.current.position.copy(intersection.sub(offset.current));
      }
    }
  });

  // 處理按下
  const handlePointerDown = (e) => {
    e.stopPropagation();
    
    // 設定拖動平面
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    dragPlane.current.setFromNormalAndCoplanarPoint(
      cameraDirection,
      groupRef.current.position
    );
    
    // 計算偏移
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane.current, intersection);
    offset.current.copy(intersection).sub(groupRef.current.position);
    
    onPointerDown(e);
  };

  // 處理釋放
  const handlePointerUp = (e) => {
    if (isDragging) {
      // 保存新位置
      setPosition([
        groupRef.current.position.x,
        groupRef.current.position.y,
        groupRef.current.position.z
      ]);
    }
    onPointerUp(e);
  };

  // 處理點擊
  const handleClick = (e) => {
    if (!isDragging) {
      e.stopPropagation();
      onClick();
    }
  };

  // 書本尺寸
  const bookWidth = 0.8;
  const bookHeight = 1.2;
  const bookDepth = 0.15;

  // 縮放動畫
  const { scale } = useSpring({
    scale: isSelected ? 1.5 : hovered ? 1.15 : 1,
    config: { tension: 280, friction: 60 }
  });

  return (
    <a.group
      ref={groupRef}
      position={position}
      scale={scale}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerOver={() => !isDragging && setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* 書本主體 */}
      <mesh ref={meshRef} castShadow receiveShadow>
        <boxGeometry args={[bookWidth, bookHeight, bookDepth]} />
        <meshStandardMaterial 
          map={texture}
          metalness={0.2}
          roughness={0.6}
        />
      </mesh>

      {/* 光暈效果 */}
      {(hovered || isSelected || isDragging) && (
        <pointLight
          color={isDragging ? "#fbbf24" : isSelected ? "#a855f7" : "#06b6d4"}
          intensity={isDragging ? 3 : isSelected ? 2 : 1}
          distance={3}
        />
      )}

      {/* 書名標籤 */}
      {(hovered || isDragging) && !isSelected && (
        <Html
          position={[0, bookHeight / 2 + 0.3, 0]}
          center
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <div className="book-label">
            {book.title}
            {isDragging && <div style={{ fontSize: '0.7em', marginTop: '2px' }}>拖動中...</div>}
          </div>
        </Html>
      )}
    </a.group>
  );
}

// 單本 3D 書籍組件 (無封面 - 純色) - 支援拖動
function Book3DNoTexture({ book, initialPosition, onClick, isSelected, onDragStateChange }) {
  const groupRef = useRef();
  const meshRef = useRef();
  const [hovered, setHovered] = useState(false);
  const [position, setPosition] = useState(initialPosition);
  const { onPointerDown, onPointerUp, isDragging } = useDragObject();
  const { camera, raycaster, gl } = useThree();
  
  const dragPlane = useRef(new THREE.Plane());
  const offset = useRef(new THREE.Vector3());
  
  // 通知父組件拖動狀態改變
  useEffect(() => {
    if (onDragStateChange) {
      onDragStateChange(isDragging);
    }
  }, [isDragging, onDragStateChange]);

  // 書本漂浮動畫 (拖動時停用)
  useFrame((state) => {
    if (groupRef.current && !isDragging && !isSelected) {
      meshRef.current.rotation.y += 0.002;
      const floatY = Math.sin(state.clock.elapsedTime + position[0]) * 0.1;
      groupRef.current.position.y = position[1] + floatY;
    }
    
    // 拖動時更新位置
    if (isDragging && groupRef.current) {
      const intersection = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane.current, intersection);
      if (intersection) {
        groupRef.current.position.copy(intersection.sub(offset.current));
      }
    }
  });

  // 處理按下
  const handlePointerDown = (e) => {
    e.stopPropagation();
    
    // 設定拖動平面
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    dragPlane.current.setFromNormalAndCoplanarPoint(
      cameraDirection,
      groupRef.current.position
    );
    
    // 計算偏移
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane.current, intersection);
    offset.current.copy(intersection).sub(groupRef.current.position);
    
    onPointerDown(e);
  };

  // 處理釋放
  const handlePointerUp = (e) => {
    if (isDragging) {
      // 保存新位置
      setPosition([
        groupRef.current.position.x,
        groupRef.current.position.y,
        groupRef.current.position.z
      ]);
    }
    onPointerUp(e);
  };

  // 處理點擊
  const handleClick = (e) => {
    if (!isDragging) {
      e.stopPropagation();
      onClick();
    }
  };

  // 書本尺寸
  const bookWidth = 0.8;
  const bookHeight = 1.2;
  const bookDepth = 0.15;

  // 縮放動畫
  const { scale } = useSpring({
    scale: isSelected ? 1.5 : hovered ? 1.15 : 1,
    config: { tension: 280, friction: 60 }
  });

  return (
    <a.group
      ref={groupRef}
      position={position}
      scale={scale}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerOver={() => !isDragging && setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* 書本主體 */}
      <mesh ref={meshRef} castShadow receiveShadow>
        <boxGeometry args={[bookWidth, bookHeight, bookDepth]} />
        <meshStandardMaterial 
          color='#06b6d4'
          metalness={0.5}
          roughness={0.3}
          emissive='#06b6d4'
          emissiveIntensity={0.4}
          toneMapped={false}
        />
      </mesh>

      {/* 光暈效果 */}
      {(hovered || isSelected || isDragging) && (
        <pointLight
          color={isDragging ? "#fbbf24" : isSelected ? "#a855f7" : "#06b6d4"}
          intensity={isDragging ? 3 : isSelected ? 2 : 1}
          distance={3}
        />
      )}

      {/* 書名標籤 */}
      {(hovered || isDragging) && !isSelected && (
        <Html
          position={[0, bookHeight / 2 + 0.3, 0]}
          center
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <div className="book-label">
            {book.title}
            {isDragging && <div style={{ fontSize: '0.7em', marginTop: '2px' }}>拖動中...</div>}
          </div>
        </Html>
      )}
    </a.group>
  );
}

// 包裝組件 - 根據是否有封面選擇組件
function Book3D({ book, initialPosition, onClick, isSelected, onDragStateChange }) {
  // 如果書本有 coverUrl，就使用有材質的版本，否則使用純色版
  if (book.coverUrl) {
    return (
      <Book3DWithTexture
        book={book}
        initialPosition={initialPosition}
        onClick={onClick}
        isSelected={isSelected}
        onDragStateChange={onDragStateChange}
      />
    );
  }

  // 如果沒有封面 URL，則顯示純色版本作為備用
  return (
    <Book3DNoTexture
      book={book}
      initialPosition={initialPosition}
      onClick={onClick}
      isSelected={isSelected}
      onDragStateChange={onDragStateChange}
    />
  );
}

// 太空站核心 (移除環形結構和支架)
function SpaceStation() {
  const coreRef = useRef();

  useFrame(() => {
    if (coreRef.current) {
      coreRef.current.rotation.y += 0.001;
    }
  });

  return (
    <group ref={coreRef}>
      {/* 中央球體 (太空站核心) */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[1.5, 32, 32]} />
        <meshStandardMaterial
          color="#1a1a2e"
          metalness={0.9}
          roughness={0.1}
          emissive="#06b6d4"
          emissiveIntensity={0.8}
          toneMapped={false}
        />
      </mesh>

      {/* 核心發光點 */}
      <pointLight position={[0, 0, 0]} color="#06b6d4" intensity={3} distance={8} />
      <pointLight position={[0, 0, 0]} color="#a855f7" intensity={2} distance={6} />
    </group>
  );
}

// 3D 場景內容
function Scene({ books, onBookClick, selectedBook }) {
  const controlsRef = useRef();
  const draggingBooksRef = useRef(new Set());
  const [isDraggingAnyBook, setIsDraggingAnyBook] = useState(false);
  
  // 處理書籍拖動狀態變化
  const handleBookDragStateChange = (bookId, isDragging) => {
    if (isDragging) {
      draggingBooksRef.current.add(bookId);
    } else {
      draggingBooksRef.current.delete(bookId);
    }
    
    // 只要有任何一本書在拖動,就禁用 OrbitControls
    setIsDraggingAnyBook(draggingBooksRef.current.size > 0);
  };
  
  // 將書籍排列成多個環形軌道
  const booksPerRing = 12;
  const numberOfRings = Math.ceil(books.length / booksPerRing);
  
  const bookPositions = useMemo(() => {
    const positions = [];
    books.forEach((book, index) => {
      const ringIndex = Math.floor(index / booksPerRing);
      const positionInRing = index % booksPerRing;
      const angle = (positionInRing / booksPerRing) * Math.PI * 2;
      
      // 半徑隨著環數增加
      const radius = 8 + ringIndex * 3;
      const x = Math.cos(angle) * radius;
      const y = (ringIndex - numberOfRings / 2) * 2.5;
      const z = Math.sin(angle) * radius;
      
      positions.push([x, y, z]);
    });
    return positions;
  }, [books, booksPerRing, numberOfRings]);

  return (
    <>
      {/* 環境光 - 提高強度 */}
      <ambientLight intensity={0.8} />
      
      {/* 主光源 - 增加多個方向的光源 */}
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, -10, -5]} intensity={0.5} />
      
      {/* 點光源增強中心照明 */}
      <pointLight position={[0, 0, 0]} intensity={1.5} distance={50} decay={2} />
      
      {/* 背景星空 */}
      <Stars
        radius={300}
        depth={50}
        count={5000}
        factor={4}
        saturation={0}
        fade
        speed={1}
      />

      {/* 太空站結構 */}
      <SpaceStation />

      {/* 書籍陣列 */}
      {books.map((book, index) => (
        <Book3D
          key={book.id}
          book={book}
          initialPosition={bookPositions[index]}
          onClick={() => onBookClick(book)}
          isSelected={selectedBook?.id === book.id}
          onDragStateChange={(dragging) => handleBookDragStateChange(book.id, dragging)}
        />
      ))}

      {/* 相機控制 - 拖動書籍時自動禁用 */}
      <OrbitControls
        ref={controlsRef}
        enabled={!isDraggingAnyBook}
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={50}
        makeDefault
      />
    </>
  );
}

// 主組件
export default function ZeroGravityLibrary({ books = [], onClose }) {
  const [selectedBook, setSelectedBook] = useState(null);

  const handleBookClick = (book) => {
    setSelectedBook(book);
  };

  const handleCloseDetails = () => {
    setSelectedBook(null);
  };

  return (
    <div className="zero-gravity-container">
      {/* 3D Canvas */}
      <Canvas
        shadows
        camera={{ position: [0, 5, 20], fov: 60 }}
        className="zero-gravity-canvas"
      >
        <Suspense fallback={null}>
          <Scene
            books={books}
            onBookClick={handleBookClick}
            selectedBook={selectedBook}
          />
        </Suspense>
      </Canvas>

      {/* 2D UI 覆蓋層 */}
      <div className="zero-gravity-ui">
        {/* 頂部控制欄 */}
        <div className="zero-gravity-header">
          <div className="header-title">
            <div className="title-glow">ZERO-GRAVITY LIBRARY</div>
            <div className="subtitle">探索漂浮在星際間的知識寶庫</div>
          </div>
          <button className="close-button" onClick={onClose}>
            <span>返回 2D</span>
            <div className="button-glow"></div>
          </button>
        </div>

        {/* 書籍統計 */}
        <div className="stats-panel">
          <div className="stat-item">
            <span className="stat-value">{books.length}</span>
            <span className="stat-label">書籍總數</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{Math.ceil(books.length / 12)}</span>
            <span className="stat-label">軌道環數</span>
          </div>
        </div>

        {/* 操作說明 */}
        <div className="controls-hint">
          <div className="hint-item">🖱️ 拖曳空白處旋轉視角</div>
          <div className="hint-item">🔍 滾輪縮放距離</div>
          <div className="hint-item">✋ 拖曳書籍移動位置</div>
          <div className="hint-item">👆 點擊書籍查看詳情</div>
        </div>

        {/* 選中書籍詳情面板 */}
        {selectedBook && (
          <div className="book-details-panel">
            <button className="close-details" onClick={handleCloseDetails}>✕</button>
            <div className="details-content">
              <img
                src={selectedBook.coverUrl}
                alt={selectedBook.title}
                className="details-cover"
              />
              <h2 className="details-title">{selectedBook.title}</h2>
              <p className="details-author">{selectedBook.authors?.join(', ')}</p>
              {selectedBook.description && (
                <p className="details-description">{selectedBook.description}</p>
              )}
              <div className="details-meta">
                {selectedBook.publishedDate && (
                  <span className="meta-item">📅 {selectedBook.publishedDate}</span>
                )}
                {selectedBook.pageCount && (
                  <span className="meta-item">📄 {selectedBook.pageCount} 頁</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
