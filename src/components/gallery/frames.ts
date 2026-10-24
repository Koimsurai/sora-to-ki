// 照片頁（gallery/Photos）的資料整理：每張照片是一格收到的畫面（FRAME），附上遙測——
// 拍攝日期、焦距光圈快門 ISO、哪顆鏡頭。另外算總覽：一共收到幾格、從哪個月到哪個月、各鏡頭幾張、
// 每個月收到幾張。這裡只有資料，不碰 React。
import { parseExifWallClock } from '@/lib/exifDate';
import type { PhotoManifest } from '@/types/photo';

type ExifValue = string | number | null | undefined;

/** EXIF 數值有兩種形狀：舊的 exiftool 字串（"1/640"、"f/1.4"、"32 mm"）與 Rust sync 寫的數字 */
const focal = (v: ExifValue) => (v == null ? '' : typeof v === 'string' ? v.replace(/\s+/g, '') : `${v}mm`);
const aperture = (v: ExifValue) => (v == null ? '' : typeof v === 'string' ? v : `f/${v}`);
const exposure = (v: ExifValue) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return v >= 1 ? `${v}s` : `1/${Math.round(1 / v)}`;
};

/**
 * 鏡頭的短名：EF-M 變焦鏡只留焦段（光圈範圍太長），定焦留光圈；去掉 IS、STM。
 * 手機（Pixel）不分鏡頭，只留機型
 */
function lensLabel(lens: string | null | undefined): string | null {
  if (!lens) return null;
  const phone = /^(Pixel \d+(?: Pro)?)/.exec(lens);
  if (phone) return phone[1];
  const short = lens.replace(/\s+(IS\s+)?STM$/, '').replace(/\s+IS$/, '');
  return /\d+-\d+mm/.test(short) ? short.replace(/\s+f\/[\d.-]+$/, '') : short;
}

export interface Frame {
  photo: PhotoManifest;
  /** 畫面編號：檔名裡的那串數字（IMG_1602 → 1602） */
  no: string;
  /** 2023.04.27；沒有拍攝時間的是空字串 */
  date: string;
  /** 年月（2023-04），算接收紀錄用 */
  month: string | null;
  /** 32mm · f/1.4 · 1/640 · ISO 100 */
  exposure: string;
  lens: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

function frameOf(photo: PhotoManifest): Frame {
  const exif = photo.exif;
  const clock = parseExifWallClock(exif?.DateTimeOriginal);
  const no = /(\d{3,5})(?!.*\d)/.exec(photo.id)?.[1] ?? photo.id.slice(-4);
  return {
    photo,
    no,
    date: clock ? `${clock.year}.${pad(clock.month)}.${pad(clock.day)}` : '',
    month: clock ? `${clock.year}-${pad(clock.month)}` : null,
    exposure: [
      focal(exif?.FocalLength),
      aperture(exif?.FNumber),
      exposure(exif?.ExposureTime),
      exif?.ISO == null ? '' : `ISO ${exif.ISO}`,
    ]
      .filter(Boolean)
      .join(' · '),
    lens: lensLabel(exif?.LensModel),
  };
}

/** 由新到舊：最新收到的排最前面（沒有拍攝時間的排最後） */
export function framesOf(photos: PhotoManifest[]): Frame[] {
  return photos
    .map(frameOf)
    .sort((a, b) => (b.photo.shootTime ?? 0) - (a.photo.shootTime ?? 0) || b.date.localeCompare(a.date));
}

/** 總覽：一共幾格、第一格與最後一格的年月、各鏡頭幾張（多的在前；手機各機型併成一行）、每個月幾張 */
export function overview(frames: Frame[]) {
  const months = frames.map((f) => f.month).filter((m): m is string => m !== null);
  const sorted = [...months].sort();
  const lenses = new Map<string, number>();
  const phones = new Map<string, number>();
  for (const f of frames) {
    if (!f.lens) continue;
    const bucket = f.lens.startsWith('Pixel') ? phones : lenses;
    bucket.set(f.lens, (bucket.get(f.lens) ?? 0) + 1);
  }
  const rows = [...lenses].sort((a, b) => b[1] - a[1]);
  if (phones.size > 0) {
    // Pixel 7 Pro、Pixel 8 Pro → 「Pixel 7 Pro · 8 Pro」
    const names = [...phones.keys()].sort().map((n, i) => (i === 0 ? n : n.replace(/^Pixel /, '')));
    rows.push([names.join(' · '), [...phones.values()].reduce((a, b) => a + b, 0)]);
  }
  const perMonth = new Map<string, number>();
  for (const m of months) perMonth.set(m, (perMonth.get(m) ?? 0) + 1);
  return {
    total: frames.length,
    from: sorted.at(0)?.replace('-', '.') ?? null,
    to: sorted.at(-1)?.replace('-', '.') ?? null,
    lenses: rows,
    passes: [...perMonth].sort((a, b) => a[0].localeCompare(b[0])),
  };
}
