import { describe, expect, it } from 'vite-plus/test';
import { saturnFrame } from './saturnSpec';
import { creaseAt, foldOf, offCrease } from './viewportFold';
import { orbitGeometry } from './articleOrbit';

// iPhone Duo 內螢幕：橫拿摺成書本（直摺痕在 475），直拿摺成筆電（橫摺痕在 390–426）
const BOOK = [
  { x: 0, y: 0, width: 475, height: 585 },
  { x: 476, y: 0, width: 475, height: 585 },
];
const LAPTOP = [
  { x: 0, y: 0, width: 669, height: 390 },
  { x: 0, y: 426, width: 669, height: 441 },
];

describe('foldOf', () => {
  it('攤平（沒有 API、只有一段）不算摺起來', () => {
    expect(foldOf(undefined)).toBeNull();
    expect(foldOf(null)).toBeNull();
    expect(foldOf([BOOK[0]])).toBeNull();
  });

  it('左右兩段是書本式，first 一律是左半（回報的順序不保證）', () => {
    const f = foldOf([BOOK[1], BOOK[0]]);
    expect(f?.pose).toBe('book');
    expect(f?.first.x).toBe(0);
    expect(f?.second.x).toBe(476);
  });

  it('上下兩段是筆電式，first 一律是上半', () => {
    const f = foldOf([LAPTOP[1], LAPTOP[0]]);
    expect(f?.pose).toBe('laptop');
    expect(f?.first.y).toBe(0);
    expect(f?.second.y).toBe(426);
  });
});

describe('offCrease', () => {
  it('摺痕上的點挪到它那一半的中間，離摺痕夠遠的不動', () => {
    const book = foldOf(BOOK);
    expect(book && creaseAt(book)).toBe(475.5);
    expect(offCrease({ x: 470, y: 200 }, book)).toEqual({ x: 237.5, y: 200 });
    expect(offCrease({ x: 490, y: 200 }, book)).toEqual({ x: 713.5, y: 200 });
    expect(offCrease({ x: 300, y: 200 }, book)).toEqual({ x: 300, y: 200 });
    const laptop = foldOf(LAPTOP);
    expect(offCrease({ x: 300, y: 400 }, laptop)).toEqual({ x: 300, y: 195 });
    expect(offCrease({ x: 300, y: 400 }, null)).toEqual({ x: 300, y: 400 });
  });
});

describe('摺起來時的版面', () => {
  it('首頁土星：書本式在左半中間，筆電式在上半中間；攤平照原本', () => {
    expect(saturnFrame(951, 585, foldOf(BOOK))).toMatchObject({ x: 237.5, y: 292.5, width: 475 });
    expect(saturnFrame(669, 867, foldOf(LAPTOP))).toMatchObject({ x: 334.5, y: 195, height: 390 });
    expect(saturnFrame(1440, 900, null)).toMatchObject({ x: 720, y: 450 });
  });

  it('文章軌道：書本式在右半、有章節名；筆電式只在上半、清單一直開著', () => {
    const book = orbitGeometry(951, 585, foldOf(BOOK));
    expect(book.narrow).toBe(false);
    expect(book.railX).toBeGreaterThan(476 + 50);
    const laptop = orbitGeometry(669, 867, foldOf(LAPTOP));
    expect(laptop.narrow).toBe(true);
    expect(laptop.docked).toBe(true);
    expect(laptop.topY + laptop.H).toBeLessThanOrEqual(390);
    expect(orbitGeometry(951, 585, null).docked).toBe(false);
  });
});
