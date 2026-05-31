'use client';

import { useMemo, type CSSProperties } from 'react';
import { domAnimation, LazyMotion, m } from 'motion/react';
import { cn } from '@/lib/utils';

interface TextShimmerProps {
  children: string;
  className?: string;
  duration?: number;
  spread?: number;
}

export function TextShimmer({
  children,
  className,
  duration = 3,
  spread = 2,
}: TextShimmerProps) {
  const dynamicSpread = useMemo(
    () => Math.max(children.length * spread, 24),
    [children, spread],
  );

  return (
    <LazyMotion features={domAnimation}>
      <m.span
        className={cn(
          'relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent',
          '[--base-color:#71717a] [--base-gradient-color:#171717]',
          '[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]',
          'dark:[--base-color:#a1a1aa] dark:[--base-gradient-color:#ffffff]',
          className,
        )}
        initial={{ backgroundPosition: '100% center' }}
        animate={{ backgroundPosition: '0% center' }}
        transition={{
          repeat: Number.POSITIVE_INFINITY,
          duration,
          ease: 'linear',
        }}
        style={
          {
            '--spread': `${dynamicSpread}px`,
            backgroundImage:
              'var(--bg), linear-gradient(var(--base-color), var(--base-color))',
          } as CSSProperties
        }
      >
        {children}
      </m.span>
    </LazyMotion>
  );
}
