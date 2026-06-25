import { useEffect, useRef } from 'react';
import './MeteorShower.css';
import { usePageVisibility } from '../contexts/PageVisibilityContext';

const MeteorShower = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isVisible } = usePageVisibility();

  useEffect(() => {
    // 如果頁面不可見，完全不啟動流星雨
    if (!isVisible) {
      console.log('MeteorShower: 已暫停 (頁面不可見)');
      return;
    }

    const createMeteor = () => {
      if (!containerRef.current || !isVisible) return;

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

    // 減少流星創建頻率以提升效能
    const interval = setInterval(() => {
      if (isVisible) {
        createMeteor();
      }
    }, 5000); // 從 3 秒增加到 5 秒

    // 減少初始流星數量
    for (let i = 0; i < 2; i++) {
      setTimeout(() => {
        if (isVisible) {
          createMeteor();
        }
      }, i * 2000); // 間隔增加到 2 秒
    }

    return () => {
      clearInterval(interval);
      // 清理所有現存的流星
      if (containerRef.current) {
        const meteors = containerRef.current.querySelectorAll('.meteor');
        meteors.forEach(meteor => { meteor.remove(); });
      }
    };
  }, [isVisible]);

  return <div ref={containerRef} className="meteor-shower-container"></div>;
};

export default MeteorShower;
