import { useRef } from 'react';
import { useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useLocaleNavigate } from '@/hooks/useLocale';
import { useThoughtAdmin } from '@/hooks/useThoughtAdmin';
import { LocaleLink } from '@/i18n/locale-link';
import { enterStyle } from '@/lib/enter';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/auth';
import KoimLoader from '@/components/common/KoimLoader';
import ThoughtCard from './ThoughtCard';
import Comments from './Comments';
import { thoughtDetailQueryOptions } from '@/data/thoughtData';
import { parseServerDate } from '@/lib/serverDate';
import { useSkyAnchor } from '@/hooks/useSkyAnchor';
import { useSkyPage } from '@/hooks/useSkyPage';
import { stripLocalePrefix } from '@/i18n/start-i18n';
import './Thinking.css';

const pad = (n: number) => String(n).padStart(2, '0');
/** 2026.07.19 與 21:30 */
const stamp = (iso: string) => {
  const d = parseServerDate(iso);
  return [
    `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`,
    `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  ];
};

const LEAVE = {
  keyframes: [{ opacity: 1 }, { opacity: 0 }],
  options: { duration: 500, easing: 'ease-out' },
};
const stillOnMoment = () => stripLocalePrefix(window.location.pathname).startsWith('thinking/');

function ThinkingDetail() {
  const { t } = useTranslation();
  const { id = '' } = useParams({ strict: false }); // 兩種路由（/thinking/$id、/$locale/thinking/$id）共用
  const { isAdmin } = useAuth();
  const navigate = useLocaleNavigate();
  const admin = useThoughtAdmin();
  // 碎念改由 useQuery 讀：route loader 已 ensureQueryData 預取 → SSR baked、hydrate 讀快取。
  // data：undefined=載入中、null=找不到、Thought=有。
  const { data: thought } = useQuery(thoughtDetailQueryOptions(id));

  const del = (tid: number) => {
    if (!window.confirm('刪除這則碎念？')) return;
    admin.remove.mutate(tid, { onSuccess: () => void navigate('/thinking') });
  };
  const edit = (tid: number, content: string) => admin.edit.mutate({ id: tid, content });

  // 一則念頭單獨攤開：土星縮小停在右上角（從列表點進來時，從頁首那個位置滑過來）
  const pageRef = useRef<HTMLDivElement | null>(null);
  const planetRef = useRef<HTMLDivElement | null>(null);
  useSkyAnchor(planetRef);
  useSkyPage(pageRef, { sky: 'moments', ready: true, arriveAt: 1600, leave: LEAVE, stillHere: stillOnMoment });
  const [day, time] = thought ? stamp(thought.created_at) : ['', ''];

  return (
    <div className="tk-page tk-page--detail" ref={pageRef}>
      <div className="tk-wrap tk-wrap--detail">
        <div className="tk-detail-planet" ref={planetRef} aria-hidden="true" />
        <LocaleLink to="/thinking" className="tk-back">
          ← {t('thinking.back')}
        </LocaleLink>

        {thought === undefined && <KoimLoader inline size="sm" />}
        {thought === null && <p className="tk-empty">{t('thinking.notFound')}</p>}

        {thought && (
          <article className="tk-detail enter" style={enterStyle({ y: 16, dur: 500 })}>
            <p className="tk-detail-stamp">
              <span>{day}</span>
              <span>{time}</span>
            </p>
            <ThoughtCard th={thought} isAdmin={isAdmin} onDelete={del} onEdit={edit} detail />
            <div className="tk-comments">
              <Comments postId={thought.id} basePath="thoughts" />
            </div>
          </article>
        )}
      </div>
    </div>
  );
}

export default ThinkingDetail;
