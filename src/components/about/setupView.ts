// 設備頁：站長填的內容（後端 page_content 的 setup）＋圖紙（setupSheetRegistry）→ 畫布要的資料。
// 畫布（setupBay）只認得這裡的形狀：底稿網址、比例、要畫的部件（落點、編號圈、分區圖上是第幾號）、連線。
import type { SetupBay, SetupContent } from '@koimsurai/api-types';
import { sheetById } from './setupSheetRegistry';
import type { Pt, SheetLink } from './setupSheets';

interface BayPart {
  at: Pt;
  b: Pt;
  /** 部件分區圖上的編號（第幾個部件 +1）；隱藏了前面的部件，畫面上的編號跟它就不一樣了。0＝沒有分區圖 */
  label: number;
}

export interface BayPayload {
  /** 畫布快取圖片用的鍵（就是底稿網址） */
  art: string;
  artUrl: string;
  mapUrl: string | null;
  ratio: number;
  parts: BayPart[];
  links?: SheetLink[];
  rings?: Pt;
  refs?: { at: Pt; sheet: number }[];
}

/** 一艙：畫布用的 payload，與零件表要列的部件（跟 payload.parts 同順序，隱藏的已經拿掉） */
export interface BayView {
  payload: BayPayload;
  parts: { name: string; spec: string }[];
  bay: SetupBay;
}

/** 這一艙畫得出來嗎：沒開、選的圖紙不存在、上傳的圖沒有網址，都是 null（畫面上那一格照畫，只是點不開） */
export function bayView(bay: SetupBay | undefined): BayView | null {
  if (!bay?.on) return null;
  const parts = bay.parts ?? [];
  if (bay.sheet) {
    const sheet = sheetById(bay.sheet);
    if (!sheet) return null;
    // 圖紙的部件順序就是分區圖的編號；站長填的用 key 對回來，沒填到的部件也照圖紙畫（名字用 key）
    const visible = sheet.parts.flatMap((sp, k) => {
      const filled = parts.find((p) => p.key === sp.key);
      if (filled?.hidden) return [];
      return [{ sp, k, name: filled?.name ?? sp.key, spec: filled?.spec ?? '' }];
    });
    return {
      bay,
      payload: {
        art: sheet.artUrl,
        artUrl: sheet.artUrl,
        mapUrl: sheet.mapUrl,
        ratio: sheet.ratio,
        parts: visible.map(({ sp, k }) => ({ at: sp.at, b: sp.b, label: sheet.mapUrl ? k + 1 : 0 })),
        links: sheet.links,
        rings: sheet.rings,
        refs: sheet.refs,
      },
      parts: visible.map(({ name, spec }) => ({ name, spec })),
    };
  }
  const image = bay.image;
  if (!image?.url) return null;
  // 上傳的圖：沒有分區圖，滑過部件只亮引線與編號
  const placed = parts.filter((p) => !p.hidden && p.at && p.b);
  return {
    bay,
    payload: {
      art: image.url,
      artUrl: image.url,
      mapUrl: null,
      ratio: image.ratio,
      parts: placed.map((p) => ({ at: p.at as Pt, b: p.b as Pt, label: 0 })),
    },
    parts: placed.map((p) => ({ name: p.name ?? '', spec: p.spec ?? '' })),
  };
}

/** 四格（不足的補空） */
export function bayViews(content: SetupContent | undefined): (BayView | null)[] {
  const bays = content?.bays ?? [];
  return [0, 1, 2, 3].map((i) => bayView(bays[i]));
}
