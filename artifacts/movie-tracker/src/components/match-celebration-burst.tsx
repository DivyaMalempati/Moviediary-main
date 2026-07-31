import { useMemo } from "react";
import { motion } from "framer-motion";

type Particle = {
  id: number;
  kind: "popcorn" | "confetti";
  dx: number;
  dy: number;
  delay: number;
  duration: number;
  rotate: number;
  color: string;
  size: number;
};

const CONFETTI_COLORS = ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#c77dff", "#f8f8f8"];
const POPCORN_COLORS = ["#ffe08a", "#ffd166", "#fff3bf", "#f4a261"];

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, id) => {
    const kind: Particle["kind"] = id % 3 === 0 ? "popcorn" : "confetti";
    const angle = (Math.PI * 2 * id) / count + (Math.random() - 0.5) * 0.4;
    const dist = 180 + Math.random() * 260;
    return {
      id,
      kind,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist * 0.85 + 80 + Math.random() * 120,
      delay: Math.random() * 0.28,
      duration: 1.25 + Math.random() * 0.9,
      rotate: (Math.random() - 0.5) * 720,
      color:
        kind === "popcorn"
          ? POPCORN_COLORS[id % POPCORN_COLORS.length]
          : CONFETTI_COLORS[id % CONFETTI_COLORS.length],
      size: kind === "popcorn" ? 12 + Math.random() * 10 : 7 + Math.random() * 7,
    };
  });
}

/**
 * Full-screen popcorn + confetti burst for Together match moments.
 * Framer-motion only — no extra package.
 */
export function MatchCelebrationBurst({ active }: { active: boolean }) {
  const particles = useMemo(() => (active ? makeParticles(52) : []), [active]);

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[90] overflow-hidden" aria-hidden>
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute left-1/2 top-[40%]"
          initial={{ opacity: 1, x: 0, y: 0, scale: 0.35, rotate: 0 }}
          animate={{
            opacity: [1, 1, 0],
            x: p.dx,
            y: p.dy,
            scale: [0.35, 1.2, 0.95],
            rotate: p.rotate,
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: "easeOut",
          }}
          style={
            p.kind === "popcorn"
              ? {
                  width: p.size,
                  height: p.size * 0.85,
                  borderRadius: "45% 55% 50% 50%",
                  background: `radial-gradient(circle at 30% 30%, #fff8e7, ${p.color})`,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
                }
              : {
                  width: p.size,
                  height: p.size * 0.4,
                  borderRadius: 2,
                  backgroundColor: p.color,
                }
          }
        />
      ))}

      <motion.div
        className="absolute left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/35 blur-2xl"
        initial={{ width: 16, height: 16, opacity: 0.95 }}
        animate={{ width: 320, height: 320, opacity: 0 }}
        transition={{ duration: 0.85, ease: "easeOut" }}
      />
    </div>
  );
}
