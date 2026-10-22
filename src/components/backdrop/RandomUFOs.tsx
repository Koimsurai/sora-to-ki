import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './RandomUFOs.css'; // 導入 UFO 的 CSS
import { usePageVisibility } from '@/contexts/pageVisibility';

const getRandomValue = (min: number, max: number) => Math.random() * (max - min) + min;

interface UFO {
  id: number;
  startX: string;
  startY: string;
  keyframesX: number[];
  keyframesY: number[];
  duration: number;
  delay: number;
  scale: number;
}

/**
 * 飛碟的動作：慢慢飄、停一下、再飄，最後突然加速竄走（像真的「不明飛行物」）。
 * 前四段是緩慢的漂移，最後一段在很短的時間裡飛出好幾百像素。時間點見 UFO_TIMES。
 */
const createUFO = (): UFO => {
  const duration = getRandomValue(18, 30);
  const keyframesX = [0];
  const keyframesY = [0];
  for (let i = 1; i <= 3; i++) {
    keyframesX.push(keyframesX[i - 1] + getRandomValue(-70, 70));
    keyframesY.push(keyframesY[i - 1] + getRandomValue(-25, 25));
  }
  const dart = getRandomValue(0, Math.PI * 2);
  const reach = getRandomValue(500, 900);
  keyframesX.push(keyframesX[3] + Math.cos(dart) * reach);
  keyframesY.push(keyframesY[3] + Math.sin(dart) * reach * 0.5);

  return {
    id: Math.random(),
    startX: `${getRandomValue(10, 90)}%`,
    startY: `${getRandomValue(8, 60)}%`,
    keyframesX,
    keyframesY,
    duration,
    delay: getRandomValue(5, 25),
    scale: getRandomValue(0.7, 1.1),
  };
};

/** 前四段慢慢飄（中間有一段幾乎停著），最後 4% 的時間竄走 */
const UFO_TIMES = [0, 0.35, 0.5, 0.96, 1];

interface RandomUFOsProps {
  count?: number;
}

const RandomUFOs = ({ count = 1 }: RandomUFOsProps) => {
  // UFO 數量減少為 1
  const { isVisible } = usePageVisibility();
  const [ufos, setUfos] = useState<UFO[]>(() => Array.from({ length: count }, createUFO));

  useEffect(() => {
    // 如果頁面不可見，不啟動 UFO 動畫
    if (!isVisible) {
      console.log('RandomUFOs: 已暫停 (頁面不可見)');
      return;
    }

    // 不再檢查 isVisible：effect 開頭已經 `if (!isVisible) return`，而 isVisible 在
    // 依賴陣列裡——值一變 effect 就整個重掛，同一次執行內它恆為 true。
    const interval = setInterval(() => {
      setUfos((prevUfos) => {
        const newUfos = [...prevUfos];
        const randomIndex = Math.floor(Math.random() * newUfos.length);
        newUfos[randomIndex] = createUFO();
        newUfos[randomIndex].delay = getRandomValue(10, 30); // 確保較長延遲
        return newUfos;
      });
    }, 25000); // 每 25 秒嘗試更新一個 UFO (頻率更低)

    return () => {
      clearInterval(interval);
    };
  }, [count, isVisible]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 2, // 比彗星和流星更低層 (最遠)
        overflow: 'hidden',
      }}
    >
      <AnimatePresence>
        {ufos.map((ufo) => (
          <motion.div
            key={ufo.id}
            className="ufo" // 使用 CSS class
            style={{
              left: ufo.startX,
              top: ufo.startY,
            }}
            initial={{
              opacity: 0,
              scale: ufo.scale,
              x: ufo.keyframesX[0], // 初始相對位置
              y: ufo.keyframesY[0],
            }}
            animate={
              isVisible
                ? {
                    x: ufo.keyframesX,
                    y: ufo.keyframesY,
                    opacity: [0, 0.85, 0.85, 0.85, 0],
                    scale: ufo.scale,
                  }
                : {}
            }
            transition={{
              delay: ufo.delay,
              duration: isVisible ? ufo.duration : 0,
              times: UFO_TIMES,
              ease: ['easeInOut', 'easeInOut', 'easeInOut', 'easeIn'],
            }}
            exit={{ opacity: 0, scale: 0, transition: { duration: 0.5, delay: 0 } }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

export default RandomUFOs;
