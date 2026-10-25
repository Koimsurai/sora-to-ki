// 文章頁右邊那道軌道：這篇文章的星軌，同時是目錄（幾何在 lib/articleOrbit）。
//
// 手記列表是一圈一圈的星軌，點進一篇等於鏡頭拉近到其中一道，所以這道軌道從頁首就在、不變形：
//   - 章節是刻度：大節橫跨軌道、小節只刻在內側；間距照章節在頁面上實際的長度
//   - 走過的是細實線，前面是點線；琥珀點是讀者，位置一律用角度表示，跳到別節時也貼著軌道滑
//   - 捲動的時候只留所在的那一節，停下來才回來
// 換頁也由這裡負責（這一頁的「錨點」就是軌道頂端）：
//   - 從手記點進來：那一篇的星軌已經被拉成這道軌道，直接畫滿；從別處來：從頂端往下長
//   - 回手記：軌道被拉回那一篇的星軌；去別處：軌道縮回琥珀點
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PostListItem } from '@koimsurai/api-types';
import { postsListQueryOptions } from '@/data/blogList';
import { useLocale } from '@/hooks/useLocale';
import { usePageTransition } from '@/hooks/usePageTransition';
import {
  orbitAngle,
  orbitGeometry,
  orbitPoint,
  setOrbitHandoff,
  takeOrbitHandoff,
  type OrbitGeom,
} from '@/lib/articleOrbit';
import { after, isArriving, type Pt } from '@/store/pageTransition';
import { peekRetune } from './useRetune';
import { applyZoom, arcPoint, keepTimeOf, orbitSpan, postArc, skyPostOf, zoomMap, zoomOf, type Arc } from './noteSky';
import './OrbitToc.css';

export interface TocHeading {
  id: string;
  text: string;
  level: number;
}

const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
const TAU = Math.PI * 2;
/** 從頂端往下長出來的時間（秒） */
const GROW_S = 1.4;
/** 拉回手記那道星軌的時間 */
const MORPH_MS = 650;
/** 縮回琥珀點的時間 */
const RETRACT_MS = 380;
/** 筆尖畫完軌道之後滑回讀者那裡的時間（秒） */
const PEN_BACK_S = 0.7;
/** 內文比筆尖多露出一點（px）：字的上半截先出來，不會被切在半行 */
const PEN_LEAD_PX = 40;
/** 這一頁的內文那一欄 */
const colOf = (root: Element) => root.closest('.ar-page')?.querySelector<HTMLElement>('.ar-col') ?? null;

/** 被摘要點名的那一章，漣漪擴一圈的時間 */
const PING_MS = 1100;
/** 一分鐘讀幾個字（跟手記列表一樣） */
const CHARS_PER_MIN = 700;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/** 旁邊的軌道：其他文章。都在外側（靠內文那邊的空白裡），一段一段、長短不一 */
const OTHERS = (() => {
  let s = 0.41;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  return [13, 25, 36, 50].flatMap((d) =>
    Array.from({ length: 2 }, () => ({ d, u0: -0.3 + rnd() * 0.9, len: 0.25 + rnd() * 0.55, a: 0.5 + rnd() * 0.5 })),
  );
})();

export default function OrbitToc({
  postId,
  headings,
  contentRef,
  footer,
  pingRef,
}: {
  postId: number;
  headings: TocHeading[];
  contentRef: React.RefObject<HTMLElement | null>;
  /** 目錄底下「回到文章頂部」旁邊多放的東西（文章頁的字體那一行） */
  footer?: React.ReactNode;
  /** 這裡把「讓某一章亮起來」的函式掛上去，給摘要裡連到章節的句子用（null = 熄掉） */
  pingRef?: React.RefObject<((id: string | null) => void) | null>;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const itemsRef = useRef<(HTMLLIElement | null)[]>([]);
  const hdRef = useRef<HTMLDivElement>(null);
  const ftRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLElement>(null);
  const leftRef = useRef<HTMLSpanElement>(null);

  /** 軌道從什麼時候開始長；-1 是還沒（轉場還藏著這一頁） */
  const bornRef = useRef(-1);
  /** 這一頁是怎麼來的：從手記推近（notes）、切語系（retune），或其他 */
  const [hand] = useState(() =>
    takeOrbitHandoff('article') === postId ? 'notes' : peekRetune(postId) ? 'retune' : null,
  );
  /** 一出來就是滿的：從手記拉過來的，或切語系換過來的（同一篇，軌道不用重長） */
  const fullRef = useRef(hand !== null);
  const readerRef = useRef<Pt | null>(null);
  /** 被摘要點名的那一章：刻度上一圈一圈往外擴的漣漪 */
  const pingIdRef = useRef<{ i: number; at: number }>({ i: -1, at: 0 });
  const leaveRef = useRef<{ kind: 'morph' | 'retract'; at: number; arc: Arc | null } | null>(null);

  /** 這篇在手記列表裡的那道星軌（列表的資料在快取裡才算得出來） */
  const listArc = (): Arc | null => {
    const posts = queryClient.getQueryData<PostListItem[]>(postsListQueryOptions(locale, 'newest').queryKey);
    if (!posts?.length) return null;
    const i = posts.findIndex((p) => p.id === postId);
    if (i < 0) return null;
    const maxLen = Math.max(1, ...posts.map((p) => p.content_length));
    const sp = { ...skyPostOf(posts[i], maxLen), dim: false };
    const w = window.innerWidth;
    const h = window.innerHeight;
    // 夜空轉到那顆星看得到的時候（手記頁接手時用同一個時間）
    return postArc(i, posts.length, sp, w, h, keepTimeOf(postArc(i, posts.length, sp, w, h, 0, 1), w, h), 1);
  };

  usePageTransition({
    anchor: () => {
      const g = orbitGeometry(window.innerWidth, window.innerHeight);
      return g ? orbitPoint(g, 0) : null;
    },
    // 從手記推近過來的：點已經跟著那顆星到了軌道頂端，鏡頭不用再動
    arrive: () => (fullRef.current && orbitGeometry(window.innerWidth, window.innerHeight) ? { still: true } : null),
    leave: ({ to }) => {
      const g = orbitGeometry(window.innerWidth, window.innerHeight);
      if (!g) return null;
      rootRef.current?.classList.add('is-leaving');
      rootRef.current?.closest('.ar-page')?.classList.add('is-leaving');
      const at = performance.now();
      const arc = to === 'blog' ? listArc() : null;
      if (arc) {
        setOrbitHandoff('notes', postId);
        leaveRef.current = { kind: 'morph', at, arc };
        const head = arcPoint(arc, arc.a1);
        return {
          point: head,
          follow: () => zoomMap(zoomOf(arc, g, 1 - easeInOut(clamp((performance.now() - at) / MORPH_MS))), head),
          done: after(MORPH_MS),
          // 拉回去的那道星軌留在畫面上，等手記頁接手
          residue: (c) => {
            c.strokeStyle = `rgba(${INK}, 0.9)`;
            c.lineWidth = 1.4;
            c.beginPath();
            c.arc(arc.cx, arc.cy, arc.r, arc.a0, arc.a1);
            c.stroke();
          },
        };
      }
      leaveRef.current = { kind: 'retract', at, arc: null };
      return { point: readerRef.current ?? orbitPoint(g, 0), done: after(RETRACT_MS * 0.8) };
    },
  });

  // 摘要裡的句子滑過時：那一章的名字浮出來、刻度上起漣漪
  useEffect(() => {
    if (!pingRef) return;
    pingRef.current = (id) => {
      const i = id ? headings.findIndex((h) => h.id === id) : -1;
      pingIdRef.current = { i, at: performance.now() };
      rootRef.current?.classList.toggle('is-pinging', i >= 0);
      itemsRef.current.forEach((li, k) => li?.classList.toggle('is-ping', k === i));
    };
    return () => {
      pingRef.current = null;
    };
  }, [pingRef, headings]);

  // 從一篇點到另一篇（左欄、同標籤、同專欄）時頁面容器是沿用的：上一篇離場時掛上的 is-leaving 要拿掉，
  // 不然新的這篇整片是隱形的
  useEffect(() => {
    rootRef.current?.closest('.ar-page')?.classList.remove('is-leaving');
  }, []);

  // 不是從手記、也不是切語系換過來的：筆尖畫軌道之前內文先藏著（一開始就藏，不然點落地那一下會先閃出整篇）。
  // 畫的過程由 frame 推 --scan；量不到軌道（窄螢幕）就不藏，保險起見幾秒後一定拿掉
  useEffect(() => {
    if (hand !== null || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!orbitGeometry(window.innerWidth, window.innerHeight)) return;
    const root = rootRef.current;
    const col = root ? colOf(root) : null;
    if (!col) return;
    col.classList.add('is-drawing');
    col.style.setProperty('--scan', '0px');
    const clear = () => {
      col.classList.remove('is-drawing');
      col.style.removeProperty('--scan');
    };
    const safety = window.setTimeout(clear, 6000);
    return () => {
      window.clearTimeout(safety);
      clear();
    };
  }, [hand]);

  // 從手記推近過來：內文從軌道那一側攤開（ArticleFrame.css 的 is-unfold）
  useEffect(() => {
    if (hand !== 'notes') return;
    const page = rootRef.current?.closest('.ar-page');
    page?.classList.add('is-unfold');
    const timer = window.setTimeout(() => page?.classList.remove('is-unfold'), 4000);
    return () => window.clearTimeout(timer);
  }, [hand]);

  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    const content = contentRef.current;
    const root = rootRef.current;
    if (!cv || !ctx || !content || !root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const els = headings.map((h) => document.getElementById(h.id));
    const deep = headings.map((h) => h.level >= 3);
    let g: OrbitGeom | null = null;
    let start = 0;
    let end = 1;
    let marks: number[] = [];
    let us: number[] = [];
    const docTop = (el: Element) => el.getBoundingClientRect().top + window.scrollY;

    // 量：章節在頁面上的位置 → 軌道上的位置（照實際距離，太擠的地方往下推開）
    const measure = () => {
      // 內文分批掛上時（站內換頁進來，見 mdx/MdxContent），後面幾章一開始還不在：每次量都補找一次
      headings.forEach((h, i) => {
        els[i] ??= document.getElementById(h.id);
      });
      g = orbitGeometry(window.innerWidth, window.innerHeight);
      root.classList.toggle('is-off', !g);
      if (!g) return;
      // 畫布只在視窗大小變了才重設（重設會清空畫面）；內文長高、上面多展開一塊這類只要重量位置
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(window.innerWidth * dpr);
      const h = Math.round(window.innerHeight * dpr);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      // 位置變了：下一幀一定要重畫，不等捲動
      lastKey = '';
      start = docTop(content);
      end = start + content.offsetHeight;
      marks = els.map((el) => (el ? docTop(el) : start));
      const H = g.H;
      const gap = (i: number) => (deep[i] ? 21 : 25);
      const ys = marks.map((m) => clamp((m - start) / Math.max(1, end - start)) * H);
      for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap(i));
      if (ys.length) ys[ys.length - 1] = Math.min(ys[ys.length - 1], H);
      for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap(i + 1));
      us = ys.map((y) => y / H);
      // 每節要讀幾分鐘：到下一個標題之前的字數
      itemsRef.current.forEach((li, i) => {
        const m = li?.querySelector<HTMLElement>('.orbit-toc-min');
        if (!m) return;
        let n = 0;
        const stop = els[i + 1];
        for (let el = els[i]?.nextElementSibling; el && el !== stop; el = el.nextElementSibling)
          n += el.textContent.length;
        m.textContent = t('blog.minutes', { count: Math.max(1, Math.round(n / CHARS_PER_MIN)) });
      });
    };
    const lerp = (xs: number[], ys: number[], x: number) => {
      if (x <= xs[0]) return ys[0];
      for (let i = 1; i < xs.length; i++)
        if (x < xs[i]) return ys[i - 1] + ((x - xs[i - 1]) / (xs[i] - xs[i - 1])) * (ys[i] - ys[i - 1]);
      return ys[ys.length - 1];
    };

    const totalMin = Math.max(1, Math.round(content.textContent.length / CHARS_PER_MIN));
    let on = -2;
    let raf = 0;
    let last = 0;
    let lastKey = '';
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!g) return;
      // 轉場還藏著這一頁：等它露出來才開始長
      if (isArriving()) return;
      if (bornRef.current < 0) bornRef.current = now;
      const tt = (now - bornRef.current) / 1000;
      const grow = fullRef.current || reduce ? 1 : clamp(tt / GROW_S) ** 0.7;
      // 不是從手記（或切語系）換過來的：點是筆尖，從頂端往下畫出這道軌道、刻上章節，畫完沿軌道回到讀者的位置
      const drawing = !fullRef.current && !reduce;
      const backing = drawing && tt >= GROW_S && tt < GROW_S + PEN_BACK_S;
      const leave = leaveRef.current;
      const line = window.scrollY + window.innerHeight * 0.3;
      const ping = pingIdRef.current;
      const key = `${window.scrollY}|${grow}|${leave || ping.i >= 0 || backing || (fullRef.current && tt < 2) ? now : ''}`;
      // 沒有在長、沒有在捲、沒有在換頁：不重畫（琥珀點的光暈是靜的）
      if (key === lastKey && now - last < 500) return;
      lastKey = key;
      last = now;
      const W = window.innerWidth;
      const Hf = window.innerHeight;
      const geom = g;
      const RB = geom.RB;
      const { cx, cy, aTop } = geom;
      const ang = (u: number) => orbitAngle(geom, u);
      const at = (u: number, r = RB) => orbitPoint(geom, u, r);
      const uh = us.length ? lerp([start, ...marks, end], [0, ...us, 1], line) : clamp((line - start) / (end - start));
      const p = clamp((line - start) / Math.max(1, end - start));
      ctx.clearRect(0, 0, W, Hf);

      // 換頁：拉回手記的那道星軌，或縮回琥珀點
      if (leave) {
        const k = clamp((now - leave.at) / (leave.kind === 'morph' ? MORPH_MS : RETRACT_MS));
        if (leave.kind === 'morph' && leave.arc) {
          // 鏡頭拉遠：跟手記推近的那一下反過來（noteSky 的 zoomOf），軌道縮回那一篇的星軌
          const arc = leave.arc;
          const e = easeInOut(k);
          const z = zoomOf(arc, geom, 1 - e);
          ctx.save();
          applyZoom(ctx, z);
          ctx.strokeStyle = `rgba(${INK}, ${0.8 + 0.1 * e})`;
          ctx.lineWidth = (1 + 0.4 * e) / z.scale;
          ctx.beginPath();
          ctx.arc(arc.cx, arc.cy, arc.r, arc.a1 - (orbitSpan(geom) * (1 - e) + (arc.a1 - arc.a0) * e), arc.a1);
          ctx.stroke();
          ctx.restore();
          ctx.lineWidth = 1;
        } else {
          // 縮回琥珀點：前後兩段一起往讀者的位置收
          const e = k * k;
          const a0 = ang(uh * e);
          const a1 = ang(uh + (1 - uh) * (1 - e));
          ctx.strokeStyle = `rgba(${INK}, ${0.6 * (1 - e)})`;
          ctx.beginPath();
          ctx.arc(cx, cy, RB, a1, a0);
          ctx.stroke();
        }
        return;
      }

      // 其他文章的軌道：頁首時看得到，開始讀之後退到幾乎看不見
      const fade = 1 - clamp(window.scrollY / 500) * 0.65;
      for (const o of OTHERS) {
        const u1 = Math.min(1.25, o.u0 + o.len * grow);
        ctx.strokeStyle = `rgba(${INK}, ${0.13 * o.a * fade})`;
        ctx.beginPath();
        ctx.arc(cx, cy, RB + o.d, ang(u1), ang(o.u0));
        ctx.stroke();
      }
      // 這篇的軌道：走過的是細實線，前面是點線
      const aHead = ang(Math.min(uh, grow));
      // 從手記推近過來的：那道星軌一開始是整條實線，慢慢退成點線（不是一到就變淡）
      const handed = fullRef.current ? 1 - clamp((tt - 0.3) / 1.6) : 0;
      if (handed > 0) {
        ctx.strokeStyle = `rgba(${INK}, ${(0.78 * handed * handed * (3 - 2 * handed)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, RB, ang(1), aTop);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${INK}, 0.78)`;
      ctx.beginPath();
      ctx.arc(cx, cy, RB, aHead, aTop);
      ctx.stroke();
      // 點線要密到讀得出是一條線：從手記拉過來的那道實線換成它時，看起來是同一條線變成點線，而不是斷掉
      ctx.fillStyle = `rgba(${INK}, 0.5)`;
      const aEnd = ang(grow);
      for (let a = aHead - 3 / RB; a > aEnd; a -= 3 / RB)
        ctx.fillRect(cx + Math.cos(a) * RB - 0.6, cy + Math.sin(a) * RB - 0.6, 1.2, 1.2);
      // 兩端的收尾：起點一小橫、終點一個小圈
      {
        const q = at(0);
        ctx.strokeStyle = `rgba(${INK}, 0.6)`;
        ctx.beginPath();
        ctx.moveTo(q.x - 4, q.y);
        ctx.lineTo(q.x + 4, q.y);
        ctx.stroke();
      }
      if (grow >= 1) {
        const q = at(1);
        ctx.strokeStyle = `rgba(${INK}, ${p >= 1 ? 0.8 : 0.35})`;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 2.5, 0, TAU);
        ctx.stroke();
      }

      // 章節是刻度：大節橫跨軌道，小節只刻在內側
      let cur = -1;
      marks.forEach((m, i) => {
        if (m <= line) cur = i;
      });
      us.forEach((u, i) => {
        const li = itemsRef.current[i];
        if (u > grow) {
          if (li) li.style.opacity = '0';
          return;
        }
        if (li) li.style.opacity = '';
        const a = ang(u);
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const [o0, o1] = deep[i] ? [0, 5] : [-5, 6];
        const past = i <= cur;
        ctx.strokeStyle = `rgba(${INK}, ${i === cur ? 1 : past ? 0.7 : 0.32})`;
        ctx.lineWidth = i === cur ? 1.4 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + dx * (RB - o0), cy + dy * (RB - o0));
        ctx.lineTo(cx + dx * (RB - o1), cy + dy * (RB - o1));
        ctx.stroke();
        ctx.lineWidth = 1;
        const q = at(u);
        if (li) {
          li.style.transform = `translate(${q.x + (deep[i] ? 20 : 14)}px, ${q.y - 10}px)`;
          li.style.maxWidth = `${Math.max(60, W - q.x - 40)}px`;
        }
        if (i === ping.i) {
          const k = ((now - ping.at) / PING_MS) % 1;
          ctx.strokeStyle = `rgba(${INK}, ${0.7 * (1 - k)})`;
          ctx.beginPath();
          ctx.arc(q.x, q.y, 4 + k * 12, 0, TAU);
          ctx.stroke();
        }
      });

      // 讀者：琥珀點，後面拖一小段漸淡的尾巴。畫軌道的時候它是筆尖（在長到的地方），畫完沿軌道滑回讀者那裡
      const reader = Math.min(uh, grow);
      const headU =
        drawing && tt < GROW_S
          ? grow
          : backing
            ? 1 + (reader - 1) * easeInOut(clamp((tt - GROW_S) / PEN_BACK_S))
            : reader;
      const hd = at(headU);
      readerRef.current = hd;
      // 內文跟著筆尖往下顯現：筆尖以上是寫好的，以下先藏著（遮罩見 ArticleFrame.css 的 is-drawing）
      const col = colOf(root);
      if (col) {
        if (drawing && tt < GROW_S) {
          col.classList.add('is-drawing');
          col.style.setProperty('--scan', `${hd.y - col.getBoundingClientRect().top + PEN_LEAD_PX}px`);
        } else if (col.classList.contains('is-drawing')) {
          col.classList.remove('is-drawing');
          col.style.removeProperty('--scan');
        }
      }
      const aPen = ang(headU);
      for (let k = 0; k < 7; k++) {
        const a0 = aPen + (k * 2.4) / RB;
        const a1 = aHead + ((k + 1) * 2.4) / RB;
        if (a1 > aTop) break;
        ctx.strokeStyle = `rgba(${AMBER}, ${0.6 * (1 - k / 7)})`;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(cx, cy, RB, a0, a1);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      const glow = ctx.createRadialGradient(hd.x, hd.y, 0, hd.x, hd.y, 12);
      glow.addColorStop(0, `rgba(${AMBER}, 0.45)`);
      glow.addColorStop(1, `rgba(${AMBER}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(hd.x, hd.y, 12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgb(${AMBER})`;
      ctx.beginPath();
      ctx.arc(hd.x, hd.y, 2.4, 0, TAU);
      ctx.fill();

      const top = at(0);
      const bot = at(1);
      if (hdRef.current) hdRef.current.style.transform = `translate(${top.x - 4}px, ${top.y - 34}px)`;
      if (ftRef.current) ftRef.current.style.transform = `translate(${bot.x - 4}px, ${bot.y + 22}px)`;
      root.classList.toggle('is-rest', window.scrollY < 40);
      if (cur !== on) {
        on = cur;
        itemsRef.current.forEach((li, i) => {
          li?.classList.toggle('is-past', i < cur);
          li?.classList.toggle('is-on', i === cur);
        });
      }
      if (pctRef.current) pctRef.current.textContent = `${Math.round(p * 100)}%`;
      if (leftRef.current) {
        leftRef.current.textContent =
          p >= 1 ? t('blog.readDone') : t('blog.minutesLeft', { count: Math.max(1, Math.ceil(totalMin * (1 - p))) });
      }
    };

    // 捲動中只留所在的那一節；停下來 0.9 秒後回來
    let quiet = 0;
    const onScroll = () => {
      root.classList.add('is-quiet');
      window.clearTimeout(quiet);
      quiet = window.setTimeout(() => root.classList.remove('is-quiet'), 900);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    // 整欄也要看：內文上面展開一塊（同標籤的文章、摘要）時內文只是被往下推、自己的大小沒變
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    const col = content.closest('.ar-col');
    if (col) ro.observe(col);
    window.addEventListener('resize', measure);
    measure();
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(quiet);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [headings, contentRef, t]);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - 96,
      behavior: reduce ? 'auto' : 'smooth',
    });
  };

  return (
    <div className="orbit-toc" ref={rootRef}>
      <canvas className="orbit-toc-cv" ref={canvasRef} aria-hidden="true" />
      <div className="orbit-toc-hd" ref={hdRef}>
        <span>{t('blog.toc')}</span>
        <b ref={pctRef}>0%</b>
        <span ref={leftRef} />
      </div>
      <nav aria-label={t('blog.toc')}>
        <ol className="orbit-toc-list">
          {headings.map((h, i) => (
            <li
              key={h.id}
              className={h.level >= 3 ? 'is-deep' : undefined}
              ref={(el) => {
                itemsRef.current[i] = el;
              }}
            >
              <button type="button" data-heading-id={h.id} onClick={() => go(h.id)} title={h.text}>
                <span className="orbit-toc-t">{h.text}</span>
                <span className="orbit-toc-min" />
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="orbit-toc-ft" ref={ftRef}>
        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          ↑ {t('blog.backToArticleTop')}
        </button>
        {footer}
      </div>
    </div>
  );
}
