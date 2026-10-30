import { describe, expect, it } from 'vite-plus/test';
import { cardAt, cardShow, orbitFrame, tagAt, tagShow } from './orbitLabels';
import { saturnFrame } from './saturnSpec';

const WIDE = orbitFrame(1440, 860, null);
const NARROW = orbitFrame(390, 844, null);
const CARD = { w: 200, h: 80 };

describe('orbitFrame', () => {
  it('寬畫面不算窄；比 640 窄的算窄', () => {
    expect(WIDE.narrow).toBe(false);
    expect(NARROW.narrow).toBe(true);
    expect(WIDE.folded).toBe(false);
  });

  it('攤平時字往外長的中心是畫面中心', () => {
    expect([WIDE.cx, WIDE.cy]).toEqual([720, 430]);
  });
});

describe('cardAt', () => {
  it('衛星在土星右邊：字從點的右側開始，每一行靠左', () => {
    const at = cardAt({ x: 1100, y: 430 }, CARD, WIDE);
    expect(at.x).toBeGreaterThan(1100);
    expect(at.fx).toBeCloseTo(0);
  });

  it('衛星在土星左邊：字結束在點的左側，每一行靠右', () => {
    const at = cardAt({ x: 340, y: 430 }, CARD, WIDE);
    expect(at.x + CARD.w).toBeLessThan(340);
    expect(at.fx).toBeCloseTo(1);
  });

  it('衛星在正下方：字置中在點下面', () => {
    const at = cardAt({ x: 720, y: 600 }, CARD, WIDE);
    expect(at.x + CARD.w / 2).toBeCloseTo(720);
    expect(at.y).toBeGreaterThan(600);
  });

  it('貼不出畫面：左右留 16、上面留 72（導覽列）、下面留 16', () => {
    expect(cardAt({ x: 1430, y: 430 }, CARD, WIDE).x).toBe(1440 - CARD.w - 16);
    expect(cardAt({ x: 720, y: 5 }, CARD, WIDE).y).toBe(72);
    expect(cardAt({ x: 720, y: 855 }, CARD, WIDE).y).toBe(860 - CARD.h - 16);
  });

  it('窄畫面：不管衛星在哪，字卡都放在土星下方、置中', () => {
    const a = cardAt({ x: 40, y: 300 }, CARD, NARROW);
    const b = cardAt({ x: 350, y: 500 }, CARD, NARROW);
    expect(a).toEqual(b);
    expect(a.x + CARD.w / 2).toBeCloseTo(195);
    expect(a.y).toBeCloseTo(saturnFrame(390, 844, null).y + Math.min(844 * 0.24, 220));
    expect(a.fx).toBe(0.5);
  });
});

describe('tagAt', () => {
  it('也往遠離土星的方向長，貼不出畫面（上面留 64）', () => {
    const size = { w: 60, h: 16 };
    expect(tagAt({ x: 1100, y: 430 }, size, WIDE).x).toBeGreaterThan(1100);
    expect(tagAt({ x: 340, y: 430 }, size, WIDE).x + size.w).toBeLessThan(340);
    expect(tagAt({ x: 720, y: 10 }, size, WIDE).y).toBe(64);
  });
});

describe('什麼時候出來', () => {
  it('字卡：照亮度；衛星在星球後面、換頁正在收、摺起來時不出來', () => {
    expect(cardShow(0.5, false, false, WIDE)).toBe(0.5);
    expect(cardShow(1, true, false, WIDE)).toBe(0);
    expect(cardShow(1, false, true, WIDE)).toBe(0);
    expect(cardShow(1, false, false, { ...WIDE, folded: true })).toBe(0);
  });

  it('標註：字卡一浮出來就整個讓位；窄畫面字卡不貼著衛星，不讓', () => {
    expect(tagShow(0, false, false, WIDE)).toBe(1);
    expect(tagShow(0.02, false, false, WIDE)).toBe(0);
    expect(tagShow(1, false, false, NARROW)).toBe(1);
    expect(tagShow(0, true, false, NARROW)).toBe(0);
    expect(tagShow(0, false, true, WIDE)).toBe(0);
  });
});
