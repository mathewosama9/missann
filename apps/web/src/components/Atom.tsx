import { useEffect, useRef } from 'react';

// ذرّة ثلاثية الأبعاد مرسومة على canvas:
// مدارات مائلة تدور ببطء، إلكترونات بذيول مضيئة تمر خلف/أمام نواة من بروتونات ونيوترونات،
// وتميل الذرّة قليلاً مع حركة المؤشر. تتوقف عند الخروج من الشاشة وتحترم "تقليل الحركة".

type Tone = 'light' | 'dark';

interface Vec {
  x: number;
  y: number;
  z: number;
}

// أسلوب مسطح مطابق لهوية الموقع: خطوط حبر + ألوان مصمتة + ظل "مطبوع"
const PALETTE: Record<Tone, { line: string; outline: string; electrons: string[]; shadow: string }> = {
  light: { line: '19,22,41', outline: '#131629', electrons: ['#3D55F5', '#F4643B', '#CDEB3C'], shadow: '#131629' },
  dark: { line: '251,247,238', outline: '#131629', electrons: ['#CDEB3C', '#FF835F', '#8E9FFF'], shadow: 'rgba(0,0,0,0.45)' },
};

const ORBITS = [
  { phase: 0, speed: 1.05, offset: 0 },
  { phase: Math.PI / 3, speed: 0.8, offset: 2.1 },
  { phase: (2 * Math.PI) / 3, speed: 1.3, offset: 4.2 },
];
const TILT = 1.18; // ميل مستوى المدار
const SEGMENTS = 96;
const TRAIL = 1.1; // طول الذيل بالراديان

const rotX = (p: Vec, a: number): Vec => {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
};
const rotY = (p: Vec, a: number): Vec => {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
};
const rotZ = (p: Vec, a: number): Vec => {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
};

export function Atom({ className = '', tone = 'light' }: { className?: string; tone?: Tone }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!wrap || !canvas || !ctx) return;

    const colors = PALETTE[tone];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0, h = 0;
    let raf = 0;
    let visible = true;
    let last = performance.now();
    let time = 2.4; // نقطة بداية بشكل متوازن
    const tilt = { x: 0, y: 0, tx: 0, ty: 0 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = wrap.clientWidth;
      h = wrap.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduceMotion) draw();
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const size = Math.min(w, h);
      if (!size) return;
      const cx = w / 2, cy = h / 2;
      const R = size * 0.4;
      const focal = R * 5;
      const spin = time * 0.12;

      // دوران عام بطيء + ميل المؤشر
      const world = (p: Vec) => rotY(rotX(p, 0.25 + tilt.y), Math.sin(time * 0.2) * 0.25 + tilt.x);
      const project = (p: Vec) => {
        const s = focal / (focal - p.z);
        return { x: cx + p.x * s, y: cy + p.y * s, s, z: p.z };
      };
      const orbitPoint = (i: number, t: number) =>
        world(rotZ(rotX({ x: R * Math.cos(t), y: R * Math.sin(t), z: 0 }, TILT), ORBITS[i].phase + spin));

      type Seg = { a: ReturnType<typeof project>; b: ReturnType<typeof project>; z: number; alpha: number; width: number; color: string };
      const back: Seg[] = [];
      const front: Seg[] = [];
      const pushSeg = (s: Seg) => (s.z < 0 ? back : front).push(s);

      // المدارات
      ORBITS.forEach((_, i) => {
        let prev = project(orbitPoint(i, 0));
        for (let k = 1; k <= SEGMENTS; k++) {
          const cur = project(orbitPoint(i, (k / SEGMENTS) * Math.PI * 2));
          const z = (prev.z + cur.z) / 2;
          pushSeg({ a: prev, b: cur, z, alpha: z < 0 ? 0.22 : 0.85, width: Math.max(1.4, size * 0.0065), color: colors.line });
          prev = cur;
        }
      });

      // الإلكترونات وذيولها
      const electrons = ORBITS.map((o, i) => {
        const angle = o.offset + time * o.speed;
        const steps = 22;
        let prev = project(orbitPoint(i, angle - TRAIL));
        for (let k = 1; k <= steps; k++) {
          const f = k / steps;
          const cur = project(orbitPoint(i, angle - TRAIL + TRAIL * f));
          const z = (prev.z + cur.z) / 2;
          pushSeg({ a: prev, b: cur, z, alpha: f * f * 0.7 * (z < 0 ? 0.4 : 1), width: size * 0.014 * f, color: hexToRgb(colors.electrons[i]) });
          prev = cur;
        }
        return { p: project(orbitPoint(i, angle)), color: colors.electrons[i] };
      });

      const drawSegs = (segs: Seg[]) => {
        ctx.lineCap = 'round';
        for (const s of segs) {
          ctx.strokeStyle = `rgba(${s.color},${s.alpha})`;
          ctx.lineWidth = s.width;
          ctx.beginPath();
          ctx.moveTo(s.a.x, s.a.y);
          ctx.lineTo(s.b.x, s.b.y);
          ctx.stroke();
        }
      };

      const drawElectron = (e: (typeof electrons)[number]) => {
        const r = size * 0.034 * e.p.s;
        ctx.fillStyle = e.color;
        ctx.strokeStyle = colors.outline;
        ctx.lineWidth = Math.max(1.5, size * 0.0075);
        ctx.beginPath();
        ctx.arc(e.p.x, e.p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      };

      // النواة: دائرة ليمونية بإطار حبر وظل مزاح مثل خانات الصفوف
      const drawNucleus = () => {
        const r = R * 0.2;
        const off = r * 0.16;
        ctx.fillStyle = colors.shadow;
        ctx.beginPath();
        ctx.arc(cx + off, cy + off, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#CDEB3C';
        ctx.strokeStyle = colors.outline;
        ctx.lineWidth = Math.max(2, size * 0.01);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // لمعة صغيرة
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.22, 0, Math.PI * 2);
        ctx.fill();
      };

      back.sort((a, b) => a.z - b.z);
      front.sort((a, b) => a.z - b.z);
      drawSegs(back);
      electrons.filter((e) => e.p.z < 0).forEach(drawElectron);
      drawNucleus();
      drawSegs(front);
      electrons.filter((e) => e.p.z >= 0).forEach(drawElectron);
    };

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      time += dt;
      tilt.x += (tilt.tx - tilt.x) * 0.06;
      tilt.y += (tilt.ty - tilt.y) * 0.06;
      draw();
      raf = visible ? requestAnimationFrame(loop) : 0;
    };

    const start = () => {
      if (reduceMotion || raf) return;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const onPointerMove = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      tilt.tx = ((e.clientX - r.left) / r.width - 0.5) * 0.7;
      tilt.ty = ((e.clientY - r.top) / r.height - 0.5) * -0.7;
    };
    const onPointerLeave = () => {
      tilt.tx = 0;
      tilt.ty = 0;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && !document.hidden;
      visible ? start() : stop();
    });
    io.observe(wrap);

    const onVisibility = () => {
      visible = !document.hidden;
      visible ? start() : stop();
    };
    document.addEventListener('visibilitychange', onVisibility);
    wrap.addEventListener('pointermove', onPointerMove);
    wrap.addEventListener('pointerleave', onPointerLeave);

    if (reduceMotion) draw();
    else start();

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      wrap.removeEventListener('pointermove', onPointerMove);
      wrap.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [tone]);

  return (
    <div ref={wrapRef} className={`aspect-square ${className}`} aria-hidden>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
