'use client';
import { motion, type TargetAndTransition } from 'framer-motion';
import { OrbState } from '@/types';

interface Props {
  state: OrbState;
  onClick: () => void;
  disabled?: boolean;
}

const orbVariants: Record<OrbState, TargetAndTransition> = {
  idle: {
    scale: [1, 1.03, 1],
    opacity: [0.75, 0.9, 0.75],
    transition: { duration: 3.5, repeat: Infinity, ease: 'easeInOut' },
  },
  listening: {
    scale: [1, 1.14, 0.97, 1.1, 1],
    opacity: [0.85, 1, 0.9, 1, 0.85],
    transition: { duration: 0.75, repeat: Infinity },
  },
  speaking: {
    scale: [1, 1.07, 1.02, 1.09, 1],
    opacity: [0.9, 1, 0.95, 1, 0.9],
    transition: { duration: 0.45, repeat: Infinity },
  },
  thinking: {
    rotate: [0, 360],
    transition: { duration: 2.5, repeat: Infinity, ease: 'linear' },
  },
};

const glowVariants: Record<OrbState, TargetAndTransition> = {
  idle: {
    scale: [1, 1.05, 1],
    opacity: [0.15, 0.25, 0.15],
    transition: { duration: 3.5, repeat: Infinity, ease: 'easeInOut' },
  },
  listening: {
    scale: [1, 1.2, 1],
    opacity: [0.2, 0.45, 0.2],
    transition: { duration: 0.75, repeat: Infinity },
  },
  speaking: {
    scale: [1, 1.15, 1],
    opacity: [0.25, 0.5, 0.25],
    transition: { duration: 0.45, repeat: Infinity },
  },
  thinking: {
    opacity: [0.2, 0.35, 0.2],
    transition: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
  },
};

const ariaLabels: Record<OrbState, string> = {
  idle: 'Начать разговор',
  listening: 'Идёт запись',
  speaking: 'AI отвечает',
  thinking: 'AI думает',
};

export function VoiceOrb({ state, onClick, disabled }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="relative flex items-center justify-center w-52 h-52 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a853]/50 disabled:cursor-default"
      aria-label={ariaLabels[state]}
    >
      {/* Outer ambient glow */}
      <motion.div
        className="absolute inset-[-20px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(212,168,83,0.18) 0%, transparent 70%)',
        }}
        animate={glowVariants[state]}
      />
      {/* Mid ring */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(212,168,83,0.08) 0%, transparent 75%)',
          border: '1px solid rgba(212,168,83,0.15)',
        }}
        animate={glowVariants[state]}
      />
      {/* Core orb */}
      <motion.div
        className="w-40 h-40 rounded-full shadow-2xl"
        style={{
          background: 'radial-gradient(circle at 35% 35%, #e8c06a, #c9893a, #8b4e1a)',
          boxShadow: '0 0 60px rgba(212,168,83,0.3), 0 0 120px rgba(180,120,40,0.15)',
        }}
        animate={orbVariants[state]}
      />
    </button>
  );
}
