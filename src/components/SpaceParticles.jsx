import { useEffect, useRef } from 'react';
import './SpaceParticles.css';
import { usePageVisibility } from '../contexts/PageVisibilityContext';

const SpaceParticles = () => {
  const canvasRef = useRef(null);
  const { isVisible } = usePageVisibility();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationId;
    let particles = [];

    // 設置 canvas 尺寸
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    // 初始化 canvas 尺寸
    resizeCanvas();

    // 監聽視窗大小變化
    window.addEventListener('resize', resizeCanvas);

    // 粒子類別定義
    class Particle {
      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 0.5;
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.speedY = (Math.random() - 0.5) * 0.5;
        this.opacity = Math.random() * 0.8 + 0.2;
        this.color = this.getRandomColor();
        this.twinkle = Math.random() * 0.02 + 0.01;
        this.twinkleOffset = Math.random() * Math.PI * 2;
      }

      getRandomColor() {
        const colors = [
          'rgba(255, 255, 255, ',
          'rgba(0, 170, 255, ',
          'rgba(138, 43, 226, ',
          'rgba(255, 135, 0, ',
          'rgba(0, 255, 127, '
        ];
        return colors[Math.floor(Math.random() * colors.length)];
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.opacity = 0.5 + Math.sin(Date.now() * this.twinkle + this.twinkleOffset) * 0.3;
        
        // 邊界檢測與反彈
        if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
        if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
        
        this.x = Math.max(0, Math.min(canvas.width, this.x));
        this.y = Math.max(0, Math.min(canvas.height, this.y));
      }

      draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = this.color + this.opacity + ')';
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color + '0.8)';
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      }
    }

    // 連接粒子的函數
    const connectParticles = () => {
      const maxDistance = 100;
      
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < maxDistance) {
            const opacity = (1 - distance / maxDistance) * 0.3;
            ctx.save();
            ctx.globalAlpha = opacity;
            ctx.strokeStyle = 'rgba(255, 255, 255, ' + opacity + ')';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    };

    // 動畫循環 - 關鍵優化點
    const animate = () => {
      // 🚨 頁面不可見時完全停止動畫
      if (!isVisible) {
        animationId = requestAnimationFrame(animate);
        return; // 不執行任何繪圖操作，節省 CPU/GPU 資源
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particles.forEach(particle => {
        particle.update();
        particle.draw();
      });
      
      connectParticles();
      animationId = requestAnimationFrame(animate);
    };

    // 初始化並啟動動畫
    const particleCount = Math.floor((canvas.width * canvas.height) / 15000);
    particles = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }
    
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [isVisible]);

  return <canvas ref={canvasRef} className="space-particles-canvas" />;
};

export default SpaceParticles;