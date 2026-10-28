// 摺疊機摺起來時，另一半的目錄（首頁的分區、作品清單⋯）：畫面那一半是插圖，這一半是目錄，像攤開的書。
// 這裡只管放在哪一半、什麼時候出現：摺起來時淡入，攤開時留在原地淡出（位置照上一次摺起來的姿勢）。
// 每一列長什麼樣子、亮哪一列，由頁面自己決定。
import { useState, type ReactNode } from 'react';
import { useFoldPose, type FoldPose } from '@/hooks/useFoldPose';
import './FoldIndex.css';

export default function FoldIndex({ className, children }: { className: string; children: ReactNode }) {
  const pose = useFoldPose();
  const [lastPose, setLastPose] = useState<FoldPose | null>(null);
  if (pose && pose !== lastPose) setLastPose(pose);
  if (!lastPose) return null;
  return (
    <ol className={`fold-index ${className}${pose ? '' : ' is-out'}`} data-pose={lastPose} aria-hidden={!pose}>
      {children}
    </ol>
  );
}
