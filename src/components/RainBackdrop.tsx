import { useEffect, useRef, useState } from 'react';

interface RainBackdropProps {
  variant?: 'ambient' | 'player' | 'subtle';
  hidden?: boolean;
  thunderActive?: boolean;
  className?: string;
}

interface Drop {
  x: number;
  y: number;
  len: number;
  vy: number;
  vx: number;
  alpha: number;
  width: number;
  depth: number;
}

interface Splash {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

export function RainBackdrop({
  variant = 'ambient',
  hidden = false,
  thunderActive = false,
  className = '',
}: RainBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const thunderGlowRef = useRef(0);
  const [thunderOpacity, setThunderOpacity] = useState(0);
  const [thunderOriginX, setThunderOriginX] = useState(62);

  // Slideshow Thunder effect: briefly spikes the opacity of the ambient radial gradients at random intervals
  useEffect(() => {
    if (!thunderActive || hidden) {
      thunderGlowRef.current = 0;
      setThunderOpacity(0);
      return;
    }

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    let cancelled = false;
    const timers: number[] = [];

    const scheduleStep = (fn: () => void, delayMs: number) => {
      const id = window.setTimeout(() => {
        if (!cancelled) fn();
      }, delayMs);
      timers.push(id);
    };

    const triggerThunderStrike = () => {
      if (cancelled) return;
      const peak = 0.68 + Math.random() * 0.28;
      const echo = peak * (0.55 + Math.random() * 0.25);
      setThunderOriginX(Math.round(22 + Math.random() * 58));

      // Primary lightning surge
      thunderGlowRef.current = peak;
      setThunderOpacity(peak);

      // Brief dip between double-flicker
      scheduleStep(() => {
        thunderGlowRef.current = 0.16;
        setThunderOpacity(0.16);
      }, 95);

      // Secondary rumble echo
      scheduleStep(() => {
        thunderGlowRef.current = echo;
        setThunderOpacity(echo);
      }, 175);

      // Smooth fade back to ambient darkness
      scheduleStep(() => {
        thunderGlowRef.current = 0;
        setThunderOpacity(0);
      }, 285);

      // Next random thunder interval (3.2s - 8.4s)
      const nextDelay = 3200 + Math.random() * 5200;
      scheduleStep(triggerThunderStrike, nextDelay);
    };

    // Initial thunder strike shortly after slideshow begins (1.2s - 2.6s)
    const firstDelay = 1200 + Math.random() * 1400;
    scheduleStep(triggerThunderStrike, firstDelay);

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      thunderGlowRef.current = 0;
    };
  }, [hidden, thunderActive]);

  useEffect(() => {
    if (hidden) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let rafId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const density = variant === 'player' ? 110 : variant === 'subtle' ? 55 : 135;
    const baseAlpha = variant === 'player' ? 0.34 : variant === 'subtle' ? 0.18 : 0.3;
    const drops: Drop[] = [];
    const splashes: Splash[] = [];

    const makeDrop = (randomY: boolean): Drop => {
      const depth = Math.random(); // 0 = distant mist, 1 = foreground streak
      const speedScale = 0.55 + depth * 0.95;
      return {
        x: Math.random() * (width + 180) - 90,
        y: randomY ? Math.random() * height : -20 - Math.random() * 140,
        len: (10 + depth * 24) * (variant === 'subtle' ? 0.8 : 1),
        vy: (560 + depth * 640) * speedScale,
        vx: (-65 - depth * 55) * speedScale,
        alpha: (0.07 + depth * 0.22) * (baseAlpha / 0.3),
        width: 0.6 + depth * 0.95,
        depth,
      };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width || window.innerWidth);
      height = Math.max(1, rect.height || window.innerHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const targetCount = Math.max(
        32,
        Math.round((density * Math.max(width, 640)) / 1280)
      );
      drops.length = 0;
      for (let i = 0; i < targetCount; i++) {
        drops.push(makeDrop(true));
      }
    };

    resize();
    window.addEventListener('resize', resize);

    const drawStaticFrame = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = 'round';
      for (const d of drops) {
        ctx.strokeStyle = `rgba(186, 198, 214, ${d.alpha * 0.7})`;
        ctx.lineWidth = d.width;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.vx * 0.025, d.y + d.len);
        ctx.stroke();
      }
    };

    if (reducedMotion) {
      drawStaticFrame();
      return () => window.removeEventListener('resize', resize);
    }

    let lastTime = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      ctx.clearRect(0, 0, width, height);

      const thunderBoost = thunderGlowRef.current * 0.28;

      ctx.lineCap = 'round';
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        d.x += d.vx * dt;
        d.y += d.vy * dt;

        const streakDx = (d.vx / d.vy) * d.len;
        const dropAlpha = Math.min(0.65, d.alpha + thunderBoost * d.depth);
        ctx.strokeStyle =
          d.depth > 0.82
            ? `rgba(222, 228, 238, ${dropAlpha})`
            : `rgba(168, 184, 204, ${dropAlpha})`;
        ctx.lineWidth = d.width;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + streakDx, d.y + d.len);
        ctx.stroke();

        if (d.y > height + 24 || d.x < -120) {
          if (d.depth > 0.68 && splashes.length < 24 && Math.random() < 0.35) {
            splashes.push({
              x: Math.max(12, Math.min(width - 12, d.x)),
              y: height - 6 - Math.random() * 14,
              radius: 1.5,
              maxRadius: 6 + Math.random() * 7,
              alpha: 0.24,
            });
          }
          const refreshed = makeDrop(false);
          drops[i] = refreshed;
        }
      }

      // Ground rain ripples along the bottom horizon
      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i];
        s.radius += 26 * dt;
        s.alpha -= 0.42 * dt;
        if (s.alpha <= 0 || s.radius >= s.maxRadius) {
          splashes.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(196, 206, 220, ${Math.min(0.55, s.alpha + thunderBoost * 0.5)})`;
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.radius, s.radius * 0.28, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [hidden, variant]);

  if (hidden) return null;

  const baseGradientOpacity = Math.min(1, 0.58 + thunderOpacity * 0.42);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none overflow-hidden select-none ${className}`}
    >
      {/* Base Ambient Radial Gradients (briefly intensify in opacity during slideshow Thunder) */}
      <div
        className="absolute inset-0"
        style={{
          opacity: baseGradientOpacity,
          transition:
            thunderOpacity > 0
              ? 'opacity 75ms ease-out'
              : 'opacity 480ms cubic-bezier(0.16, 1, 0.3, 1)',
          background:
            variant === 'player'
              ? 'radial-gradient(62% 45% at 50% 8%, rgba(74, 92, 124, 0.34), transparent 68%), radial-gradient(48% 36% at 15% 88%, rgba(162, 122, 64, 0.16), transparent 70%), radial-gradient(circle at 50% 45%, transparent 35%, rgba(4, 5, 8, 0.72) 100%)'
              : 'radial-gradient(65% 45% at 50% 0%, rgba(68, 84, 112, 0.3), transparent 65%), radial-gradient(45% 35% at 14% 92%, rgba(138, 102, 50, 0.16), transparent 68%), radial-gradient(circle at 50% 50%, transparent 45%, rgba(4, 5, 8, 0.58) 100%)',
        }}
      />

      {/* Thunder Surge Ambient Radial Gradients Layer (active during slideshow mode) */}
      <div
        className="absolute inset-0"
        style={{
          opacity: thunderOpacity,
          transition:
            thunderOpacity > 0
              ? 'opacity 65ms ease-out'
              : 'opacity 460ms cubic-bezier(0.16, 1, 0.3, 1)',
          background: `radial-gradient(68% 48% at ${thunderOriginX}% 6%, rgba(188, 208, 238, 0.36), transparent 66%), radial-gradient(52% 40% at ${100 - thunderOriginX}% 20%, rgba(114, 140, 184, 0.24), transparent 70%), radial-gradient(58% 38% at 50% 96%, rgba(180, 148, 92, 0.14), transparent 72%)`,
        }}
      />

      <canvas ref={canvasRef} className="relative z-10 h-full w-full" />
    </div>
  );
}
