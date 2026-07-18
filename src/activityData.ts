import { queryOptions } from '@tanstack/react-query';
import { apiUrl } from './api';
import type {
  SteamData,
  SteamProfile,
  SteamGame,
  SteamPlayer,
  WakatimeData,
  WakatimeToday,
  WakatimeWeek,
  GithubData,
  GithubUser,
  GithubEvent,
  GithubRepo,
  GithubContributions,
  ServerStatus,
} from './components/Activity';

// Activity 儀表板資料改由 TanStack Query 管理（client-only、無 SSR loader）。
// 每個資料源各自一個 query → 進頁面立刻 render、各區到齊各補（取代「等全部 API 好才進」的全螢幕 loading）。
// 第三方端點（steam/github/wakatime）queryFn **不 throw**：{error, configured:false} 是合法狀態。
const STALE = 5 * 60 * 1000;
const DATA_REFRESH = 10 * 60 * 1000;
const STATUS_REFRESH = 30 * 1000;
const GITHUB_USERNAME = 'timo9378';

export const steamQueryOptions = queryOptions({
  queryKey: ['activity', 'steam'],
  queryFn: async (): Promise<{ steamData: SteamData; steamProfile: SteamProfile | null }> => {
    try {
      const [recentRes, playerRes, ownedRes, profileRes] = await Promise.all([
        fetch(apiUrl('/api/steam/recent-games')).then((r) => r.json() as Promise<{ error?: string; response?: { games?: SteamGame[] } }>),
        fetch(apiUrl('/api/steam/player')).then((r) => r.json() as Promise<{ error?: string; response?: { players?: SteamPlayer[] } }>),
        fetch(apiUrl('/api/steam/owned-games')).then((r) => r.json() as Promise<{ response?: { games?: SteamGame[]; game_count?: number } }>),
        fetch(apiUrl('/api/steam/profile')).then((r) => (r.ok ? (r.json() as Promise<SteamProfile>) : null)).catch(() => null),
      ]);
      if (recentRes.error || playerRes.error) {
        return { steamData: { error: recentRes.error ?? playerRes.error, configured: false }, steamProfile: null };
      }
      return {
        steamData: {
          recentGames: recentRes.response?.games ?? [],
          ownedGames: ownedRes.response?.games ?? [],
          gameCount: ownedRes.response?.game_count ?? 0,
          playerInfo: playerRes.response?.players?.[0] ?? null,
          configured: true,
        },
        steamProfile: profileRes && !profileRes.error ? profileRes : null,
      };
    } catch {
      return { steamData: { error: 'backend', configured: false }, steamProfile: null };
    }
  },
  staleTime: STALE,
  refetchInterval: DATA_REFRESH,
});

export const wakatimeQueryOptions = queryOptions({
  queryKey: ['activity', 'wakatime'],
  queryFn: async (): Promise<WakatimeData> => {
    try {
      const [todayRes, weekRes] = await Promise.all([
        fetch(apiUrl('/api/wakatime/today')).then((r) => r.json() as Promise<{ error?: string; data?: WakatimeToday[]; actualCodingTime?: unknown }>),
        fetch(apiUrl('/api/wakatime/week')).then((r) => r.json() as Promise<{ error?: string; data?: WakatimeWeek }>),
      ]);
      if (todayRes.error || weekRes.error) return { error: todayRes.error ?? weekRes.error, configured: false };
      return {
        today: todayRes.data?.[0] ?? null,
        week: weekRes.data ?? null,
        actualCodingTime: todayRes.actualCodingTime ?? null,
        configured: true,
      };
    } catch {
      return { error: 'backend', configured: false };
    }
  },
  staleTime: STALE,
  refetchInterval: DATA_REFRESH,
});

export const githubQueryOptions = queryOptions({
  queryKey: ['activity', 'github'],
  queryFn: async (): Promise<GithubData> => {
    try {
      const [userData, eventsData] = await Promise.all([
        fetch(apiUrl(`/api/github/user/${GITHUB_USERNAME}`)).then((r) => r.json() as Promise<GithubUser & { error?: string }>),
        fetch(apiUrl(`/api/github/events/${GITHUB_USERNAME}`)).then((r) => r.json() as Promise<GithubEvent[] & { error?: string }>),
      ]);
      if (userData.error || eventsData.error) return { error: userData.error ?? eventsData.error };
      const pushEvents = eventsData.filter((e: GithubEvent) => e.type === 'PushEvent').slice(0, 10);
      const reposData = await fetch(`https://api.github.com/users/${GITHUB_USERNAME}/repos?sort=updated&per_page=5`)
        .then((r) => r.json() as Promise<GithubRepo[]>)
        .catch(() => [] as GithubRepo[]);
      return { user: userData, recentCommits: pushEvents, recentRepos: reposData };
    } catch {
      return { error: 'backend' };
    }
  },
  staleTime: STALE,
  refetchInterval: DATA_REFRESH,
});

// contributions（外部 jogruber API），依年份參數化 → 年份選擇器 = 換 queryKey 自動 refetch。
export const contributionsQueryOptions = (year: string) =>
  queryOptions({
    queryKey: ['activity', 'contributions', year],
    queryFn: async (): Promise<GithubContributions | null> => {
      try {
        const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${GITHUB_USERNAME}?y=${year}`);
        return (await res.json()) as GithubContributions;
      } catch {
        return null;
      }
    },
    staleTime: STALE,
  });

// server status：量測 /health 回應時間；30 秒 refetchInterval。
export const serverStatusQueryOptions = queryOptions({
  queryKey: ['activity', 'server-status'],
  queryFn: async (): Promise<ServerStatus> => {
    const startTime = Date.now();
    try {
      const res = await fetch(apiUrl('/api/health'));
      const responseTime = Date.now() - startTime;
      return { status: res.ok ? 'online' : 'error', responseTime, lastCheck: new Date() };
    } catch {
      return { status: 'offline', responseTime: 0, lastCheck: new Date() };
    }
  },
  staleTime: 0,
  refetchInterval: STATUS_REFRESH,
});
