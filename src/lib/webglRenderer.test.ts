import { describe, expect, it, vi } from 'vite-plus/test';
import { inspectWebGL } from './webglRenderer';

const UNMASKED = 0x9246;
const RENDERER = 0x1f01;

// 只做出 inspectWebGL 會碰到的那幾個方法
function fakeCanvas(opts: { webgl2?: boolean; webgl?: boolean; unmasked?: string | null; renderer?: string }) {
  const loseContext = vi.fn();
  const gl = {
    RENDERER,
    getExtension: (name: string) => {
      if (name === 'WEBGL_debug_renderer_info')
        return opts.unmasked === undefined ? null : { UNMASKED_RENDERER_WEBGL: UNMASKED };
      if (name === 'WEBGL_lose_context') return { loseContext };
      return null;
    },
    getParameter: (p: number) => (p === UNMASKED ? opts.unmasked : (opts.renderer ?? 'WebKit WebGL')),
  };
  const getContext = vi.fn((type: string) => {
    if (type === 'webgl2' && opts.webgl2) return gl;
    if (type === 'webgl' && opts.webgl) return gl;
    return null;
  });
  return { canvas: { getContext } as unknown as OffscreenCanvas, getContext, loseContext };
}

describe('inspectWebGL', () => {
  it('拿不到任何 context → none', () => {
    expect(inspectWebGL(fakeCanvas({}).canvas)).toBe('none');
  });

  it('webgl2 失敗時退回 webgl1', () => {
    const f = fakeCanvas({ webgl: true, unmasked: 'ANGLE (AMD Radeon 780M)' });
    expect(inspectWebGL(f.canvas)).toBe('hardware');
    expect(f.getContext.mock.calls.map((c) => c[0])).toEqual(['webgl2', 'webgl']);
  });

  it.each([
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))',
    'llvmpipe (LLVM 17.0.6, 256 bits)',
    'Microsoft Basic Render Driver',
  ])('軟體渲染 %s → software', (name) => {
    expect(inspectWebGL(fakeCanvas({ webgl2: true, unmasked: name }).canvas)).toBe('software');
  });

  it('debug 擴充被擋時看 RENDERER；認不出來就當硬體', () => {
    expect(inspectWebGL(fakeCanvas({ webgl2: true, renderer: 'WebKit WebGL' }).canvas)).toBe('hardware');
    expect(inspectWebGL(fakeCanvas({ webgl2: true, renderer: 'SwiftShader' }).canvas)).toBe('software');
  });

  it('UNMASKED 是空字串時退回 RENDERER', () => {
    expect(inspectWebGL(fakeCanvas({ webgl2: true, unmasked: '', renderer: 'llvmpipe' }).canvas)).toBe('software');
  });

  it('探完會釋放 context', () => {
    const f = fakeCanvas({ webgl2: true, unmasked: 'NVIDIA GeForce RTX 5060 Ti' });
    inspectWebGL(f.canvas);
    expect(f.loseContext).toHaveBeenCalledOnce();
  });
});
