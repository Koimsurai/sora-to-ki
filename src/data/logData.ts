import { queryOptions } from '@tanstack/react-query';
import type {
  GithubContributionsResponse,
  SteamGamesResponse,
  WakatimeStatsResponse,
  WakatimeTodayResponse,
} from '@koimsurai/api-types';
import { apiUrl } from '@/lib/api';

// 航行日誌（about/Log）的資料：從站點誕生那天起每天的 GitHub 貢獻、今天寫了多久程式、這週的語言、最近在玩什麼。
// 都是第三方的資料，拿不到就是 null（那一塊顯示「沒有收到」），不讓整頁進錯誤狀態。
const GITHUB_USERNAME = 'timo9378';
const STALE = 10 * 60 * 1000;
/** 從哪一天開始畫（站點誕生） */
export const LOG_START = '2025-04-01';

export interface DayCount {
  /** `YYYY-MM-DD` */
  date: string;
  count: number;
}

/** 站點誕生到今天，每天一筆。後端一次只給一個年度，所以從誕生那年一路抓到今年再接起來 */
export const contributionsSinceQueryOptions = queryOptions({
  queryKey: ['log', 'contributions'],
  queryFn: async (): Promise<DayCount[] | null> => {
    try {
      const first = Number(LOG_START.slice(0, 4));
      const now = new Date();
      const years = Array.from({ length: now.getFullYear() - first + 1 }, (_, i) => first + i);
      const all = await Promise.all(
        years.map(async (y) => {
          const res = await fetch(apiUrl(`/api/github/contributions/${GITHUB_USERNAME}?year=${y}`));
          const data = (await res.json()) as GithubContributionsResponse;
          if (data.error) throw new Error(data.error);
          return data.contributions;
        }),
      );
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      return all
        .flat()
        .filter((d) => d.date >= LOG_START && d.date <= today)
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      return null;
    }
  },
  staleTime: STALE,
});

export interface CodingNow {
  /** 今天寫了幾秒 */
  todaySeconds: number;
  /** 這週的語言（不含 WakaTime 分不出來的 Other），最多四個 */
  languages: { name: string; text: string; percent: number }[];
}

export const codingNowQueryOptions = queryOptions({
  queryKey: ['log', 'wakatime'],
  queryFn: async (): Promise<CodingNow | null> => {
    try {
      const [today, week] = await Promise.all([
        fetch(apiUrl('/api/wakatime/today')).then((r) => r.json() as Promise<WakatimeTodayResponse>),
        fetch(apiUrl('/api/wakatime/week')).then((r) => r.json() as Promise<WakatimeStatsResponse>),
      ]);
      if (today.error ?? week.error) return null;
      return {
        todaySeconds: today.grand_total?.total_seconds ?? 0,
        languages: week.languages.filter((l) => l.name !== 'Other').slice(0, 4),
      };
    } catch {
      return null;
    }
  },
  staleTime: STALE,
  refetchInterval: STALE,
});

export interface PlayingNow {
  /** 最近兩週玩最久的那款與它兩週內的分鐘數 */
  recent: { name: string; minutes2w: number } | null;
  /** Steam 收藏幾款 */
  owned: number;
  /** 玩最久的那款與總分鐘數 */
  longest: { name: string; minutes: number } | null;
}

export const playingNowQueryOptions = queryOptions({
  queryKey: ['log', 'steam'],
  queryFn: async (): Promise<PlayingNow | null> => {
    try {
      const [recent, owned] = await Promise.all([
        fetch(apiUrl('/api/steam/recent-games')).then((r) => r.json() as Promise<SteamGamesResponse>),
        fetch(apiUrl('/api/steam/owned-games')).then((r) => r.json() as Promise<SteamGamesResponse>),
      ]);
      if (recent.error ?? owned.error) return null;
      const top = [...recent.games].sort((a, b) => (b.playtime_2weeks ?? 0) - (a.playtime_2weeks ?? 0)).at(0);
      const longest = [...owned.games].sort((a, b) => (b.playtime_forever ?? 0) - (a.playtime_forever ?? 0)).at(0);
      return {
        recent: top?.name ? { name: top.name, minutes2w: top.playtime_2weeks ?? 0 } : null,
        owned: owned.gameCount ?? owned.games.length,
        longest: longest?.name ? { name: longest.name, minutes: longest.playtime_forever ?? 0 } : null,
      };
    } catch {
      return null;
    }
  },
  staleTime: STALE,
  refetchInterval: STALE,
});
