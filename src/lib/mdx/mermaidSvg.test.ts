import { describe, expect, it } from 'vite-plus/test';
import { nodeRoles, renderMermaidSvg, roleOfColor } from './mermaidSvg';

describe('roleOfColor', () => {
  it('看色相歸類：綠成立、紅排除、黃橙重點、藍紫次要', () => {
    expect(roleOfColor('#bbf7d0')).toBe('ok');
    expect(roleOfColor('#82e0aa')).toBe('ok');
    expect(roleOfColor('#fecaca')).toBe('bad');
    expect(roleOfColor('#f8d7da')).toBe('bad');
    expect(roleOfColor('#fde68a')).toBe('mark');
    expect(roleOfColor('#ffcc00')).toBe('mark');
    expect(roleOfColor('#c7d2fe')).toBe('alt');
    expect(roleOfColor('#e9d5ff')).toBe('alt');
    expect(roleOfColor('#f9f')).toBe('alt');
  });

  it('灰階、色名、壞掉的寫法不歸類', () => {
    for (const c of ['#ffffff', '#333', '#888888', 'lightgreen', 'rgb(0,255,0)', '#12345', '']) {
      expect(roleOfColor(c), c).toBeNull();
    }
  });
});

describe('nodeRoles', () => {
  const svg = renderMermaidSvg(`flowchart LR
  A[好] --> B[壞] --> C[重點] --> D[次要] --> E[也是重點] --> F[沒標]
  classDef ok fill:#bbf7d0,stroke:#16a34a,color:#14532d
  classDef bad fill:#fecaca
  classDef hi fill:#fde68a
  class A ok
  class B bad
  class C,E hi
  style D fill:#c7d2fe`);

  const node = (id: string) => {
    const at = svg.indexOf(`data-id="${id}"`);
    return svg.slice(svg.lastIndexOf('<g class="pele-node', at), svg.indexOf('</g>', at));
  };

  it('節點掛上角色，作者原本的顏色拿掉', () => {
    expect(node('A')).toContain('mm-role-ok');
    expect(node('B')).toContain('mm-role-bad');
    expect(node('D')).toContain('mm-role-alt');
    expect(node('F')).not.toContain('mm-role-');
    expect(svg).not.toMatch(/#bbf7d0|#16a34a|#14532d|#fecaca|#fde68a|#c7d2fe/i);
  });

  it('重點只留第一個，而且帶一顆點；第二個當成「成立」', () => {
    expect(node('C')).toContain('mm-role-mark');
    expect(node('C')).toContain('mm-mark-dot');
    expect(node('E')).toContain('mm-role-ok');
    expect(svg.match(/mm-mark-dot/g)).toHaveLength(1);
  });

  it('沒有節點的 SVG 原樣回傳', () => {
    expect(nodeRoles('<svg><g class="x"></g></svg>')).toBe('<svg><g class="x"></g></svg>');
  });
});
