// 留言：收到的每一則是一道訊號。頁首那條線是收訊的頻道，右端是天線（about/messagesWave）；
// 平常只有雜訊，打字時你打的字即時變成波形，送出時那一段往右飛進天線、天線亮一下。
// 底下照無線電的瀑布圖排：頻道是「現在」，收到的訊號從它底下往下流，最新的在最上面；
// 左邊是時間軸（UTC），中間是頻寬，每個人落在自己的頻率上（名字決定），右邊是內容。
// 發送台是黏在視窗底部的一條：只有一行字和送出鈕，點進去才往上展開身分、驗證碼與規則。
// 資料沿用文章留言那一套（post_id = meta-messages，匿名的要審核，登入的直接公開）。
// 換頁進來時琥珀點落在頻道的左端，起點振一下（像超聲波探頭），一道琥珀色的光沿頻道跑進天線（線跟著它長出來）；
// 離開時倒過來：那道光從天線倒著跑回起點（線跟著收掉），起點振一下，點從那裡往左飛走。
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FaGithub, FaGoogle } from 'react-icons/fa';
import type { CommentRow } from '@koimsurai/api-types';
import { useAuth } from '@/contexts/auth';
import { commentsQueryOptions } from '@/data/commentsData';
import { usePageTransition } from '@/hooks/usePageTransition';
import { jsonAuthHeaders } from '@/lib/authToken';
import { groupComments, validateCommentDraft, type CommentDraftError } from '@/lib/comments';
import { after, isArriving } from '@/store/pageTransition';
import { bandPath, channelOf, createStrip, DISH_SRC, freqOf, SEND_S } from './messagesWave';
import './Messages.css';

const BASE = 'posts';
const POST_ID = 'meta-messages';
const CONTACT = 'timo9378@gmail.com';
/** 一則最多幾個字 */
const MAX_CHARS = 500;
/** 一個字是幾秒的訊號（只是顯示用的換算） */
const SEC_PER_CHAR = 0.12;
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
/** 瀑布圖一列的頻寬與高（SVG viewBox；畫面上橫向拉滿那一欄） */
const BAND_W = 600;
const BAND_H = 36;
/** 頻寬的刻度：深空網路收 X 頻段的那一段 */
const BAND_TICKS = [8400, 8410, 8420, 8430, 8440, 8450];
/** 發送台上緣那條線的高 */
const TX_WAVE_H = 14;
/** 送出時那條線飛走要多久（毫秒，跟 Messages.css 的 msg-fly 一樣） */
const FLY_MS = 1200;
/** 打字時輸入框最高長到多高（px），再多就捲動 */
const TEXT_MAX_H = 160;

const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
const easeIn = (t: number) => t * t;
/** 離場的那道光前緣在哪（0–1，1 是天線那端）：一開始慢、越跑越快 */
const exitHead = (since: number) => 1 - easeIn(Math.min(1, (performance.now() - since) / PULSE_BACK_MS));

/** 時間軸上的日期與時刻：資料庫存的是 UTC，原樣顯示（不換時區，伺服器與瀏覽器也就一致） */
function stampOf(s: string) {
  const m = /\d{4}-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s);
  return m ? { date: `${m[1]}.${m[2]}`, time: `${m[3]}:${m[4]}` } : { date: '', time: '' };
}

/** 輸入框跟著字長高 */
function grow(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, TEXT_MAX_H)}px`;
}

type Sent = 'pending' | 'approved' | null;

export default function Messages() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const listKey = commentsQueryOptions(BASE, POST_ID).queryKey;
  const { data: comments = [], isPending } = useQuery(commentsQueryOptions(BASE, POST_ID));
  const { roots, repliesOf } = useMemo(() => groupComments(comments), [comments]);
  const { user, isLoggedIn, providers, getGoogleAuthUrl, getGitHubAuthUrl } = useAuth();

  const [text, setText] = useState('');
  const [author, setAuthor] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [captcha, setCaptcha] = useState({ a: 0, b: 0 });
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: number; author: string } | null>(null);
  const [error, setError] = useState<CommentDraftError | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent>(null);
  const [liked, setLiked] = useState<number[]>([]);
  /** 焦點在發送台裡（展開身分與驗證碼） */
  const [focused, setFocused] = useState(false);
  /** 剛送出的那段字：發送台上緣的波形往右飛走，飛完清掉 */
  const [flying, setFlying] = useState<string | null>(null);
  const asUser = isLoggedIn && !anonymous;
  const open = focused || text !== '' || replyTo !== null || error !== null;
  // 瀑布圖：最新的在最上面，回覆照時間接在它回的那則底下
  const rows = useMemo(
    () => [...roots].reverse().flatMap((c) => [c, ...(repliesOf.get(c.id) ?? [])]),
    [roots, repliesOf],
  );

  const pageRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const captchaRef = useRef<HTMLInputElement>(null);
  const typingRef = useRef('');
  typingRef.current = text;
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

  // 讀 localStorage 與出驗證碼都只能在瀏覽器端（server 沒有 localStorage，Math.random 會讓兩邊不一致）
  /* eslint-disable @eslint-react/set-state-in-effect */
  useEffect(() => {
    try {
      setLiked(JSON.parse(localStorage.getItem(`liked_comments_${BASE}_${POST_ID}`) ?? '[]') as number[]);
      setAuthor(localStorage.getItem('comment_author') ?? '');
      setEmail(localStorage.getItem('comment_email') ?? '');
      setWebsite(localStorage.getItem('comment_website') ?? '');
    } catch {
      // 私密視窗或封鎖了網站資料：沒有記住的東西就算了
    }
    setCaptcha(newCaptcha());
  }, []);
  /* eslint-enable @eslint-react/set-state-in-effect */

  // 焦點進出發送台：進來就展開，移到發送台外面才收（在裡面換欄位不算離開）
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const onIn = () => setFocused(true);
    const onOut = (e: FocusEvent) => {
      if (!(e.relatedTarget instanceof Node && form.contains(e.relatedTarget))) setFocused(false);
    };
    form.addEventListener('focusin', onIn);
    form.addEventListener('focusout', onOut);
    return () => {
      form.removeEventListener('focusin', onIn);
      form.removeEventListener('focusout', onOut);
    };
  }, []);

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

  const login = (provider: 'github' | 'google') => {
    sessionStorage.setItem('oauth_return_to', window.location.pathname);
    const back = `${window.location.origin}/auth/callback`;
    window.location.href =
      provider === 'github' ? `${getGitHubAuthUrl(back)}&state=github` : `${getGoogleAuthUrl(back)}&state=google`;
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const invalid = validateCommentDraft({
      content: text,
      author,
      captchaAnswer,
      captchaSum: captcha.a + captcha.b,
      requiresIdentity: !asUser,
    });
    setError(invalid);
    setSent(null);
    if (invalid) {
      if (invalid === 'captcha') {
        setCaptcha(newCaptcha());
        setCaptchaAnswer('');
      }
      (invalid === 'empty' ? textRef : invalid === 'noName' ? nameRef : captchaRef).current?.focus();
      return;
    }
    const content = text.trim();
    sendingRef.current = { text: content, start: performance.now() };
    setFlying(content);
    // 跟 CSS 的 msg-fly 一樣長
    window.setTimeout(() => setFlying(null), FLY_MS);
    setBusy(true);
    if (!asUser) {
      try {
        localStorage.setItem('comment_author', author);
        localStorage.setItem('comment_email', email);
        localStorage.setItem('comment_website', website);
      } catch {
        // 記不住也沒關係
      }
    }
    try {
      const res = await fetch(`/api/${BASE}/${POST_ID}/comments`, {
        method: 'POST',
        headers: asUser ? jsonAuthHeaders() : { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: asUser ? (user?.displayName ?? '') : author.trim(),
          content: replyTo ? `@${replyTo.author} ${content}` : content,
          email: asUser ? (user?.email ?? '') : email.trim(),
          website: asUser ? '' : website.trim(),
          avatar_url: asUser ? (user?.avatar ?? '') : '',
          provider: asUser ? (user?.provider ?? '') : '',
          parent_id: replyTo?.id ?? null,
          ...(!asUser && { captcha: Number.parseInt(captchaAnswer, 10), captchaAnswer: captcha.a + captcha.b }),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { status?: string };
      setText('');
      if (textRef.current) textRef.current.style.height = '';
      setReplyTo(null);
      setCaptcha(newCaptcha());
      setCaptchaAnswer('');
      setSent(data.status === 'approved' ? 'approved' : 'pending');
      void queryClient.invalidateQueries({ queryKey: listKey });
    } catch {
      sendingRef.current = null;
      setFlying(null);
      setError('failed');
    } finally {
      setBusy(false);
    }
  };

  const like = async (id: number) => {
    if (liked.includes(id)) return;
    try {
      const res = await fetch(`/api/comments/${id}/like`, { method: 'POST' });
      if (!res.ok) return;
      const data = (await res.json()) as { likes: number };
      queryClient.setQueryData<CommentRow[]>(listKey, (old) =>
        (old ?? []).map((c) => (c.id === id ? { ...c, likes: data.likes } : c)),
      );
      const next = [...liked, id];
      setLiked(next);
      try {
        localStorage.setItem(`liked_comments_${BASE}_${POST_ID}`, JSON.stringify(next));
      } catch {
        // 記不住的話下次重新整理可以再按一次，無妨
      }
    } catch {
      // 按讚失敗不打擾人
    }
  };

  const reply = (c: CommentRow) => {
    setReplyTo({ id: c.id, author: c.author });
    textRef.current?.focus();
  };

  const chars = Array.from(text).length;
  const errorText =
    error === 'empty'
      ? t('messages.errEmpty')
      : error === 'noName'
        ? t('messages.errName')
        : error === 'captcha'
          ? t('messages.errCaptcha')
          : error === 'failed'
            ? t('messages.errFailed')
            : null;

  const row = (c: CommentRow, showDate: boolean) => {
    const isReply = c.parent_id != null;
    const stamp = stampOf(c.created_at);
    return (
      <li key={c.id} className={isReply ? 'msg-item is-reply' : 'msg-item'}>
        <time className="msg-stamp" dateTime={c.created_at}>
          {showDate && <b>{stamp.date}</b>}
          <span>{stamp.time}</span>
        </time>
        <svg className="msg-band" viewBox={`0 0 ${BAND_W} ${BAND_H}`} preserveAspectRatio="none" aria-hidden="true">
          <line className="msg-floor" x1={0} y1={BAND_H / 2} x2={BAND_W} y2={BAND_H / 2} />
          <path d={bandPath(c.content, freqOf(c.author), BAND_W, BAND_H, isReply ? 0.4 : 0.6)} />
        </svg>
        <div className="msg-item-body">
          <div className="msg-item-head">
            {c.website ? (
              <a className="msg-author" href={c.website} target="_blank" rel="noopener noreferrer nofollow ugc">
                {c.author}
              </a>
            ) : (
              <span className="msg-author">{c.author}</span>
            )}
            {c.is_admin ? <span className="msg-admin">{t('messages.admin')}</span> : null}
          </div>
          <p className="msg-item-text">{c.content}</p>
          <div className="msg-item-actions">
            {!isReply && (
              <button type="button" onClick={() => reply(c)}>
                {t('messages.reply')}
              </button>
            )}
            <button
              type="button"
              className={liked.includes(c.id) ? 'is-liked' : undefined}
              aria-pressed={liked.includes(c.id)}
              onClick={() => void like(c.id)}
            >
              {t('messages.like')}
              {c.likes > 0 && <span>{c.likes}</span>}
            </button>
          </div>
        </div>
      </li>
    );
  };

  const wave = flying ?? text;

  return (
    <div className="msg" ref={pageRef}>
      <header className="msg-head">
        <div className="msg-title">
          <h1>{t('messages.title')}</h1>
          <span className="msg-latin">Messages</span>
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
        {isPending ? null : rows.length ? (
          <>
            <div className="msg-scale" aria-hidden="true">
              <span>UTC</span>
              <span className="msg-ticks">
                {BAND_TICKS.map((f, i) => (
                  <i key={f}>
                    {f}
                    {i === BAND_TICKS.length - 1 && <em> MHz</em>}
                  </i>
                ))}
              </span>
            </div>
            <ol className="msg-list">
              {rows.map((c, i) =>
                row(c, i === 0 || stampOf(rows[i - 1].created_at).date !== stampOf(c.created_at).date),
              )}
            </ol>
          </>
        ) : (
          <div className="msg-empty">
            <b>{t('messages.emptyTitle')}</b>
            <p>{t('messages.emptyText')}</p>
          </div>
        )}
      </section>

      <form className={open ? 'msg-tx is-open' : 'msg-tx'} ref={formRef} onSubmit={(e) => void submit(e)} noValidate>
        <h2 className="sr-only">{t('messages.formTitle')}</h2>
        {/* 點進來才展開；收起來時仍在版面裡（高度 0），驗證沒過時才能把焦點移進去 */}
        <div className="msg-tx-panel">
          <div className="msg-tx-fields">
            {asUser ? (
              <p className="msg-as">
                {t('messages.asUser', { name: user?.displayName ?? '' })}
                <button type="button" onClick={() => setAnonymous(true)}>
                  {t('messages.useAnonymous')}
                </button>
              </p>
            ) : (
              <>
                {(providers.github.enabled || providers.google.enabled) && (
                  <div className="msg-login">
                    <span>{t('messages.loginWith')}</span>
                    {providers.github.enabled && (
                      <button
                        type="button"
                        className="msg-provider"
                        aria-label="GitHub"
                        title="GitHub"
                        onClick={() => login('github')}
                      >
                        <FaGithub aria-hidden="true" />
                      </button>
                    )}
                    {providers.google.enabled && (
                      <button
                        type="button"
                        className="msg-provider"
                        aria-label="Google"
                        title="Google"
                        onClick={() => login('google')}
                      >
                        <FaGoogle aria-hidden="true" />
                      </button>
                    )}
                    {isLoggedIn && (
                      <button type="button" onClick={() => setAnonymous(false)}>
                        {t('messages.useAccount')}
                      </button>
                    )}
                  </div>
                )}
                <div className="msg-row">
                  <label className="msg-input">
                    <span>{t('messages.fieldName')}</span>
                    <input
                      ref={nameRef}
                      type="text"
                      maxLength={24}
                      autoComplete="name"
                      value={author}
                      aria-invalid={error === 'noName' ? true : undefined}
                      onChange={(e) => setAuthor(e.target.value)}
                    />
                  </label>
                  <label className="msg-input">
                    <span>{t('messages.fieldEmail')}</span>
                    <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </label>
                  <label className="msg-input">
                    <span>{t('messages.fieldWebsite')}</span>
                    <input
                      type="url"
                      autoComplete="url"
                      placeholder="https://"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </label>
                  <label className="msg-input msg-captcha">
                    <span>{t('messages.captcha', { a: captcha.a, b: captcha.b })}</span>
                    <input
                      ref={captchaRef}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={captchaAnswer}
                      aria-invalid={error === 'captcha' ? true : undefined}
                      onChange={(e) => setCaptchaAnswer(e.target.value)}
                    />
                  </label>
                </div>
              </>
            )}
            {replyTo && (
              <p className="msg-replying">
                {t('messages.replyingTo', { name: replyTo.author })}
                <button type="button" onClick={() => setReplyTo(null)}>
                  {t('messages.cancelReply')}
                </button>
              </p>
            )}
            <ul className="msg-rules">
              <li>{t('messages.rule1')}</li>
              <li>{t('messages.rule2')}</li>
              <li>{t('messages.rule3')}</li>
              <li>
                {t('messages.privatePre')} <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
                {t('messages.privateMid')}
                <a href="https://github.com/timo9378/sora-to-ki/issues" target="_blank" rel="noopener noreferrer">
                  GitHub Issues
                </a>
                {t('messages.privatePost')}
              </li>
            </ul>
          </div>
        </div>

        <div className="msg-tx-bar">
          {/* 上緣那條線：打的字即時變成波形，送出時往右飛走 */}
          <svg
            className={flying ? 'msg-tx-wave is-flying' : 'msg-tx-wave'}
            viewBox={`0 0 ${BAND_W} ${TX_WAVE_H}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d={bandPath(wave, 0.5, BAND_W, TX_WAVE_H, 0.7)} />
          </svg>
          <span className="msg-tx-k" aria-hidden="true">
            TX
          </span>
          <label className="msg-tx-text">
            <span className="sr-only">{t('messages.fieldText')}</span>
            <textarea
              ref={textRef}
              rows={1}
              maxLength={MAX_CHARS}
              value={text}
              placeholder={t('messages.fieldText')}
              aria-invalid={error === 'empty' ? true : undefined}
              onChange={(e) => {
                setText(e.target.value);
                grow(e.target);
                if (sent) setSent(null);
              }}
            />
          </label>
          <span className="msg-meter" aria-hidden="true">
            {t('messages.meter', { count: chars, seconds: (chars * SEC_PER_CHAR).toFixed(1) })}
          </span>
          <button type="submit" className="msg-submit" disabled={busy}>
            {t('messages.submit')}
          </button>
        </div>
        <output className="msg-note">
          {errorText ? (
            <em>{errorText}</em>
          ) : sent ? (
            t(sent === 'approved' ? 'messages.sentApproved' : 'messages.sentPending')
          ) : null}
        </output>
      </form>
    </div>
  );
}

function newCaptcha() {
  return { a: Math.floor(Math.random() * 10) + 1, b: Math.floor(Math.random() * 10) + 1 };
}
