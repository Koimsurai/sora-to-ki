// 設備頁的開頭：一個終端機視窗跑 neofetch。r/unixporn 那類社群秀配備就是這個樣子，
// 而這個網站本身就跑在這台伺服器上，所以提示字元是 koimsurai@home-server。
//
// 底下那行提示字元可以打指令：分類是資料夾、設備是檔案。`cd` 跟頁面的分類膠囊是同一個狀態——
// cd 進 server 就等於按了「伺服器」那顆，cd .. 就回到全部。
//
// 欄位名照 neofetch 原樣用英文；值是這台伺服器的實際規格（2026-10 抄的），換硬體要回來改。
// Packages 那行借來放設備數——neofetch 本來是數套件，這裡數的是「裝了多少東西」。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { APPLIANCES, BASE_II_SPECS, GEAR, type GearFilter } from './setupGear';

/** figlet 的 ANSI Shadow 字型寫的 K，neofetch 左邊放發行版標誌的位置 */
const LOGO = ['██╗  ██╗', '██║ ██╔╝', '█████╔╝ ', '██╔═██╗ ', '██║  ██╗', '╚═╝  ╚═╝'];

const SPECS: [string, string][] = [
  ['OS', 'Ubuntu 24.04 LTS x86_64'],
  ['Kernel', 'Linux 7.0'],
  ['CPU', 'AMD Ryzen 7 8700G (16)'],
  ['GPU', 'NVIDIA RTX 5060 Ti 16GB'],
  ['Memory', '64 GiB DDR5-5600'],
  ['Disk', '2TB NVMe · 32TB HDD pool'],
  ['Containers', '80+ · Home Assistant · Matter · this site'],
];

/** neofetch 最後那排色塊：站上的品牌色 */
const SWATCHES = ['lavender', 'brand', 'magenta', 'sky', 'amber', 'green', 'ink', 'zinc'];

/** 資料夾：頁面的分類，加上老家 */
const DIRS: Exclude<GearFilter, 'all'>[] = [...GEAR.map((c) => c.id), 'base-ii'];
const COMMANDS = ['help', 'ls', 'cd', 'cat', 'pwd', 'whoami', 'neofetch', 'clear'];
const APPLIANCES_FILE = 'appliances.txt';
/** 終端機最多留幾筆輸出，舊的丟掉 */
const MAX_ENTRIES = 40;

interface Props {
  total: number;
  iot: number;
  /** 目前所在的資料夾＝頁面目前的分類篩選 */
  cwd: GearFilter;
  onCd: (dir: GearFilter) => void;
}

interface Entry {
  id: number;
  /** 打的指令（開頭那筆是自動跑的 neofetch） */
  cmd: string;
  /** 下指令時的路徑：提示字元要顯示「當時」在哪，不是現在 */
  path: string;
  out: ReactNode;
}

const pathOf = (cwd: GearFilter) => (cwd === 'all' ? '~' : `~/${cwd}`);

/** 某個資料夾裡的「檔案」：設備的 id，老家是規格，智慧家庭多一個家電清單 */
function filesIn(dir: GearFilter): string[] {
  if (dir === 'all') return [];
  if (dir === 'base-ii') return BASE_II_SPECS.map((s) => s.label.toLowerCase());
  const files = GEAR.find((c) => c.id === dir)?.items.map((i) => i.id) ?? [];
  return dir === 'smart-home' ? [...files, APPLIANCES_FILE] : files;
}

function Fetch({ total, iot }: { total: number; iot: number }) {
  const { t } = useTranslation();
  return (
    <div className="setup-term-fetch">
      <pre className="setup-term-logo" aria-hidden="true">
        {LOGO.join('\n')}
      </pre>
      <div className="setup-term-info">
        <p className="setup-term-host">
          <span className="setup-term-accent">koimsurai</span>@<span className="setup-term-accent">home-server</span>
        </p>
        <p className="setup-term-rule" aria-hidden="true">
          ─────────────────────
        </p>
        <dl className="setup-term-specs">
          {SPECS.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
          <div>
            <dt>Packages</dt>
            <dd>{t('setup.packages', { count: total, iot })}</dd>
          </div>
        </dl>
        <div className="setup-term-swatches" aria-hidden="true">
          {SWATCHES.map((s) => (
            <i key={s} data-c={s} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SetupNeofetch({ total, iot, cwd, onCd }: Props) {
  const { t } = useTranslation();
  const nextIdRef = useRef(1);
  const [entries, setEntries] = useState<Entry[]>([
    { id: 0, cmd: 'neofetch', path: '~', out: <Fetch total={total} iot={iot} /> },
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histPos, setHistPos] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 有新輸出就捲到底，跟真的終端機一樣
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  const run = (raw: string): ReactNode => {
    const [cmd = '', ...args] = raw.trim().split(/\s+/);
    const arg = args.join(' ');
    switch (cmd) {
      case '':
        return null;
      case 'help':
        return (
          <dl className="setup-term-help">
            {COMMANDS.map((c) => (
              <div key={c}>
                <dt>{c}</dt>
                <dd>{t(`setup.term.help.${c}`)}</dd>
              </div>
            ))}
          </dl>
        );
      case 'ls': {
        const target = arg ? resolveDir(arg) : cwd;
        if (target === null) return `ls: ${arg}: No such file or directory`;
        if (target === 'all') {
          return (
            <span className="setup-term-ls">
              {DIRS.map((d) => (
                <span key={d} className="is-dir">
                  {d}/
                </span>
              ))}
            </span>
          );
        }
        return (
          <span className="setup-term-ls">
            {filesIn(target).map((f) => (
              <span key={f}>{f}</span>
            ))}
          </span>
        );
      }
      case 'cd': {
        const target = arg ? resolveDir(arg) : 'all';
        if (target === null) return `cd: ${arg}: No such file or directory`;
        onCd(target);
        return null;
      }
      case 'cat':
        return cat(arg);
      case 'pwd':
        return `/home/koimsurai${cwd === 'all' ? '' : `/${cwd}`}`;
      case 'whoami':
        return 'koimsurai';
      case 'neofetch':
        return <Fetch total={total} iot={iot} />;
      case 'sudo':
        return t('setup.term.sudo');
      default:
        return `${cmd}: command not found — ${t('setup.term.tryHelp')}`;
    }
  };

  /**
   * cd／ls 的目標：.. 與 ~ 回上層，其餘要是資料夾名。前綴的 ../、~/、./ 都吃，
   * 而且在子資料夾裡直接打別的資料夾名也進得去——訪客不是在用真的 shell，不必那麼嚴格。
   */
  const resolveDir = (arg: string): GearFilter | null => {
    const a = arg
      .replace(/\/+$/, '')
      .replace(/^(\.\.\/)+/, '')
      .replace(/^~\/?/, '')
      .replace(/^\.\//, '');
    if (a === '' || a === '..' || a === '~') return 'all';
    if (a === '.') return cwd;
    return DIRS.find((d) => d === a) ?? null;
  };

  const cat = (arg: string): ReactNode => {
    if (!arg) return 'cat: missing operand';
    if (cwd === 'all') return `cat: ${arg}: Is a directory — ${t('setup.term.cdFirst')}`;
    if (cwd === 'smart-home' && arg === APPLIANCES_FILE) {
      return APPLIANCES.map((a) => `${a.name} — ${t(`setup.appliances.types.${a.typeKey}`)}`).join('\n');
    }
    if (cwd === 'base-ii') {
      const spec = BASE_II_SPECS.find((s) => s.label.toLowerCase() === arg.toLowerCase());
      return spec ? spec.value : `cat: ${arg}: No such file or directory`;
    }
    const item = GEAR.find((c) => c.id === cwd)?.items.find((i) => i.id === arg);
    if (!item) return `cat: ${arg}: No such file or directory`;
    return [item.name, item.spec, item.roleKey ? t(`setup.roles.${item.roleKey}`) : null].filter(Boolean).join('\n');
  };

  /** Tab：指令名或目前資料夾裡的名字，唯一符合才補 */
  const complete = () => {
    const parts = input.split(/\s+/);
    const last = parts[parts.length - 1] ?? '';
    const pool = parts.length === 1 ? COMMANDS : parts[0] === 'cat' ? filesIn(cwd) : cwd === 'all' ? DIRS : ['..'];
    const hits = pool.filter((p) => p.startsWith(last));
    if (hits.length === 1) setInput([...parts.slice(0, -1), hits[0]].join(' ') + (parts.length === 1 ? ' ' : ''));
  };

  const submit = () => {
    const raw = input;
    setInput('');
    setHistPos(null);
    if (raw.trim() === 'clear') {
      setEntries([]);
      return;
    }
    if (raw.trim()) setHistory((h) => [...h, raw]);
    const path = pathOf(cwd);
    const out = run(raw);
    setEntries((list) => [...list, { id: nextIdRef.current++, cmd: raw, path, out }].slice(-MAX_ENTRIES));
  };

  return (
    <header className="setup-term">
      <div className="setup-term-bar">
        <span className="setup-term-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <h1 className="setup-term-title">
          {t('setup.heroTitle')}
          <span className="setup-term-title-sub">koimsurai@home-server: {pathOf(cwd)}</span>
        </h1>
      </div>
      {/* 點終端機任何地方都把焦點交給輸入列，跟真的終端機一樣。鍵盤使用者直接 Tab 到輸入列，這裡只是補滑鼠 */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="setup-term-body" ref={bodyRef} onClick={() => inputRef.current?.focus()}>
        <p className="setup-term-comment"># {t('setup.subtitle')}</p>
        <div aria-live="polite">
          {entries.map((e) => (
            <div key={e.id} className="setup-term-entry">
              <p className="setup-term-cmd">
                <span className="setup-term-prompt">{e.path} $</span> {e.cmd}
              </p>
              {e.out !== null && <div className="setup-term-out">{e.out}</div>}
            </div>
          ))}
        </div>
        <form
          className="setup-term-cmd setup-term-input-row"
          onSubmit={(ev) => {
            ev.preventDefault();
            submit();
          }}
        >
          <label htmlFor="setup-term-input" className="setup-term-prompt">
            {pathOf(cwd)} $
          </label>
          <input
            id="setup-term-input"
            ref={inputRef}
            className="setup-term-input"
            value={input}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label={t('setup.term.inputLabel')}
            onChange={(ev) => setInput(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Tab' && input) {
                ev.preventDefault();
                complete();
              } else if (ev.key === 'ArrowUp' && history.length) {
                ev.preventDefault();
                const pos = histPos === null ? history.length - 1 : Math.max(0, histPos - 1);
                setHistPos(pos);
                setInput(history[pos]);
              } else if (ev.key === 'ArrowDown' && histPos !== null) {
                ev.preventDefault();
                const pos = histPos + 1;
                setHistPos(pos >= history.length ? null : pos);
                setInput(pos >= history.length ? '' : history[pos]);
              }
            }}
          />
        </form>
      </div>
    </header>
  );
}
