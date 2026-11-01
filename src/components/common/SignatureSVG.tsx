import { useEffect, useRef } from 'react';
import type { Signature } from '@koimsurai/api-types';
import './SignatureSVG.css';

interface SignatureSVGProps {
  /** 站長的簽名（站台設定）：一串筆畫與點，照寫的順序排（後端 handlers/signature.rs） */
  signature: Signature;
  className?: string;
}

/** 筆尖每毫秒走幾個 viewBox 單位（整個簽名約兩秒半寫完） */
const SPEED = 2.6;
/** 提筆換到下一筆、點一個點各花多久 */
const HOP_MS = 140;
const TAP_MS = 90;
/** 寫完後筆尖停在尾端多久、再花多久淡掉 */
const REST_MS = 500;
const FADE_MS = 700;

type Step =
  | { kind: 'stroke'; path: SVGPathElement; length: number; ms: number }
  | { kind: 'hop'; from: DOMPoint; to: DOMPoint; ms: number }
  | { kind: 'tap'; dot: SVGCircleElement; ms: number };

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * 文末簽名。捲進畫面時由一顆琥珀小點當筆尖照筆順寫一遍，
 * 寫完停在最後一筆的尾端、慢慢淡掉；只寫一次，不循環。
 */
const SignatureSVG = ({ signature, className }: SignatureSVGProps) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // 筆畫與點照寫的順序排在 DOM 裡（下面 render 的順序就是 signature.steps 的順序）
    const marks = [...svg.querySelectorAll<SVGPathElement | SVGCircleElement>('.signature-mark')];
    // 看標籤名而不是 instanceof：沒有 SVG DOM 的環境（測試）連 SVGPathElement 這個名字都沒有
    const isPath = (m: Element): m is SVGPathElement => m.tagName.toLowerCase() === 'path';
    const strokes = marks.filter(isPath);
    const pen = svg.querySelector<SVGGElement>('.signature-pen');
    if (!pen || strokes.length === 0) return;

    // 減少動態，或環境量不出路徑長度（沒有 SVG 幾何的測試環境）：直接顯示寫好的樣子
    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      strokes.some((p) => typeof p.getTotalLength !== 'function')
    ) {
      svg.classList.add('is-written');
      return;
    }

    for (const p of strokes) {
      const length = p.getTotalLength();
      p.style.strokeDasharray = `${length}`;
      p.style.strokeDashoffset = `${length}`;
    }

    // 把筆順攤成一串步驟：寫一筆 → 提筆移到下一個起點 → …
    const steps: Step[] = [];
    // `as`：兩個都在下面的 hopTo 裡改，TS 追不到閉包裡的指派，不寫的話會把它們窄化成永遠是 null
    let at = null as DOMPoint | null;
    let first = null as DOMPoint | null;
    const hopTo = (to: DOMPoint) => {
      first ??= to;
      if (at) steps.push({ kind: 'hop', from: at, to, ms: HOP_MS });
      at = to;
    };
    // 分兩支用標籤名判斷再轉型：TS 眼裡 path 與 circle 長得一樣（都是 SVGGeometryElement），型別守衛分不開
    for (const mark of marks) {
      if (isPath(mark)) {
        const length = mark.getTotalLength();
        hopTo(mark.getPointAtLength(0));
        steps.push({ kind: 'stroke', path: mark, length, ms: length / SPEED });
        at = mark.getPointAtLength(length);
      } else {
        const dot = mark as unknown as SVGCircleElement;
        hopTo(new DOMPoint(Number(dot.getAttribute('cx')), Number(dot.getAttribute('cy'))));
        steps.push({ kind: 'tap', dot, ms: TAP_MS });
      }
    }
    // 寫完停在最後一步的位置
    const end: DOMPoint = at ?? new DOMPoint();
    const start: DOMPoint = first ?? end;
    const total = steps.reduce((sum, s) => sum + s.ms, 0);

    const place = (x: number, y: number) => pen.setAttribute('transform', `translate(${x} ${y})`);

    let raf = 0;
    let began = 0;
    const frame = (now: number) => {
      if (!began) began = now;
      let left = now - began;
      for (const step of steps) {
        const t = Math.min(1, Math.max(0, left / step.ms));
        if (step.kind === 'stroke') {
          const drawn = step.length * ease(t);
          step.path.style.strokeDashoffset = `${step.length - drawn}`;
          if (left >= 0 && left < step.ms) {
            const p = step.path.getPointAtLength(drawn);
            place(p.x, p.y);
          }
        } else if (step.kind === 'hop') {
          if (left >= 0 && left < step.ms) {
            const e = ease(t);
            place(step.from.x + (step.to.x - step.from.x) * e, step.from.y + (step.to.y - step.from.y) * e);
          }
        } else if (left >= 0) {
          step.dot.classList.add('is-on');
        }
        left -= step.ms;
      }
      const after = now - began - total;
      if (after >= 0) {
        place(end.x, end.y);
        pen.style.opacity = `${1 - Math.min(1, Math.max(0, (after - REST_MS) / FADE_MS))}`;
        if (after >= REST_MS + FADE_MS) {
          svg.classList.add('is-written');
          return;
        }
      }
      raf = requestAnimationFrame(frame);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        place(start.x, start.y);
        pen.style.opacity = '1';
        raf = requestAnimationFrame(frame);
      },
      { threshold: 0.6 },
    );
    io.observe(svg);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [signature]);

  return (
    <div className={`signature-svg-container ${className ?? ''}`}>
      <svg ref={svgRef} viewBox={signature.view_box} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        {signature.steps.map((s, i) =>
          s.kind === 'stroke' ? (
            // eslint-disable-next-line @eslint-react/no-array-index-key -- 筆畫沒有自己的 id，順序就是身分
            <path key={i} className="signature-mark signature-path" d={s.d} />
          ) : (
            // eslint-disable-next-line @eslint-react/no-array-index-key -- 同上
            <circle key={i} className="signature-mark signature-dot" cx={s.x ?? 0} cy={s.y ?? 0} r="7" />
          ),
        )}
        <g className="signature-pen">
          <circle className="signature-pen-glow" r="34" />
          <circle className="signature-pen-tip" r="11" />
        </g>
      </svg>
    </div>
  );
};

export default SignatureSVG;
