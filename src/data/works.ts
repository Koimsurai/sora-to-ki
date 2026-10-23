// 作品頁（about/Works）的清單與數據。
//
// 清單的順序就是螺旋的順序（第一個是中心的起點，越後面越外圈），要跟後端的 WORK_REPOS 一致。
// 每一件長什麼樣子全由 GitHub 的數據決定（語言組成、commit 數、星數、最後推送時間），
// 這裡只放數據給不了的：顯示的名字、一句介紹。
import { queryOptions } from '@tanstack/react-query';
import type { WorkRepo, WorksResponse } from '@koimsurai/api-types';
import { apiUrl } from '@/lib/api';

export interface WorkEntry {
  repo: string;
  name: string;
  /** 一句話：這是什麼 */
  what: Record<string, string>;
  /** 螺旋的起點 */
  origin?: boolean;
  /**
   * 後端還沒拿到數據時用的值（2026-10-23 從 GitHub 量的）：私有 repo 在 token 沒權限時、
   * 或後端還沒更新到有這支端點的版本時，作品照樣畫得出來
   */
  fallback: Omit<WorkRepo, 'repo'>;
}

const langs = (o: Record<string, number>) => Object.entries(o).map(([name, bytes]) => ({ name, bytes }));

export const WORKS: WorkEntry[] = [
  {
    repo: 'timo9378/Volticar_API',
    name: 'VoltiCar',
    origin: true,
    what: {
      'zh-TW': '畢業專題：EV 充電整合與碳權遊戲化',
      'zh-CN': '毕业专题：EV 充电整合与碳权游戏化',
      en: 'Capstone: EV charging hub with carbon-credit gamification',
      ja: '卒業制作：EV 充電の統合とカーボンクレジットのゲーム化',
      ko: '졸업 프로젝트: EV 충전 통합과 탄소 배출권 게임화',
    },
    fallback: {
      url: null,
      created_at: '2025-03-21T00:00:00Z',
      pushed_at: '2025-03-21T00:00:00Z',
      stars: 0,
      commits: 1,
      languages: langs({ Python: 21623, Shell: 2478 }),
    },
  },
  {
    repo: 'timo9378/sora-to-ki',
    name: 'sora-to-ki',
    what: {
      'zh-TW': '你正在看的這個站',
      'zh-CN': '你正在看的这个站',
      en: 'The site you are looking at',
      ja: 'いま見ているこのサイト',
      ko: '지금 보고 있는 이 사이트',
    },
    fallback: {
      url: 'https://github.com/timo9378/sora-to-ki',
      created_at: '2025-03-31T00:00:00Z',
      pushed_at: '2026-10-23T00:00:00Z',
      stars: 2,
      commits: 732,
      languages: langs({ TypeScript: 2368532, Rust: 1381627, CSS: 579299, JavaScript: 95194 }),
    },
  },
  {
    repo: 'timo9378/flow2code',
    name: 'flow2code',
    what: {
      'zh-TW': '看穿 API 路由的 X 光',
      'zh-CN': '看穿 API 路由的 X 光',
      en: 'An X-ray for API routes',
      ja: 'API ルートを透かして見る X 線',
      ko: 'API 라우트를 꿰뚫어 보는 엑스레이',
    },
    fallback: {
      url: 'https://github.com/timo9378/flow2code',
      created_at: '2026-02-26T00:00:00Z',
      pushed_at: '2026-06-12T00:00:00Z',
      stars: 4,
      commits: 70,
      languages: langs({ TypeScript: 977846, JavaScript: 77185 }),
    },
  },
  {
    repo: 'timo9378/session-to-obsidian',
    name: 'session-to-obsidian',
    what: {
      'zh-TW': '把對話整理成主題筆記',
      'zh-CN': '把对话整理成主题笔记',
      en: 'Turns chat sessions into topic notes',
      ja: '会話をテーマ別のノートにまとめる',
      ko: '대화를 주제별 노트로 정리',
    },
    fallback: {
      url: 'https://github.com/timo9378/session-to-obsidian',
      created_at: '2026-06-18T00:00:00Z',
      pushed_at: '2026-10-13T00:00:00Z',
      stars: 2,
      commits: 13,
      languages: langs({ Python: 69873 }),
    },
  },
  {
    repo: 'timo9378/anigamer-rs',
    name: 'anigamer-rs',
    what: {
      'zh-TW': '巴哈姆特動畫瘋的 Rust SDK',
      'zh-CN': '巴哈姆特动画疯的 Rust SDK',
      en: 'A Rust SDK for Bahamut Anime Crazy',
      ja: 'バハムート動画疯の Rust SDK',
      ko: '바하무트 애니메이션 크레이지용 Rust SDK',
    },
    fallback: {
      url: 'https://github.com/timo9378/anigamer-rs',
      created_at: '2026-07-15T00:00:00Z',
      pushed_at: '2026-08-04T00:00:00Z',
      stars: 0,
      commits: 3,
      languages: langs({ Rust: 43438 }),
    },
  },
  {
    repo: 'timo9378/nuntius',
    name: 'nuntius',
    what: {
      'zh-TW': 'Discord 與 GitHub 之間的信使',
      'zh-CN': 'Discord 与 GitHub 之间的信使',
      en: 'A messenger between Discord and GitHub',
      ja: 'Discord と GitHub をつなぐ伝令',
      ko: 'Discord와 GitHub 사이의 전령',
    },
    fallback: {
      url: 'https://github.com/timo9378/nuntius',
      created_at: '2026-08-13T00:00:00Z',
      pushed_at: '2026-10-16T00:00:00Z',
      stars: 3,
      commits: 31,
      languages: langs({ Python: 301901 }),
    },
  },
  {
    repo: 'Limatura/tessera',
    name: 'tessera',
    what: {
      'zh-TW': '用完會自己清掉的檔案分享',
      'zh-CN': '用完会自己清掉的文件分享',
      en: 'File sharing that cleans up after itself',
      ja: '使い終わると自分で消えるファイル共有',
      ko: '다 쓰면 스스로 지워지는 파일 공유',
    },
    fallback: {
      url: 'https://github.com/Limatura/tessera',
      created_at: '2026-10-16T00:00:00Z',
      pushed_at: '2026-10-23T00:00:00Z',
      stars: 48,
      commits: 88,
      languages: langs({ Rust: 3757802, TypeScript: 1745467, JavaScript: 38282, CSS: 25658, Python: 18382 }),
    },
  },
];

/** `/api/github/works`：抓不到就是空的，作品頁改用 fallback */
export const worksQueryOptions = queryOptions({
  queryKey: ['github', 'works'],
  queryFn: async (): Promise<WorkRepo[]> => {
    const res = await fetch(apiUrl('/api/github/works'));
    if (!res.ok) return [];
    const data = (await res.json()) as WorksResponse;
    return data.works;
  },
  staleTime: 60 * 60 * 1000,
});
