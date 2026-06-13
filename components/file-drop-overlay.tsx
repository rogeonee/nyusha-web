'use client';

import { AnimatePresence, domAnimation, LazyMotion, m } from 'motion/react';
import { CloudUpload } from 'lucide-react';

type FileDropOverlayProps = {
  isVisible: boolean;
};

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export function FileDropOverlay({ isVisible }: FileDropOverlayProps) {
  return (
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence>
        {isVisible ? (
          <m.div
            key="file-drop-overlay"
            // the container below owns the drag/drop events; the overlay must
            // not intercept them or dragleave fires the moment it appears
            className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center p-6"
            initial={false}
          >
            {/* Animate the blur radius itself (not opacity over a static blur)
                so it ramps in one smooth pass instead of stepping. */}
            <m.div
              aria-hidden
              className="absolute inset-0 bg-background/70"
              style={{ willChange: 'backdrop-filter, opacity' }}
              initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              animate={{ opacity: 1, backdropFilter: 'blur(4px)' }}
              exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
            />

            <m.div
              className="relative flex w-full max-w-sm flex-col items-center gap-5 overflow-hidden rounded-2xl border-2 border-dashed border-primary/40 bg-card/80 px-8 py-11 text-center shadow-2xl"
              initial={{ scale: 0.95, y: 10, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.97, y: 6, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            >
              {/* Soft pulsing glow for depth. Sits at z-0 painting over the
                  panel background; content is lifted to z-10. Avoids negative
                  z-index, which would escape the panel's stacking context once
                  the entrance spring flattens its transform — and vanish. */}
              <m.div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.14),transparent_70%)]"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{
                  duration: 2.6,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeInOut',
                }}
              />

              <m.div
                className="relative z-10 flex size-16 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary"
                animate={{ y: [0, -7, 0] }}
                transition={{
                  duration: 2.4,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeInOut',
                }}
              >
                <CloudUpload className="size-8" strokeWidth={1.75} />
              </m.div>

              <div className="relative z-10 space-y-1.5">
                <p className="text-base font-medium tracking-tight text-foreground">
                  Отпустите, чтобы прикрепить
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  PDF, DOCX, TXT, JPG, PNG · до 10 МБ · до 5 файлов
                </p>
              </div>
            </m.div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </LazyMotion>
  );
}
