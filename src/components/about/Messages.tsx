// 留言：收到的每一則是一道訊號。頁首那條線是收訊的頻道，右端是天線（about/messagesWave）；
// 平常只有雜訊，打字時你打的字即時變成波形，送出時那一段往右飛進天線、天線亮一下。
// 底下照無線電的瀑布圖排（blog/SignalLog）：頻道是「現在」，收到的訊號從它底下往下流，最新的在最上面。
// 發送台（blog/CommentForm）黏在視窗底部：只有一行字和送出鈕，點進去才往上展開身分、驗證碼與規則。
// 資料是後端的 /api/pages/messages/comments（comments.page，見 migration 0026）：規則跟文章留言一樣，
// 匿名的要審核，登入的直接公開。不能拿文章留言的路徑硬塞一個假的文章 id——comments.post_id 有外鍵，
// 翻新上線時就是那樣，每一則都寫不進去。
// 換頁進來時琥珀點落在頻道的左端，起點振一下（像超聲波探頭），一道琥珀色的光沿頻道跑進天線（線跟著它長出來）；
// 離開時倒過來：那道光從天線倒著跑回起點（線跟著收掉），起點振一下，點從那裡往左飛走。
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import CommentForm, { type ReplyTarget } from '@/components/blog/CommentForm';
import SignalLog from '@/components/blog/SignalLog';
import { commentsQueryOptions } from '@/data/commentsData';
import { useSiteConfig } from '@/data/siteConfig';
import { useCommentLikes } from '@/hooks/useCommentLikes';
import { usePageTransition } from '@/hooks/usePageTransition';
import { after, isArriving } from '@/store/pageTransition';
import { channelOf, createStrip, DISH_SRC, SEND_S } from './messagesWave';
import './Messages.css';
import { sameTitle } from '@/lib/pageTitle';
import { isOriginSite, SOFTWARE_REPO } from '@/lib/siteIdentity';

const BASE = 'pages';
const POST_ID = 'messages';
/** 進場：點落地、起點振一下，那道光沿頻道跑進天線要幾秒 */
const ARRIVE_S = 1.1;
/** 起點振鈴衰減完要幾秒 */
const PING_S = 0.7;
/** 離場：那道光從天線倒著跑回起點要幾毫秒；跑到之後起點再振一下，點才飛走 */
const PULSE_BACK_MS = 500;
// 合起來要在 0.8 秒內：轉場最多等頁面收 0.8 秒（layout/TransitionLayer）
const EXIT_MS = PULSE_BACK_MS + 280;
/** 跑回左端之後點往左飛走的速度（px/ms） */
const LEAVE_SPEED = 0.8;
/** 雜訊每秒換幾次就夠了 */
const FRAME_MS = 33;

const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
const easeIn = (t: number) => t * t;
/** 離場的那道光前緣在哪（0–1，1 是天線那端）：一開始慢、越跑越快 */
const exitHead = (since: number) => 1 - easeIn(Math.min(1, (performance.now() - since) / PULSE_BACK_MS));

export default function Messages() {
  const { t } = useTranslation();
  const { email, github } = useSiteConfig();
  const isOrigin = isOriginSite(github);
  const { data: comments = [], isPending } = useQuery(commentsQueryOptions(BASE, POST_ID));
  const { liked, like } = useCommentLikes(BASE, POST_ID);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);

  const pageRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const typingRef = useRef('');
  const sendingRef = useRef<{ text: string; start: number } | null>(null);
  const leaveRef = useRef<number | null>(null);
  const countRef = useRef(0);
  countRef.current = comments.length;
  const labelsRef = useRef({ rx: '', ready: '', sending: '', count: '' });
  labelsRef.current = {
    rx: t('messages.rx'),
    ready: t('messages.txReady'),
    sending: t('messages.txSending'),
    count: t('messages.rxCount', { count: comments.length }),
  };

  const strip = () => {
    const el = stripRef.current;
    return el ? { r: el.getBoundingClientRect(), w: el.clientWidth, h: el.clientHeight } : null;
  };

  usePageTransition({
    // 錨點是頻道的左端：點落在這裡，起點振一下，變成一道光沿頻道跑進天線
    anchor: () => {
      const s = strip();
      return s ? { x: s.r.left, y: s.r.top + s.h / 2 } : null;
    },
    arrive: () => ({ tangent: { x: 1, y: 0 } }),
    // 離場是倒過來：天線送出那道光，倒著沿頻道跑回起點，起點振一下，點從那裡往左飛走
    leave: () => {
      const s = strip();
      if (!s) return null;
      const since = performance.now();
      leaveRef.current = since;
      pageRef.current?.classList.add('is-leaving');
      const head = () => {
        const now = strip() ?? s;
        const c = channelOf(now.w, now.h);
        return { x: now.r.left + c.end * exitHead(since), y: now.r.top + c.y };
      };
      return {
        point: head(),
        velocity: { x: -LEAVE_SPEED, y: 0 },
        follow: head,
        done: after(EXIT_MS),
      };
    },
  });

  // 頻道
  useEffect(() => {
    const box = stripRef.current;
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!box || !cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dish = new Image();
    dish.src = DISH_SRC;
    const draw = createStrip();
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(box);
    let raf = 0;
    let last = 0;
    let start = -1;
    let status = '';
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (isArriving() || !visible) return;
      if (start < 0) start = now;
      const real = (now - start) / 1000;
      // 換頁那段電波跑得快，跑的時候每幀都畫；平常只有雜訊，30fps 就夠
      const arriving = !reduce && real < ARRIVE_S;
      const ringing = !reduce && real < PING_S;
      const leaving = leaveRef.current !== null;
      if (!arriving && !ringing && !leaving && now - last < FRAME_MS) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const w = box.clientWidth;
      const h = box.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const snd = sendingRef.current;
      const s = snd ? (now - snd.start) / 1000 : 0;
      if (snd && s > SEND_S) sendingRef.current = null;
      const sending = sendingRef.current ? { text: sendingRef.current.text, s } : null;
      // 換頁：進場起點振一下、那道光跑向天線（先快後慢，像被天線接住）；
      // 離場那道光從天線倒著跑回起點，到了起點再振一下
      let head = 1;
      let pulse: { head: number; dir: 1 | -1 } | null = null;
      let ping: number | null = null;
      if (leaving && leaveRef.current !== null) {
        head = exitHead(leaveRef.current);
        pulse = head > 0 ? { head, dir: -1 } : null;
        const ringT = (now - leaveRef.current - PULSE_BACK_MS) / (EXIT_MS - PULSE_BACK_MS);
        ping = ringT >= 0 ? Math.min(1, ringT) : null;
      } else if (arriving || ringing) {
        head = easeOutQuad(Math.min(1, real / ARRIVE_S));
        pulse = arriving ? { head, dir: 1 } : null;
        ping = real / PING_S;
      }
      draw.draw(ctx, {
        w,
        h,
        t: reduce ? 0 : real,
        dt,
        typing: typingRef.current,
        sending: reduce ? null : sending,
        reveal: head,
        pulse,
        ping,
        dishAlpha: leaveRef.current !== null ? 1 - 0.6 * (1 - head) : Math.min(1, 0.3 + head),
        dish,
      });
      const l = labelsRef.current;
      const next = sending ? l.sending : typingRef.current ? l.ready : countRef.current ? l.count : l.rx;
      if (next !== status && statusRef.current) {
        status = next;
        statusRef.current.textContent = next;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  return (
    <div className="msg" ref={pageRef}>
      <header className="msg-head">
        <div className="msg-title">
          <h1>{t('messages.title')}</h1>
          {!sameTitle(t('messages.title'), 'Messages') && <span className="msg-latin">Messages</span>}
        </div>
        <p>{t('messages.subtitle')}</p>
      </header>

      <div className="msg-strip" ref={stripRef}>
        <canvas ref={canvasRef} aria-hidden="true" />
        <span className="msg-status" ref={statusRef} aria-hidden="true" />
      </div>

      <section className="msg-fall" aria-labelledby="msg-log-title">
        <h2 id="msg-log-title" className="sr-only">
          {t('messages.logTitle')}
        </h2>
        {isPending ? null : comments.length ? (
          <SignalLog
            comments={comments}
            liked={liked}
            onLike={(id) => void like(id)}
            onReply={(c) => {
              setReplyTo({ id: c.id, author: c.author });
              textRef.current?.focus();
            }}
          />
        ) : (
          <div className="msg-empty">
            <b>{t('messages.emptyTitle')}</b>
            <p>{t('messages.emptyText')}</p>
          </div>
        )}
      </section>

      <CommentForm
        className="msg-tx"
        base={BASE}
        postId={POST_ID}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        textRef={textRef}
        onTyping={(v) => {
          typingRef.current = v;
        }}
        onSend={(v) => {
          sendingRef.current = v === null ? null : { text: v, start: performance.now() };
        }}
        // 整句是「私下的話寄信到…；bug 回報開 Issues」，沒填信箱的站整句都不出（Issues 那半句單獨不成句）。
        // Issues 是這套程式的 repo：只有原站導過去，別人架的站讀者回報的是那個站的事，不該送到這裡
        extraNote={
          email ? (
            <>
              {t('messages.privatePre')} <a href={`mailto:${email}`}>{email}</a>
              {isOrigin ? (
                <>
                  {t('messages.privateMid')}
                  <a href={`${SOFTWARE_REPO}/issues`} target="_blank" rel="noopener noreferrer">
                    GitHub Issues
                  </a>
                  {t('messages.privatePost')}
                </>
              ) : (
                t('messages.privateEnd')
              )}
            </>
          ) : undefined
        }
      />
    </div>
  );
}
