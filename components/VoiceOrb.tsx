'use client';
import { motion, type TargetAndTransition } from 'framer-motion';
import { OrbState } from '@/types';

interface Props {
  state: OrbState;
  onClick: () => void;
}

const orbVariants: Record<OrbState, TargetAndTransition> = {
  idle: {
    scale: [1, 1.03, 1],
    opacity: [0.7, 0.85, 0.7],
    transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
  },
  listening: {
    scale: [1, 1.12, 0.97, 1.08, 1],
    opacity: [0.8, 1, 0.9, 1, 0.8],
    transition: { duration: 0.8, repeat: Infinity },
  },
  speaking: {
    scale: [1, 1.06, 1.02, 1.08, 1],
    opacity: [0.9, 1, 0.95, 1, 0.9],
    transition: { duration: 0.5, repeat: Infinity },
  },
  thinking: {
    rotate: [0, 360],
    transition: { duration: 2, repeat: Infinity, ease: 'linear' },
  },
};

export function VoiceOrb({ state, onClick }: Props) {
  return (
    <button
      role="button"
      onClick={onClick}
      className="relative flex items-center justify-center w-48 h-48 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      aria-label="Начать разговор"
    >
      {/* Outer glow ring */}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 opacity-20"
        animate={orbVariants.idle}
      />
      {/* Core orb */}
      <motion.div
        className="w-36 h-36 rounded-full bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 shadow-2xl shadow-blue-500/50"
        animate={orbVariants[state]}
      />
    </button>
  );
}
