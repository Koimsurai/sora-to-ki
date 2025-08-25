import React, { useEffect, useRef } from 'react';
import './MeteorShower.css';

const MeteorShower = () => {
  const containerRef = useRef(null);

  useEffect(() => {
    const createMeteor = () => {
      if (!containerRef.current) return;

      const meteor = document.createElement('div');
      meteor.className = 'meteor';
      
      // 隨機位置和大小
      const startX = Math.random() * window.innerWidth;
      const startY = -50;
      const size = Math.random() * 3 + 1;
      const duration = Math.random() * 3 + 2;
      const delay = Math.random() * 2;
      
      meteor.style.left = `${startX}px`;
      meteor.style.top = `${startY}px`;
      meteor.style.width = `${size}px`;
      meteor.style.height = `${size}px`;
      meteor.style.animationDuration = `${duration}s`;
      meteor.style.animationDelay = `${delay}s`;
      
      containerRef.current.appendChild(meteor);
      
      // 動畫結束後移除元素
      setTimeout(() => {
        if (meteor.parentNode) {
          meteor.parentNode.removeChild(meteor);
        }
      }, (duration + delay) * 1000);
    };

    // 定期創建流星
    const interval = setInterval(createMeteor, 3000);
    
    // 初始創建幾顆流星
    for (let i = 0; i < 3; i++) {
      setTimeout(createMeteor, i * 1000);
    }

    return () => clearInterval(interval);
  }, []);

  return <div ref={containerRef} className="meteor-shower-container"></div>;
};

export default MeteorShower;
