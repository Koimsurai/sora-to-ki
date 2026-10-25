// 編輯器裡填的排程時間，給頂列的主要按鈕看（2026-10 後台提案）。
//
// 頂列在 AdminLayout、表單在 PostEditor，兩者不是父子：頂列的三顆按鈕本來就是去點
// PostEditor 裡藏起來的按鈕（送出要經過 react-hook-form 的 handleSubmit）。
// 按鈕上的字要跟著「有沒有排程」換成「排程發佈」，所以需要一個兩邊都看得到的值。
// 寫法同 commandPaletteStore：一個值不值得加 jotai 的 Provider 與相依。
//
// 值是排程時間（本地時間的 datetime-local 字串）；空字串 = 沒排程，按下去就是立刻發佈。

import { useSyncExternalStore } from 'react';

let scheduledAt = '';
const listeners = new Set<() => void>();

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

const getSnapshot = () => scheduledAt;
const getServerSnapshot = () => '';

export function setEditorScheduledAt(value: string): void {
  if (value === scheduledAt) return;
  scheduledAt = value;
  for (const l of listeners) l();
}

export function useEditorScheduledAt(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
