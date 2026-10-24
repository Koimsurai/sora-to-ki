import { useEffect, useRef } from 'react';
import './SignatureSVG.css';

interface SignatureSVGProps {
  className?: string;
}

// 筆畫照手寫的順序：K、整個字、回頭點兩個 i 的點、最後一道底線
const K =
  'M1.61154 67.0018C-2.38846 45.3351 2.21154 1.70177 52.6115 0.501767C61.1115 0.3351 78.6115 11.9018 80.6115 59.5018C83.1115 119.002 51.1115 201.502 28.1115 214.502';
const WORD =
  'M169.612 41.0018C140.278 53.6684 83.8115 91.1018 92.6115 139.502C92.2782 149.502 105.812 171.902 162.612 181.502C219.412 191.102 229.945 157.502 228.112 139.502C222.612 119.835 204.612 91.7018 176.612 136.502C169.612 153.002 162.412 185.702 189.612 184.502C216.812 183.302 225.278 159.668 226.112 148.002C227.112 143.168 227.612 131.202 221.612 122.002C214.612 125.835 201.112 138.502 203.112 158.502C205.112 178.502 214.945 184.835 219.612 185.502C223.112 186.002 230.912 185.602 234.112 180.002C253.778 162.002 291.912 124.602 287.112 119.002C286.612 117.668 285.012 115.702 282.612 118.502C279.612 122.002 272.612 183.002 281.612 185.502C288.812 187.502 301.945 167.668 307.612 157.502C318.778 139.668 342.312 105.802 347.112 113.002C353.112 122.002 353.612 144.502 330.612 196.502C329.612 197.502 328.112 198.302 330.112 193.502C332.612 187.502 348.612 130.002 383.612 122.502C385.278 122.168 388.612 122.102 388.612 124.502C387.612 141.668 384.012 178.202 377.612 187.002C371.212 195.802 374.945 186.002 377.612 180.002C388.778 160.002 415.412 120.902 432.612 124.502C433.445 124.668 435.112 125.302 435.112 126.502C435.112 127.702 435.778 166.668 436.112 186.002C436.112 187.002 436.412 188.802 437.612 188.002C438.812 187.202 468.778 164.335 483.612 153.002C487.612 149.502 499.412 141.302 514.612 136.502L579.612 103.502C571.278 107.502 553.112 122.002 547.112 148.002C547.612 158.668 545.912 180.802 535.112 184.002C528.445 185.835 508.512 180.902 482.112 146.502C481.469 145.664 479.612 145.502 480.612 148.502C488.945 162.668 512.712 192.502 541.112 198.502C556.278 198.002 592.911 190.202 618.112 163.002C625.267 155.279 642.612 137.502 646.612 122.502C647.112 119.002 643.414 114.002 642.112 122.002C638.612 143.502 635.111 187.802 649.112 193.002C649.778 193.168 651.511 193.402 653.112 193.002C655.112 192.502 674.611 183.002 700.112 123.002C700.778 120.835 698.112 116.002 696.112 121.002C692.778 142.335 691.111 186.202 711.112 191.002C718.778 193.502 737.911 195.302 753.112 182.502C772.112 166.502 788.111 152.002 789.612 134.002C788.778 126.502 784.211 111.202 772.612 110.002C767.112 109.002 751.826 129.702 750.612 154.502C750.112 162.335 750.611 177.302 756.612 174.502C762.612 171.702 785.778 144.668 796.612 131.502C804.778 127.002 822.911 119.102 830.112 123.502C837.312 127.902 813.778 170.002 801.112 190.502C799.612 192.002 802.911 198.802 812.112 194.002C827.945 190.002 864.211 180.002 882.612 172.002C901.012 164.002 912.612 144.002 916.112 135.002C918.612 124.835 917.112 104.002 897.612 106.002C885.112 110.502 854.311 145.102 855.112 173.502C855.612 183.002 853.111 198.102 865.112 186.502C867.612 184.502 882.112 177.502 908.612 152.002C910.112 151.002 905.311 142.102 904.112 150.502C904.278 157.002 907.511 173.302 919.112 186.502C920.945 188.335 926.211 190.102 932.612 182.502C940.612 173.002 940.611 179.502 997.612 113.502C999.112 112.002 996.211 105.502 992.612 113.502C989.278 141.168 983.112 183.002 991.612 192.502C995.112 195.502 1004.21 199.602 1012.61 196.002C1022.11 193.002 1039.61 182.002 1033.61 162.002';
const UNDERLINE = 'M -10 240 Q 500 270 1060 220';
const DOTS = [
  { x: 283, y: 78 },
  { x: 997, y: 76 },
] as const;

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
 * 寫完停在底線尾端、慢慢淡掉；只寫一次，不循環。
 */
const SignatureSVG = ({ className }: SignatureSVGProps) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const strokes = [...svg.querySelectorAll<SVGPathElement>('.signature-path')];
    const dots = [...svg.querySelectorAll<SVGCircleElement>('.signature-dot')];
    const pen = svg.querySelector<SVGGElement>('.signature-pen');
    if (!pen) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      svg.classList.add('is-written');
      return;
    }

    const lengths = strokes.map((p) => p.getTotalLength());
    for (const [i, p] of strokes.entries()) {
      p.style.strokeDasharray = `${lengths[i]}`;
      p.style.strokeDashoffset = `${lengths[i]}`;
    }

    // 把筆順攤成一串步驟：寫一筆 → 提筆移到下一個起點 → …
    const steps: Step[] = [];
    let at: DOMPoint | null = null;
    const hopTo = (to: DOMPoint) => {
      if (at) steps.push({ kind: 'hop', from: at, to, ms: HOP_MS });
      at = to;
    };
    const [k, word, underline] = strokes;
    for (const path of [k, word]) {
      const length = path.getTotalLength();
      hopTo(path.getPointAtLength(0));
      steps.push({ kind: 'stroke', path, length, ms: length / SPEED });
      at = path.getPointAtLength(length);
    }
    for (const [i, dot] of dots.entries()) {
      hopTo(new DOMPoint(DOTS[i].x, DOTS[i].y));
      steps.push({ kind: 'tap', dot, ms: TAP_MS });
    }
    const lineLength = underline.getTotalLength();
    hopTo(underline.getPointAtLength(0));
    steps.push({ kind: 'stroke', path: underline, length: lineLength, ms: lineLength / SPEED });
    const end = underline.getPointAtLength(lineLength);
    const total = steps.reduce((sum, s) => sum + s.ms, 0);

    const place = (x: number, y: number) => pen.setAttribute('transform', `translate(${x} ${y})`);

    let raf = 0;
    let start = 0;
    const frame = (now: number) => {
      if (!start) start = now;
      let left = now - start;
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
      const after = now - start - total;
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
        const first = k.getPointAtLength(0);
        place(first.x, first.y);
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
  }, []);

  return (
    <div className={`signature-svg-container ${className ?? ''}`}>
      <svg ref={svgRef} viewBox="-20 -20 1100 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path className="signature-path" d={K} />
        <path className="signature-path" d={WORD} />
        <path className="signature-path" d={UNDERLINE} />
        {DOTS.map((d) => (
          <circle key={d.x} className="signature-dot" cx={d.x} cy={d.y} r="7" />
        ))}
        <g className="signature-pen">
          <circle className="signature-pen-glow" r="34" />
          <circle className="signature-pen-tip" r="11" />
        </g>
      </svg>
    </div>
  );
};

export default SignatureSVG;
