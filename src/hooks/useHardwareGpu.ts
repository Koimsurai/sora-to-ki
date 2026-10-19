import { useEffect, useState } from 'react';
import { probeHardwareGpu } from '@/lib/webglSupport';

/** 非同步的 GPU 探測結果：null = 還在探測（含 SSR 與 hydration 那一輪），之後是 true / false。 */
export function useHardwareGpu(): boolean | null {
  const [hardware, setHardware] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void probeHardwareGpu().then((v) => {
      if (alive) setHardware(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return hardware;
}
