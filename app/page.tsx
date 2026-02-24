"use client";

import { useEffect, useRef, useState } from "react";

type Orb = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hue: number;
};

type Pulse = {
  x: number;
  y: number;
  r: number;
  max: number;
  speed: number;
  width: number;
  mega: boolean;
  chain: boolean;
  hitIds: Set<number>;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
};

type Pointer = {
  x: number;
  y: number;
  down: boolean;
};

const rand = (min: number, max: number) => Math.random() * (max - min) + min;

const makeOrbAtEdge = (width: number, height: number, id: number): Orb => {
  const edge = Math.floor(Math.random() * 4);
  const speed = rand(90, 230);
  const cx = width * 0.5;
  const cy = height * 0.5;

  let x = rand(40, width - 40);
  let y = rand(40, height - 40);

  if (edge === 0) y = -30;
  if (edge === 1) x = width + 30;
  if (edge === 2) y = height + 30;
  if (edge === 3) x = -30;

  const dx = cx - x;
  const dy = cy - y;
  const len = Math.hypot(dx, dy) || 1;

  return {
    id,
    x,
    y,
    vx: (dx / len) * speed + rand(-60, 60),
    vy: (dy / len) * speed + rand(-60, 60),
    r: rand(10, 22),
    hue: rand(165, 355),
  };
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const comboRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState({ score: 0, best: 0, combo: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const orbs: Orb[] = [];
    const pulses: Pulse[] = [];
    const particles: Particle[] = [];
    const pointer: Pointer = { x: 0, y: 0, down: false };
    const state = {
      width: 1,
      height: 1,
      dpr: 1,
      shake: 0,
      score: 0,
      best: 0,
      combo: 0,
      comboClock: 0,
      energy: 0.2,
      hueDrift: rand(170, 330),
    };

    let nextOrbId = 1;
    let frameId = 0;
    let disposed = false;
    let audioCtx: AudioContext | null = null;

    const targetOrbCount = 46;

    const saveBest = (value: number) => {
      try {
        localStorage.setItem("chainburst-best", String(value));
      } catch {
        // Ignore storage failures; game still works without persistence.
      }
    };

    const syncHud = () => {
      if (!disposed) {
        setHud({ score: Math.floor(state.score), best: state.best, combo: state.combo });
      }
    };

    const ensureAudio = async () => {
      if (!audioCtx) {
        audioCtx = new AudioContext();
      }
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
    };

    const playPop = (hue: number, mega: boolean) => {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      const root = 190 + (hue % 50) * 2;
      osc.type = mega ? "square" : "triangle";
      osc.frequency.setValueAtTime(root, now);
      osc.frequency.exponentialRampToValueAtTime(mega ? root * 0.6 : root * 1.45, now + 0.09);

      filter.type = "highpass";
      filter.frequency.setValueAtTime(180, now);
      filter.Q.value = 1.2;

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(mega ? 0.055 : 0.038, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (mega ? 0.21 : 0.13));

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + (mega ? 0.24 : 0.16));
    };

    const addBurst = (x: number, y: number, hue: number, mega: boolean) => {
      const count = mega ? 32 : 18;
      for (let i = 0; i < count; i += 1) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(110, mega ? 720 : 430);
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: rand(0.28, mega ? 0.95 : 0.7),
          maxLife: mega ? 0.95 : 0.7,
          size: rand(1.5, mega ? 5.2 : 3.2),
          hue: hue + rand(-16, 16),
        });
      }
    };

    const pulseHud = () => {
      scoreRef.current?.animate(
        [
          { transform: "scale(1)" },
          { transform: "scale(1.24)" },
          { transform: "scale(1)" },
        ],
        { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
      comboRef.current?.animate(
        [
          { transform: "scale(1)" },
          { transform: "scale(1.12)" },
          { transform: "scale(1)" },
        ],
        { duration: 180, easing: "cubic-bezier(0.2, 0.9, 0.2, 1)" },
      );
    };

    const emitPulse = (x: number, y: number, mega = false, chain = false) => {
      pulses.push({
        x,
        y,
        r: 2,
        max: mega ? 360 : chain ? 120 : 260,
        speed: mega ? 1080 : chain ? 460 : 770,
        width: mega ? 36 : chain ? 22 : 28,
        mega,
        chain,
        hitIds: new Set<number>(),
      });
      state.shake += mega ? 6 : chain ? 2.4 : 4;
      state.energy = Math.min(1.8, state.energy + (mega ? 0.25 : 0.13));
    };

    const popOrb = (index: number, pulse: Pulse) => {
      const orb = orbs[index];
      const comboValue = state.combo + 1;
      const points = 1 + Math.floor(comboValue / 8) + (pulse.mega ? 2 : 0);

      state.combo = comboValue;
      state.comboClock = 1.1;
      state.score += points;
      state.energy = Math.min(1.8, state.energy + 0.06 + points * 0.012);
      state.shake += pulse.mega ? 9 : 5.5;

      if (state.score > state.best) {
        state.best = Math.floor(state.score);
        saveBest(state.best);
      }

      addBurst(orb.x, orb.y, orb.hue, pulse.mega);
      playPop(orb.hue, pulse.mega);
      pulseHud();
      syncHud();

      if (!pulse.chain && Math.random() < (pulse.mega ? 0.75 : 0.42)) {
        emitPulse(orb.x, orb.y, false, true);
      }

      orbs[index] = makeOrbAtEdge(state.width, state.height, nextOrbId);
      nextOrbId += 1;
    };

    const reset = () => {
      orbs.length = 0;
      pulses.length = 0;
      particles.length = 0;
      state.score = 0;
      state.combo = 0;
      state.comboClock = 0;
      state.energy = 0.2;
      state.shake = 0;
      state.hueDrift = rand(170, 330);

      for (let i = 0; i < targetOrbCount; i += 1) {
        const orb = makeOrbAtEdge(state.width, state.height, nextOrbId);
        orb.x = rand(30, state.width - 30);
        orb.y = rand(30, state.height - 30);
        orb.vx = rand(-210, 210);
        orb.vy = rand(-210, 210);
        orbs.push(orb);
        nextOrbId += 1;
      }
      syncHud();
    };

    const resize = () => {
      state.dpr = Math.min(2, window.devicePixelRatio || 1);
      state.width = window.innerWidth;
      state.height = window.innerHeight;
      canvas.width = Math.floor(state.width * state.dpr);
      canvas.height = Math.floor(state.height * state.dpr);
      canvas.style.width = `${state.width}px`;
      canvas.style.height = `${state.height}px`;
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      pointer.x = state.width * 0.5;
      pointer.y = state.height * 0.5;
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };

    const onPointerDown = async (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.down = true;
      await ensureAudio();
      emitPulse(pointer.x, pointer.y, false, false);
    };

    const onPointerUp = () => {
      pointer.down = false;
    };

    const onKeyDown = async (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        await ensureAudio();
        emitPulse(pointer.x, pointer.y, true, false);
      }
      if (event.code === "KeyR") {
        reset();
      }
    };

    let lastTime = performance.now();

    const update = (dt: number) => {
      state.energy = Math.max(0.16, state.energy - dt * 0.22);
      state.hueDrift = (state.hueDrift + dt * (7 + state.energy * 16)) % 360;
      state.shake = Math.max(0, state.shake - dt * 18);

      if (state.comboClock > 0) {
        state.comboClock -= dt;
        if (state.comboClock <= 0 && state.combo !== 0) {
          state.combo = 0;
          syncHud();
        }
      }

      for (let i = pulses.length - 1; i >= 0; i -= 1) {
        const pulse = pulses[i];
        pulse.r += pulse.speed * dt;
        pulse.speed *= pulse.mega ? 0.96 : 0.975;
        if (pulse.r > pulse.max) {
          pulses.splice(i, 1);
        }
      }

      for (let i = 0; i < orbs.length; i += 1) {
        const orb = orbs[i];

        const dx = pointer.x - orb.x;
        const dy = pointer.y - orb.y;
        const d2 = Math.max(dx * dx + dy * dy, 7000);
        const pull = pointer.down ? 120000 : 62000;
        orb.vx += (dx / d2) * pull * dt;
        orb.vy += (dy / d2) * pull * dt;

        orb.vx *= 0.996;
        orb.vy *= 0.996;
        orb.x += orb.vx * dt;
        orb.y += orb.vy * dt;

        if (orb.x - orb.r < 0) {
          orb.x = orb.r;
          orb.vx = Math.abs(orb.vx) * 0.98;
          state.shake += 0.28;
          addBurst(orb.x, orb.y, orb.hue, false);
        } else if (orb.x + orb.r > state.width) {
          orb.x = state.width - orb.r;
          orb.vx = -Math.abs(orb.vx) * 0.98;
          state.shake += 0.28;
          addBurst(orb.x, orb.y, orb.hue, false);
        }

        if (orb.y - orb.r < 0) {
          orb.y = orb.r;
          orb.vy = Math.abs(orb.vy) * 0.98;
          state.shake += 0.28;
          addBurst(orb.x, orb.y, orb.hue, false);
        } else if (orb.y + orb.r > state.height) {
          orb.y = state.height - orb.r;
          orb.vy = -Math.abs(orb.vy) * 0.98;
          state.shake += 0.28;
          addBurst(orb.x, orb.y, orb.hue, false);
        }
      }

      for (let i = 0; i < orbs.length; i += 1) {
        for (let j = i + 1; j < orbs.length; j += 1) {
          const a = orbs[i];
          const b = orbs[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.001;
          const minDist = a.r + b.r;
          if (dist >= minDist) continue;

          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = minDist - dist;
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;

          const rvx = b.vx - a.vx;
          const rvy = b.vy - a.vy;
          const relVel = rvx * nx + rvy * ny;
          if (relVel > 0) continue;

          const bounce = 0.94;
          const impulse = (-(1 + bounce) * relVel) / 2;
          a.vx -= impulse * nx;
          a.vy -= impulse * ny;
          b.vx += impulse * nx;
          b.vy += impulse * ny;

          const impact = Math.abs(relVel);
          if (impact > 120) {
            const midX = (a.x + b.x) * 0.5;
            const midY = (a.y + b.y) * 0.5;
            addBurst(midX, midY, (a.hue + b.hue) * 0.5, false);
            state.shake += Math.min(1.6, impact * 0.0032);
          }
        }
      }

      for (let i = pulses.length - 1; i >= 0; i -= 1) {
        const pulse = pulses[i];
        for (let j = 0; j < orbs.length; j += 1) {
          const orb = orbs[j];
          if (pulse.hitIds.has(orb.id)) continue;

          const dist = Math.hypot(orb.x - pulse.x, orb.y - pulse.y);
          const band = pulse.width + orb.r;
          if (Math.abs(dist - pulse.r) <= band) {
            pulse.hitIds.add(orb.id);
            popOrb(j, pulse);
          }
        }
      }

      while (orbs.length < targetOrbCount) {
        orbs.push(makeOrbAtEdge(state.width, state.height, nextOrbId));
        nextOrbId += 1;
      }

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.vy += 240 * dt;
      }

      if (particles.length > 1600) {
        particles.splice(0, particles.length - 1600);
      }
    };

    const render = () => {
      const wobble = state.shake * 0.8;
      const sx = (Math.random() - 0.5) * wobble;
      const sy = (Math.random() - 0.5) * wobble;

      ctx.save();
      ctx.translate(sx, sy);

      const bg = ctx.createRadialGradient(
        pointer.x,
        pointer.y,
        0,
        pointer.x,
        pointer.y,
        Math.max(state.width, state.height) * 0.9,
      );
      bg.addColorStop(0, `hsl(${(state.hueDrift + 60) % 360} 90% ${10 + state.energy * 8}%)`);
      bg.addColorStop(0.5, `hsl(${(state.hueDrift + 10) % 360} 75% 8%)`);
      bg.addColorStop(1, "hsl(220 45% 4%)");
      ctx.fillStyle = bg;
      ctx.fillRect(-32, -32, state.width + 64, state.height + 64);

      ctx.globalAlpha = 0.1 + state.energy * 0.2;
      ctx.strokeStyle = `hsl(${(state.hueDrift + 145) % 360} 100% 72%)`;
      ctx.lineWidth = 1;
      const cell = 72;
      const ox = ((pointer.x * 0.03) % cell) - cell;
      const oy = ((pointer.y * 0.025) % cell) - cell;
      for (let x = ox; x < state.width + cell; x += cell) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, state.height);
        ctx.stroke();
      }
      for (let y = oy; y < state.height + cell; y += cell) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(state.width, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      for (const pulse of pulses) {
        const alpha = 1 - pulse.r / pulse.max;
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, pulse.r, 0, Math.PI * 2);
        ctx.strokeStyle = pulse.mega
          ? `hsla(44, 100%, 70%, ${Math.max(alpha, 0)})`
          : pulse.chain
            ? `hsla(198, 100%, 72%, ${Math.max(alpha * 0.85, 0)})`
            : `hsla(346, 100%, 72%, ${Math.max(alpha, 0)})`;
        ctx.lineWidth = pulse.width * alpha + 1.2;
        ctx.stroke();
      }

      for (const orb of orbs) {
        const speed = Math.hypot(orb.vx, orb.vy);
        const glow = Math.min(22, speed * 0.045 + state.energy * 8);

        ctx.beginPath();
        ctx.fillStyle = `hsl(${orb.hue} 86% ${56 + glow * 0.24}%)`;
        ctx.shadowBlur = 14 + glow;
        ctx.shadowColor = `hsl(${orb.hue} 98% 64%)`;
        ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.fillStyle = "hsla(0, 0%, 100%, 0.55)";
        ctx.arc(orb.x - orb.r * 0.3, orb.y - orb.r * 0.35, orb.r * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const p of particles) {
        const alpha = p.life / p.maxLife;
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${alpha})`;
        ctx.arc(p.x, p.y, p.size * (0.5 + alpha), 0, Math.PI * 2);
        ctx.fill();
      }

      const cursorRing = 14 + state.energy * 18;
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, cursorRing, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${(state.hueDrift + 210) % 360}, 95%, 76%, ${0.55 + state.energy * 0.3})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
    };

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.033);
      lastTime = now;
      update(dt);
      render();
      frameId = requestAnimationFrame(tick);
    };

    try {
      const persistedBest = Number(localStorage.getItem("chainburst-best") || "0");
      state.best = Number.isFinite(persistedBest) ? Math.max(0, persistedBest) : 0;
    } catch {
      state.best = 0;
    }

    resize();
    reset();
    emitPulse(state.width * 0.5, state.height * 0.5, true, false);
    frameId = requestAnimationFrame(tick);

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      if (audioCtx) {
        void audioCtx.close();
      }
    };
  }, []);

  return (
    <main className="chainburst-root">
      <canvas ref={canvasRef} className="chainburst-canvas" />
      <aside className="chainburst-hud">
        <p className="hud-label">Score</p>
        <div ref={scoreRef} className="hud-score">
          {hud.score}
        </div>
        <p className="hud-meta">
          Best <span>{hud.best}</span>
        </p>
        <p ref={comboRef} className="hud-combo">
          {hud.combo > 1 ? `x${hud.combo} chain` : "Click to blast"}
        </p>
        <p className="hud-keys">Space: Mega Pulse | R: Reset</p>
      </aside>
    </main>
  );
}
