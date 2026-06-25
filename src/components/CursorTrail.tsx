import { useRef, useEffect, useCallback } from 'react';
import './CursorTrail.css';

// 粒子類別 (簡單版)
class Particle {
  x: number;
  y: number;
  size: number;
  opacity: number;
  decay: number;
  vx: number;
  vy: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.size = Math.random() * 2 + 1; // 粒子大小 1-3px
    this.opacity = 1;
    this.decay = Math.random() * 0.015 + 0.01; // 衰減速度 0.01 - 0.025
    // 可選：添加微小的隨機移動
    this.vx = (Math.random() - 0.5) * 0.5;
    this.vy = (Math.random() - 0.5) * 0.5;
  }

  update() {
    this.opacity -= this.decay;
    this.x += this.vx;
    this.y += this.vy;
    this.size *= 0.98; // 粒子逐漸縮小
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`; // 白色粒子
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

const CursorTrail = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const mousePos = useRef({ x: 0, y: 0 });
  const animationFrameId = useRef<number>(0);

  // 更新滑鼠位置
  const handleMouseMove = useCallback((event: MouseEvent) => {
    mousePos.current = { x: event.clientX, y: event.clientY };
    if (Math.random() > 0.5) { // 50% 機率添加
       particles.current.push(new Particle(mousePos.current.x, mousePos.current.y));
    }
  }, []);

  // 動畫循環
  const animateParticles = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return; // 檢查 canvas 是否存在
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 清除畫布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 更新和繪製粒子
    particles.current = particles.current.filter(p => p.opacity > 0 && p.size > 0.1); // 移除消失的粒子
    particles.current.forEach(p => {
      p.update();
      p.draw(ctx);
    });

    // 限制粒子數量，避免效能問題
    if (particles.current.length > 100) {
        particles.current = particles.current.slice(particles.current.length - 100);
    }


    animationFrameId.current = requestAnimationFrame(animateParticles);
  }, []);

  // 設定和清理
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return; // Add this check

    // 設定畫布大小為視窗大小
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleResize);
    animationFrameId.current = requestAnimationFrame(animateParticles);

    // 清理函數
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId.current);
    };
  }, [handleMouseMove, animateParticles]);

  return <canvas ref={canvasRef} className="cursor-trail-canvas" />;
};

export default CursorTrail;
