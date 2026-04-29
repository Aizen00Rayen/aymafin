import React from "react";
import { motion } from "framer-motion";

const LOGO_URL = "https://customer-assets.emergentagent.com/job_b01d42a3-f1ae-4d66-b970-d5ac0810ddbf/artifacts/2vbg1kvr_logo.png";

// Animated CSS / SVG version of the logo (3D R3F is not React 19.0 compatible yet)
export default function HeroLogo({ className = "" }) {
  const particles = Array.from({ length: 24 });

  return (
    <div className={`relative w-full h-full overflow-hidden rounded-3xl ${className}`} data-testid="hero-3d-logo">
      {/* Glow base */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.18),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(34,197,94,0.16),transparent_55%)]" />

      {/* Orbit rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 m-auto rounded-full border border-white/5"
          style={{
            width: `${280 + i * 70}px`,
            height: `${280 + i * 70}px`,
            top: "50%",
            left: "50%",
            translateX: "-50%",
            translateY: "-50%",
          }}
          animate={{ rotate: i % 2 === 0 ? 360 : -360 }}
          transition={{ duration: 30 + i * 12, repeat: Infinity, ease: "linear" }}
        />
      ))}

      {/* Particles */}
      {particles.map((_, i) => {
        const top = Math.random() * 100;
        const left = Math.random() * 100;
        const size = 2 + Math.random() * 3;
        const dur = 4 + Math.random() * 4;
        const delay = Math.random() * 4;
        const blue = Math.random() > 0.5;
        return (
          <motion.span
            key={i}
            className="absolute rounded-full"
            style={{
              top: `${top}%`,
              left: `${left}%`,
              width: size,
              height: size,
              background: blue ? "#60a5fa" : "#4ade80",
              boxShadow: `0 0 ${size * 4}px ${blue ? "#2563eb" : "#22c55e"}`,
            }}
            animate={{ opacity: [0.2, 1, 0.2], y: [0, -20, 0] }}
            transition={{ duration: dur, repeat: Infinity, delay, ease: "easeInOut" }}
          />
        );
      })}

      {/* Center logo - floating */}
      <div className="absolute inset-0 grid place-items-center">
        <motion.div
          className="relative"
          animate={{ y: [0, -12, 0], rotate: [-2, 2, -2] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <motion.div
            className="absolute inset-0 rounded-3xl blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(37,99,235,0.5), transparent 70%)" }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 4, repeat: Infinity }}
          />
          <motion.img
            src={LOGO_URL}
            alt="AYMAFIN"
            className="relative size-44 sm:size-56 drop-shadow-[0_0_40px_rgba(37,99,235,0.5)] select-none"
            draggable={false}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ scale: 1.05, rotate: 5 }}
          />
        </motion.div>
      </div>

      {/* Scan line */}
      <motion.div
        className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400/60 to-transparent"
        animate={{ top: ["10%", "90%", "10%"] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
