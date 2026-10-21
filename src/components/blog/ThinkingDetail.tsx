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
import './Thinking.css';

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

  return (
    <div className="tk-page">
      <div className="tk-scrim" />

      <div className="tk-wrap tk-wrap--detail">
        <LocaleLink to="/thinking" className="tk-back">
          ← {t('thinking.back')}
        </LocaleLink>

        {thought === undefined && <KoimLoader inline size="sm" />}
        {thought === null && <p className="tk-empty">{t('thinking.notFound')}</p>}

        {thought && (
          <div className="enter" style={enterStyle({ y: 16, dur: 500 })}>
            <ThoughtCard th={thought} isAdmin={isAdmin} onDelete={del} onEdit={edit} detail />
            <div className="tk-comments">
              <Comments postId={thought.id} basePath="thoughts" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ThinkingDetail;
