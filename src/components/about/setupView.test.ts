// 設備頁：站長填的內容＋圖紙 → 畫布要的資料。錯了的症狀是「滑過第 3 個，亮的是第 4 個部件」，
// 或別人的站點開沒開的那一格，畫面上沒有任何錯誤訊息
import { describe, expect, it } from 'vite-plus/test';
import type { SetupBay } from '@koimsurai/api-types';

import { BUILTIN_SHEETS } from './setupSheets';
import { bayView, bayViews } from './setupView';

const white = BUILTIN_SHEETS.find((s) => s.id === 'white-build');
const bay = (over: Partial<SetupBay> = {}): SetupBay => ({ on: true, sheet: 'white-build', ...over });

describe('bayView', () => {
  it('沒開、圖紙不存在、上傳的圖沒有網址：都是點不開的那一格', () => {
    expect(bayView(undefined)).toBeNull();
    expect(bayView(bay({ on: false }))).toBeNull();
    expect(bayView(bay({ sheet: 'nope' }))).toBeNull();
    expect(bayView(bay({ sheet: '', image: null }))).toBeNull();
  });

  it('沒填的部件照圖紙畫，名字先用 key', () => {
    const v = bayView(bay());
    expect(v?.payload.parts).toHaveLength(white?.parts.length ?? -1);
    expect(v?.parts[0]?.name).toBe(white?.parts[0]?.key);
  });

  it('隱藏了前面的部件，畫面上的編號往前補，但分區圖的編號還是原本那個', () => {
    const first = white?.parts[0]?.key ?? '';
    const v = bayView(
      bay({
        parts: [
          { key: first, hidden: true },
          { key: white?.parts[1]?.key, name: '處理器', spec: 'X' },
        ],
      }),
    );
    expect(v?.parts[0]).toEqual({ name: '處理器', spec: 'X' });
    expect(v?.payload.parts[0]?.label).toBe(2);
  });

  it('上傳的圖：沒有分區圖，只畫放好位置的部件', () => {
    const v = bayView(
      bay({
        sheet: '',
        image: { url: '/uploads/a.webp', ratio: 0.5 },
        parts: [
          { key: 'a', name: '螢幕', at: [10, 20], b: [5, 5] },
          { key: 'b', name: '還沒放位置' },
        ],
      }),
    );
    expect(v?.payload.mapUrl).toBeNull();
    expect(v?.payload.parts).toEqual([{ at: [10, 20], b: [5, 5], label: 0 }]);
    expect(v?.parts).toEqual([{ name: '螢幕', spec: '' }]);
  });

  it('一定是四格', () => {
    expect(bayViews(undefined)).toEqual([null, null, null, null]);
    expect(bayViews({ bays: [bay()] }).filter(Boolean)).toHaveLength(1);
  });
});
