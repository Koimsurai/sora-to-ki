// 關於我 — 從首頁移出的「履歷叢集」：About / Expertise / Work / Clubs，
// 收尾接上精簡版成長軌跡（舊 /journey 併入此頁，/journey 轉址過來）。
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SEOHead from './SEOHead';
import AboutMe from './AboutMe';
import Expertise from './Expertise';
import WorkExperience from './WorkExperience';
import SchoolClubs from './SchoolClubs';
import JourneyTimeline from './JourneyTimeline';
import './AboutPage.css';

const SEO: Record<string, { title: string; desc: string }> = {
  'zh-TW': { title: '關於我', desc: 'Koimsurai — 全端工程師。技能、經歷、社團與成長軌跡。' },
  'zh-CN': { title: '关于我', desc: 'Koimsurai — 全栈工程师。技能、经历、社团与成长轨迹。' },
  en: { title: 'About', desc: 'Koimsurai — full-stack engineer. Skills, experience, communities and journey.' },
  ja: { title: '私について', desc: 'Koimsurai — フルスタックエンジニア。スキル・経歴・コミュニティ・歩み。' },
  ko: { title: '소개', desc: 'Koimsurai — 풀스택 엔지니어. 기술, 경력, 커뮤니티와 여정.' },
};

function AboutPage() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'zh-TW';
  const seo = SEO[lang] || SEO['zh-TW'];
  const { hash } = useLocation();

  // /about#journey 之類的 hash 進場：等 section 掛載後捲過去
  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    const timer = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => clearTimeout(timer);
  }, [hash]);

  return (
    <div className="about-page">
      {/* 前景濾鏡：壓暗亮星空，跟 /watch /thinking 一致 */}
      <div className="about-scrim" />
      <SEOHead title={seo.title} description={seo.desc} path="/about" />
      <AboutMe />
      <Expertise />
      <WorkExperience />
      <SchoolClubs />
      <JourneyTimeline />
    </div>
  );
}

export default AboutPage;
