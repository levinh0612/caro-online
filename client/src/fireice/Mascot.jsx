import { useEffect, useRef } from 'react';
import { drawCharacter } from './render.js';

// Nhân vật Lửa / Băng động dùng cho menu và sảnh (cùng nét vẽ với trong game)
export default function Mascot({ kind, size = 72, face = 1, bob = true }) {
  const ref = useRef(null);
  const S = Math.round(size * 1.7);

  useEffect(() => {
    const canvas = ref.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = S * dpr;
    canvas.height = S * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const w = size * 0.7;
    const h = size * 0.9;
    let raf;
    const seed = kind === 'fire' ? 0.3 : 1.9;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const t = now / 1000;
      ctx.clearRect(0, 0, S, S);
      const hop = bob ? Math.abs(Math.sin(t * 2.2 + seed)) * size * 0.12 : 0;
      drawCharacter(ctx, kind, (S - w) / 2, S * 0.9 - h - hop, w, h, t, { face, seed, sy: 1 + (bob ? hop / size * 0.5 : 0) });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [kind, size, face, bob, S]);

  return <canvas ref={ref} style={{ width: S, height: S }} aria-hidden="true" />;
}
