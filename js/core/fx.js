/* Tiny canvas particle system - no libraries, no assets.
   Used for hit bursts and result-screen confetti. */

export function createFx(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let parts = [];
  let raf = 0;
  let w = 0;
  let h = 0;

  function resize() {
    const r = canvas.getBoundingClientRect();
    w = r.width;
    h = r.height;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function loop() {
    ctx.clearRect(0, 0, w, h);
    parts = parts.filter((p) => p.life > 0 && p.y < h + 40);

    for (const p of parts) {
      p.life -= p.decay;
      p.vy += p.gravity;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;

      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.r, -p.r * 0.55, p.r * 2, p.r * 1.1);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    raf = parts.length ? requestAnimationFrame(loop) : 0;
  }

  const start = () => { if (!raf) raf = requestAnimationFrame(loop); };

  return {
    resize,

    /** Radial spray from a point, in one colour. */
    burst(x, y, color, count = 18) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.6 + Math.random() * 5.2;
        parts.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.4,
          r: 1.8 + Math.random() * 3.2,
          color,
          life: 1,
          decay: 0.016 + Math.random() * 0.02,
          gravity: 0.14,
          rot: 0, spin: 0,
          shape: 'dot'
        });
      }
      start();
    },

    /** Ribbons falling from the top edge - for a new personal best. */
    confetti(colors, count = 80) {
      for (let i = 0; i < count; i++) {
        parts.push({
          x: Math.random() * w,
          y: -20 - Math.random() * 120,
          vx: (Math.random() - 0.5) * 2.4,
          vy: 1.5 + Math.random() * 2.6,
          r: 3 + Math.random() * 4,
          color: colors[i % colors.length],
          life: 1,
          decay: 0.004,
          gravity: 0.045,
          rot: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 0.24,
          shape: 'rect'
        });
      }
      start();
    },

    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      parts = [];
      ctx.clearRect(0, 0, w, h);
    }
  };
}

/** Animates a number in an element - scores that tick up read as a reward. */
export function countUp(elm, to, ms = 600) {
  const from = Number(String(elm.textContent).replace(/\D/g, '')) || 0;
  if (from === to) { elm.textContent = to; return; }

  // rAF is paused in a background or unpainted tab, which would freeze the
  // number mid-count. The timer guarantees the final value lands regardless.
  const settle = setTimeout(() => { elm.textContent = to; }, ms + 150);

  const t0 = performance.now();
  function step(now) {
    const k = Math.min(1, (now - t0) / ms);
    const eased = 1 - Math.pow(1 - k, 3);
    elm.textContent = Math.round(from + (to - from) * eased);
    if (k < 1) requestAnimationFrame(step);
    else clearTimeout(settle);
  }
  requestAnimationFrame(step);
}
