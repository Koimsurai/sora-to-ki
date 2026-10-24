// 送出一道訊號：留言頁、文章頁、碎念共用的留言表單。
// 平常只有一行「TX｜想說的話｜字數｜送出」，焦點移進來才往上展開登入圖示、名字、Email、網站、驗證碼與規則
// （收起來時仍在版面裡，高度 0：驗證沒過時才能把焦點移進去）。上緣那條線是打的字即時變成的波形，送出時往右飛走。
// 資料照文章留言那一套（匿名的要審核，登入的直接公開）；回覆給誰由外面決定（清單上的「回覆」）。
import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FaGithub, FaGoogle } from 'react-icons/fa';
import { bandPath } from '@/components/about/messagesWave';
import { useAuth } from '@/contexts/auth';
import { commentsQueryOptions } from '@/data/commentsData';
import { jsonAuthHeaders } from '@/lib/authToken';
import { validateCommentDraft, type CommentDraftError } from '@/lib/comments';
import './CommentForm.css';

/** 一則最多幾個字 */
const MAX_CHARS = 500;
/** 一個字是幾秒的訊號（只是顯示用的換算） */
const SEC_PER_CHAR = 0.12;
/** 上緣那條線的 viewBox */
const WAVE_W = 600;
const WAVE_H = 14;
/** 送出時那條線飛走要多久（毫秒，跟 CommentForm.css 的 cf-fly 一樣） */
const FLY_MS = 1200;
/** 打字時輸入框最高長到多高（px），再多就捲動 */
const TEXT_MAX_H = 160;

/** 輸入框跟著字長高 */
function grow(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, TEXT_MAX_H)}px`;
}

const newCaptcha = () => ({ a: Math.floor(Math.random() * 10) + 1, b: Math.floor(Math.random() * 10) + 1 });

export interface ReplyTarget {
  id: number;
  author: string;
}

interface Props {
  /** 'posts' 或 'thoughts' */
  base: string;
  postId: string | number;
  replyTo: ReplyTarget | null;
  onCancelReply: () => void;
  /** 輸入框：清單上按「回覆」時外面要把焦點移進來 */
  textRef: RefObject<HTMLTextAreaElement | null>;
  /** 展開時規則底下多一段（留言頁放「不適合公開的話寄信」） */
  extraNote?: ReactNode;
  /** 正在打的字（留言頁的頻道拿去畫波形） */
  onTyping?: (text: string) => void;
  /** 確定送出的那一刻（留言頁的頻道讓那段飛進天線）；送失敗時再叫一次，帶 null */
  onSend?: (text: string | null) => void;
  className?: string;
}

type Sent = 'pending' | 'approved' | null;

export default function CommentForm({
  base,
  postId,
  replyTo,
  onCancelReply,
  textRef,
  extraNote,
  onTyping,
  onSend,
  className,
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user, isLoggedIn, providers, getGoogleAuthUrl, getGitHubAuthUrl } = useAuth();
  const [text, setText] = useState('');
  const [author, setAuthor] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [captcha, setCaptcha] = useState({ a: 0, b: 0 });
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [error, setError] = useState<CommentDraftError | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent>(null);
  /** 焦點在表單裡（展開身分與驗證碼） */
  const [focused, setFocused] = useState(false);
  /** 剛送出的那段字：上緣的波形往右飛走，飛完清掉 */
  const [flying, setFlying] = useState<string | null>(null);
  const asUser = isLoggedIn && !anonymous;
  const open = focused || text !== '' || replyTo !== null || error !== null;

  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const captchaRef = useRef<HTMLInputElement>(null);

  // 讀 localStorage 與出驗證碼都只能在瀏覽器端（server 沒有 localStorage，Math.random 會讓兩邊不一致）
  /* eslint-disable @eslint-react/set-state-in-effect */
  useEffect(() => {
    try {
      setAuthor(localStorage.getItem('comment_author') ?? '');
      setEmail(localStorage.getItem('comment_email') ?? '');
      setWebsite(localStorage.getItem('comment_website') ?? '');
    } catch {
      // 私密視窗或封鎖了網站資料：沒有記住的東西就算了
    }
    setCaptcha(newCaptcha());
  }, []);
  /* eslint-enable @eslint-react/set-state-in-effect */

  // 焦點進出表單：進來就展開，移到表單外面才收（在裡面換欄位不算離開）
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

  const login = (provider: 'github' | 'google') => {
    sessionStorage.setItem('oauth_return_to', window.location.pathname);
    const back = `${window.location.origin}/auth/callback`;
    window.location.href =
      provider === 'github' ? `${getGitHubAuthUrl(back)}&state=github` : `${getGoogleAuthUrl(back)}&state=google`;
  };

  const type = (v: string) => {
    setText(v);
    onTyping?.(v);
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
    onSend?.(content);
    setFlying(content);
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
      const res = await fetch(`/api/${base}/${postId}/comments`, {
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
      type('');
      if (textRef.current) textRef.current.style.height = '';
      onCancelReply();
      setCaptcha(newCaptcha());
      setCaptchaAnswer('');
      setSent(data.status === 'approved' ? 'approved' : 'pending');
      void queryClient.invalidateQueries({ queryKey: commentsQueryOptions(base, postId).queryKey });
    } catch {
      onSend?.(null);
      setFlying(null);
      setError('failed');
    } finally {
      setBusy(false);
    }
  };

  const chars = Array.from(text).length;
  const errorText =
    error === 'empty'
      ? t('signal.errEmpty')
      : error === 'noName'
        ? t('signal.errName')
        : error === 'captcha'
          ? t('signal.errCaptcha')
          : error === 'failed'
            ? t('signal.errFailed')
            : null;

  return (
    <form
      className={['cf', open ? 'is-open' : '', className ?? ''].filter(Boolean).join(' ')}
      ref={formRef}
      onSubmit={(e) => void submit(e)}
      noValidate
    >
      <h2 className="sr-only">{t('signal.formTitle')}</h2>
      <div className="cf-panel">
        <div className="cf-fields">
          {asUser ? (
            <p className="cf-as">
              {t('signal.asUser', { name: user?.displayName ?? '' })}
              <button type="button" onClick={() => setAnonymous(true)}>
                {t('signal.useAnonymous')}
              </button>
            </p>
          ) : (
            <>
              {(providers.github.enabled || providers.google.enabled) && (
                <div className="cf-login">
                  <span>{t('signal.loginWith')}</span>
                  {providers.github.enabled && (
                    <button
                      type="button"
                      className="cf-provider"
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
                      className="cf-provider"
                      aria-label="Google"
                      title="Google"
                      onClick={() => login('google')}
                    >
                      <FaGoogle aria-hidden="true" />
                    </button>
                  )}
                  {isLoggedIn && (
                    <button type="button" onClick={() => setAnonymous(false)}>
                      {t('signal.useAccount')}
                    </button>
                  )}
                </div>
              )}
              <div className="cf-row">
                <label className="cf-input">
                  <span>{t('signal.fieldName')}</span>
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
                <label className="cf-input">
                  <span>{t('signal.fieldEmail')}</span>
                  <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label className="cf-input">
                  <span>{t('signal.fieldWebsite')}</span>
                  <input
                    type="url"
                    autoComplete="url"
                    placeholder="https://"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </label>
                <label className="cf-input cf-captcha">
                  <span>{t('signal.captcha', { a: captcha.a, b: captcha.b })}</span>
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
            <p className="cf-replying">
              {t('signal.replyingTo', { name: replyTo.author })}
              <button type="button" onClick={onCancelReply}>
                {t('signal.cancelReply')}
              </button>
            </p>
          )}
          <ul className="cf-rules">
            <li>{t('signal.rule1')}</li>
            <li>{t('signal.rule2')}</li>
            <li>{t('signal.rule3')}</li>
            {extraNote && <li>{extraNote}</li>}
          </ul>
        </div>
      </div>

      <div className="cf-bar">
        {/* 上緣那條線：打的字即時變成波形，送出時往右飛走 */}
        <svg
          className={flying ? 'cf-wave is-flying' : 'cf-wave'}
          viewBox={`0 0 ${WAVE_W} ${WAVE_H}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={bandPath(flying ?? text, 0.5, WAVE_W, WAVE_H, 0.7)} />
        </svg>
        <span className="cf-k" aria-hidden="true">
          TX
        </span>
        <label className="cf-text">
          <span className="sr-only">{t('signal.fieldText')}</span>
          <textarea
            ref={textRef}
            rows={1}
            maxLength={MAX_CHARS}
            value={text}
            placeholder={t('signal.fieldText')}
            aria-invalid={error === 'empty' ? true : undefined}
            onChange={(e) => {
              type(e.target.value);
              grow(e.target);
              if (sent) setSent(null);
            }}
          />
        </label>
        <span className="cf-meter" aria-hidden="true">
          {t('signal.meter', { count: chars, seconds: (chars * SEC_PER_CHAR).toFixed(1) })}
        </span>
        <button type="submit" className="cf-submit" disabled={busy}>
          {t('signal.submit')}
        </button>
      </div>
      <output className="cf-note">
        {errorText ? (
          <em>{errorText}</em>
        ) : sent ? (
          t(sent === 'approved' ? 'signal.sentApproved' : 'signal.sentPending')
        ) : null}
      </output>
    </form>
  );
}
