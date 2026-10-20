// 家裡的網路拓撲：路由器底下分成有線、5 GHz、2.4 GHz、IoT 2.4 GHz 四個網段，
// 每個網段一條匯流線、設備掛在上面；需要轉一手的（紅外線、射頻、門鈴）再往右接到最終裝置。
// 節點點下去會捲到下方對應的設備卡。
//
// 座標不是手寫的，由 GROUPS 依版面算出來：寬版四個網段並排成四欄，窄版由上往下疊。
// 兩張 SVG 在 SSR 時都輸出、由 CSS 依寬度只顯示一張——用 JS 判斷寬度的話，hydrate 後才換版面，
// 會先閃一次桌機版。
//
// ⚠ 網段只寫頻段與用途，不寫家裡真正的 SSID 名稱：公開網頁沒必要露出 Wi-Fi 名稱。
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Layout = 'wide' | 'tall';
type NodeKind = 'cloud' | 'core' | 'net' | 'device' | 'endpoint';
type LinkKind = 'wired' | 'wifi' | 'matter' | 'air';

interface Label {
  /** 產品名直接寫 */
  text?: string;
  /** 不是產品的（網際網路、冷氣）用 setup.topo.* 翻譯 */
  key?: string;
}

interface TopoDevice {
  id: string;
  name: Label;
  sub?: Label;
  /** 點了要捲到的錨點（卡片或分類） */
  target?: string;
  /** 再轉一手才到的最終裝置：冷氣、吸頂燈、門鈴 */
  end?: { id: string; name: Label; kind: LinkKind; label?: string };
}

interface TopoGroup {
  id: string;
  name: Label;
  sub: Label;
  link: LinkKind;
  /** 寬版這一欄的寬度：有最終裝置掛在右邊的欄要寬一點 */
  width: number;
  devices: TopoDevice[];
  /** 窄版的排列順序（預設同 devices）。見 MATTER 的說明 */
  tallOrder?: string[];
}

const GROUPS: TopoGroup[] = [
  {
    id: 'wired',
    name: { key: 'netWired' },
    sub: { text: 'Ethernet' },
    link: 'wired',
    width: 190,
    devices: [
      { id: 'switch', name: { text: 'QG-U1050' }, sub: { key: 'switch' }, target: 'gear-qg-u1050' },
      { id: 'server', name: { text: 'Home Server' }, sub: { text: 'Home Assistant' }, target: 'gear-cat-server' },
      { id: 'nanokvm', name: { text: 'NanoKVM' }, sub: { text: 'PCIe IP-KVM' }, target: 'gear-nanokvm-pcie' },
    ],
  },
  {
    id: 'wifi5',
    name: { text: 'Wi-Fi 5 GHz' },
    sub: { key: 'netMain' },
    link: 'wifi',
    width: 190,
    devices: [
      { id: 'rig', name: { text: 'The White Build' }, sub: { key: 'rig' }, target: 'gear-cat-main-rig' },
      { id: 'mobile', name: { text: 'Pixel 8 Pro · Blade 14' }, sub: { key: 'mobile' }, target: 'gear-pixel-8-pro' },
    ],
  },
  {
    id: 'wifi24',
    name: { text: 'Wi-Fi 2.4 GHz' },
    sub: { key: 'netMain' },
    link: 'wifi',
    width: 300,
    devices: [
      {
        id: 'gtv',
        name: { text: 'Google TV Streamer' },
        sub: { key: 'matterHub' },
        target: 'gear-google-tv-streamer',
      },
      {
        id: 'h200',
        name: { text: 'Tapo H200' },
        sub: { key: 'doorbellHub' },
        target: 'gear-tapo-d230s1',
        end: { id: 'doorbell', name: { key: 'doorbell' }, kind: 'air' },
      },
    ],
    tallOrder: ['h200', 'gtv'],
  },
  {
    id: 'iot',
    name: { text: 'IoT 2.4 GHz' },
    sub: { key: 'netIot' },
    link: 'wifi',
    width: 320,
    devices: [
      { id: 'hub3', name: { text: 'SwitchBot Hub 3' }, sub: { key: 'sensors' }, target: 'gear-switchbot-hub3' },
      {
        id: 'rm4',
        name: { text: 'BroadLink RM4 Pro' },
        sub: { key: 'irBlaster' },
        target: 'gear-rm4-pro',
        end: { id: 'ac', name: { key: 'ac' }, kind: 'air', label: 'IR' },
      },
      {
        id: 'esp32',
        name: { text: 'ESP32-C3 + CC1101' },
        sub: { key: 'rfBlaster' },
        target: 'gear-esp32-cc1101',
        end: { id: 'light', name: { key: 'light' }, kind: 'air', label: '433MHz' },
      },
      { id: 'appliances', name: { key: 'appliances' }, sub: { key: 'appliancesSub' }, target: 'gear-appliances' },
    ],
  },
];

/**
 * Hub 3 把感測器透過 Matter 交給 Google TV Streamer。兩者在不同網段，所以排列時讓它們相鄰：
 * 寬版都排在各自那欄的第一個（同一列，一條橫線就連得到）；窄版 GTV 排在 2.4 GHz 的最後、
 * Hub 3 是 IoT 的第一個，中間只隔著 IoT 的網段標籤，弧線從右側繞過去。
 */
const MATTER = { from: 'gtv', to: 'hub3' } as const;

const SIZE: Record<NodeKind, { w: number; h: number }> = {
  cloud: { w: 120, h: 34 },
  core: { w: 150, h: 52 },
  net: { w: 140, h: 40 },
  device: { w: 148, h: 50 },
  endpoint: { w: 84, h: 34 },
};

/** 設備與右邊最終裝置之間的距離：要放得下線上的「433MHz」標籤 */
const END_GAP = 46;

interface PlacedNode {
  id: string;
  kind: NodeKind;
  name: Label;
  sub?: Label;
  target?: string;
  x: number;
  y: number;
}
interface PlacedLink {
  key: string;
  kind: LinkKind | 'trunk';
  d: string;
  label?: { text: string; x: number; y: number };
  /** 這條線碰到哪些節點：滑到節點上時亮起來 */
  touches: string[];
}
interface Plan {
  w: number;
  h: number;
  nodes: PlacedNode[];
  links: PlacedLink[];
}

const box = (n: PlacedNode) => {
  const s = SIZE[n.kind];
  return { l: n.x - s.w / 2, r: n.x + s.w / 2, t: n.y - s.h / 2, b: n.y + s.h / 2 };
};

/** 設備在網段匯流線上的位置，以及掛在右邊的最終裝置 */
function placeDevices(
  g: TopoGroup,
  order: TopoDevice[],
  busX: number,
  left: number,
  firstY: number,
  step: number,
  nodes: PlacedNode[],
  links: PlacedLink[],
): number {
  let y = firstY;
  for (const dev of order) {
    const node: PlacedNode = {
      id: dev.id,
      kind: 'device',
      name: dev.name,
      sub: dev.sub,
      target: dev.target,
      x: left + SIZE.device.w / 2,
      y,
    };
    nodes.push(node);
    links.push({ key: `${g.id}-${dev.id}`, kind: g.link, d: `M${busX},${y} L${left},${y}`, touches: [g.id, dev.id] });
    if (dev.end) {
      const ex = box(node).r + END_GAP + SIZE.endpoint.w / 2;
      nodes.push({ id: dev.end.id, kind: 'endpoint', name: dev.end.name, x: ex, y });
      const x1 = box(node).r;
      const x2 = ex - SIZE.endpoint.w / 2;
      links.push({
        key: `${dev.id}-${dev.end.id}`,
        kind: dev.end.kind,
        d: `M${x1},${y} L${x2},${y}`,
        label: dev.end.label ? { text: dev.end.label, x: (x1 + x2) / 2, y: y - 8 } : undefined,
        touches: [dev.id, dev.end.id],
      });
    }
    y += step;
  }
  return y - step;
}

function ordered(g: TopoGroup, layout: Layout): TopoDevice[] {
  if (layout === 'wide' || !g.tallOrder) return g.devices;
  const byId = new Map(g.devices.map((d) => [d.id, d]));
  return g.tallOrder.map((id) => byId.get(id)).filter((d): d is TopoDevice => d !== undefined);
}

function planWide(): Plan {
  const nodes: PlacedNode[] = [];
  const links: PlacedLink[] = [];
  const W = GROUPS.reduce((s, g) => s + g.width, 0);
  const internet: PlacedNode = { id: 'internet', kind: 'cloud', name: { key: 'internet' }, x: W / 2, y: 28 };
  const router: PlacedNode = {
    id: 'router',
    kind: 'core',
    name: { text: 'ZenWiFi BD5' },
    sub: { text: 'WiFi 7 Mesh' },
    target: 'gear-zenwifi-bd5',
    x: W / 2,
    y: 104,
  };
  nodes.push(internet, router);
  links.push({
    key: 'wan',
    kind: 'wired',
    d: `M${W / 2},${box(internet).b} L${W / 2},${box(router).t}`,
    touches: ['internet', 'router'],
  });

  let x0 = 0;
  let maxY = 0;
  for (const g of GROUPS) {
    const pill: PlacedNode = { id: g.id, kind: 'net', name: g.name, sub: g.sub, x: x0 + 75, y: 196 };
    nodes.push(pill);
    // 路由器下緣的出發點往網段那側偏：四條線不會全擠在同一個點
    const sx = router.x + Math.max(-60, Math.min(60, (pill.x - router.x) * 0.15));
    const sy = box(router).b;
    const ty = box(pill).t;
    const my = (sy + ty) / 2;
    links.push({
      key: `router-${g.id}`,
      kind: g.link,
      d: `M${sx},${sy} C${sx},${my} ${pill.x},${my} ${pill.x},${ty}`,
      touches: ['router', g.id],
    });
    const busX = x0 + 18;
    const lastY = placeDevices(g, ordered(g, 'wide'), busX, x0 + 36, 270, 66, nodes, links);
    links.push({ key: `bus-${g.id}`, kind: g.link, d: `M${busX},${box(pill).b} L${busX},${lastY}`, touches: [g.id] });
    maxY = Math.max(maxY, lastY);
    x0 += g.width;
  }

  // Matter：兩者在同一列，直線從 GTV 右緣接到 Hub 3 左緣
  const a = nodes.find((n) => n.id === MATTER.from);
  const b = nodes.find((n) => n.id === MATTER.to);
  if (a && b) {
    const x1 = box(a).r;
    const x2 = box(b).l;
    links.push({
      key: 'matter',
      kind: 'matter',
      d: `M${x1},${a.y} L${x2},${b.y}`,
      label: { text: 'Matter', x: (x1 + x2) / 2, y: a.y - 8 },
      touches: [a.id, b.id],
    });
  }
  return { w: W, h: maxY + 40, nodes, links };
}

function planTall(): Plan {
  const nodes: PlacedNode[] = [];
  const links: PlacedLink[] = [];
  const W = 372;
  const TRUNK = 40;
  const internet: PlacedNode = { id: 'internet', kind: 'cloud', name: { key: 'internet' }, x: 110, y: 24 };
  const router: PlacedNode = {
    id: 'router',
    kind: 'core',
    name: { text: 'ZenWiFi BD5' },
    sub: { text: 'WiFi 7 Mesh' },
    target: 'gear-zenwifi-bd5',
    x: 110,
    y: 96,
  };
  nodes.push(internet, router);
  links.push({
    key: 'wan',
    kind: 'wired',
    d: `M110,${box(internet).b} L110,${box(router).t}`,
    touches: ['internet', 'router'],
  });

  let y = 186;
  let lastPillY = y;
  for (const g of GROUPS) {
    const pill: PlacedNode = { id: g.id, kind: 'net', name: g.name, sub: g.sub, x: 56 + SIZE.net.w / 2, y };
    nodes.push(pill);
    lastPillY = y;
    links.push({
      key: `router-${g.id}`,
      kind: g.link,
      d: `M${TRUNK},${y} L${box(pill).l},${y}`,
      touches: ['router', g.id],
    });
    const busX = 72;
    const lastY = placeDevices(g, ordered(g, 'tall'), busX, 88, y + 60, 60, nodes, links);
    links.push({ key: `bus-${g.id}`, kind: g.link, d: `M${busX},${box(pill).b} L${busX},${lastY}`, touches: [g.id] });
    y = lastY + 74;
  }
  // 主幹：路由器往下接到每個網段，是共用的，不分有線無線
  links.unshift({
    key: 'trunk',
    kind: 'trunk',
    d: `M${TRUNK},${box(router).b} L${TRUNK},${lastPillY}`,
    touches: ['router'],
  });

  // Matter：GTV 與 Hub 3 上下相鄰，從右側繞一個弧
  const a = nodes.find((n) => n.id === MATTER.from);
  const b = nodes.find((n) => n.id === MATTER.to);
  if (a && b) {
    const x = box(a).r;
    const bulge = x + 70;
    links.push({
      key: 'matter',
      kind: 'matter',
      d: `M${x},${a.y} C${bulge},${a.y} ${bulge},${b.y} ${x},${b.y}`,
      label: { text: 'Matter', x: x + 52, y: (a.y + b.y) / 2 + 4 },
      touches: [a.id, b.id],
    });
  }
  return { w: W, h: y - 74 + 40, nodes, links };
}

const PLANS: Record<Layout, Plan> = { wide: planWide(), tall: planTall() };

interface Props {
  /** 點了節點：交給頁面處理（切回「全部」、捲過去、閃一下） */
  onNavigate: (anchor: string) => void;
}

function TopologySvg({ layout, onNavigate }: Props & { layout: Layout }) {
  const { t } = useTranslation();
  const [hot, setHot] = useState<string | null>(null);
  const plan = PLANS[layout];
  const text = (l?: Label) => (l ? (l.text ?? t(`setup.topo.${l.key ?? ''}`)) : '');

  return (
    <svg
      className={`setup-topo-svg setup-topo-${layout}`}
      viewBox={`0 0 ${plan.w} ${plan.h}`}
      data-hot={hot ?? undefined}
    >
      <g className="setup-topo-links">
        {plan.links.map((l) => (
          <g
            key={l.key}
            className={`setup-topo-link is-${l.kind}${hot !== null && l.touches.includes(hot) ? ' is-hot' : ''}`}
          >
            <path className="setup-topo-line" d={l.d} />
            {/* 流動的光點：一條同路徑、只有短虛線的覆蓋層在跑 dashoffset */}
            {l.kind !== 'trunk' && <path className="setup-topo-flow" d={l.d} />}
            {l.label && (
              <text className="setup-topo-link-label" x={l.label.x} y={l.label.y}>
                {l.label.text}
              </text>
            )}
          </g>
        ))}
      </g>
      {plan.nodes.map((n) => {
        const s = SIZE[n.kind];
        const b = box(n);
        const sub = text(n.sub);
        const rounded = n.kind === 'cloud' || n.kind === 'endpoint' || n.kind === 'net';
        const body = (
          <>
            <rect className="setup-topo-box" x={b.l} y={b.t} width={s.w} height={s.h} rx={rounded ? s.h / 2 : 10} />
            <text className="setup-topo-name" x={n.x} y={sub ? n.y - 3 : n.y + 4}>
              {text(n.name)}
            </text>
            {sub && (
              <text className="setup-topo-sub" x={n.x} y={n.y + (n.kind === 'net' ? 11 : 14)}>
                {sub}
              </text>
            )}
          </>
        );
        const common = {
          className: `setup-topo-node is-${n.kind}${hot === n.id ? ' is-hot' : ''}`,
          onMouseEnter: () => setHot(n.id),
          onMouseLeave: () => setHot(null),
        };
        if (!n.target) {
          return (
            <g key={n.id} {...common}>
              {body}
            </g>
          );
        }
        const target = n.target;
        return (
          <a
            key={n.id}
            {...common}
            href={`#${target}`}
            aria-label={`${text(n.name)}${sub ? ` — ${sub}` : ''}`}
            onFocus={() => setHot(n.id)}
            onBlur={() => setHot(null)}
            onClick={(e) => {
              e.preventDefault();
              onNavigate(target);
            }}
          >
            {body}
          </a>
        );
      })}
    </svg>
  );
}

export default function SetupTopology({ onNavigate }: Props) {
  const { t } = useTranslation();
  const legend: LinkKind[] = ['wired', 'wifi', 'matter', 'air'];
  return (
    <section className="setup-topo" aria-labelledby="setup-topo-title">
      <div className="setup-topo-head">
        <h2 id="setup-topo-title" className="setup-topo-title">
          {t('setup.topo.title')}
        </h2>
        <p className="setup-topo-hint">{t('setup.topo.hint')}</p>
      </div>
      <TopologySvg layout="wide" onNavigate={onNavigate} />
      <TopologySvg layout="tall" onNavigate={onNavigate} />
      <ul className="setup-topo-legend">
        {legend.map((kind) => (
          <li key={kind} className={`is-${kind}`}>
            <svg width="28" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="28" y2="4" />
            </svg>
            {t(`setup.topo.legend.${kind}`)}
          </li>
        ))}
      </ul>
    </section>
  );
}
