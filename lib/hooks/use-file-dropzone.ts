'use client';

import { useCallback, useRef, useState } from 'react';

type UseFileDropzoneOptions = {
  onDrop: (files: File[]) => void;
  disabled?: boolean;
};

type DropHandlers = {
  onDragEnter: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
};

// only react to OS file drags, not text/element drags within the page
function containsFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/**
 * Window-wide "drop files anywhere" behavior. Spread `dropHandlers` onto the
 * container you want to accept drops, and use `isDragging` to render an overlay.
 *
 * A depth counter prevents the flicker that naive dragenter/dragleave produces
 * as the cursor crosses child elements of the container.
 */
export function useFileDropzone({
  onDrop,
  disabled = false,
}: UseFileDropzoneOptions): {
  isDragging: boolean;
  dropHandlers: DropHandlers;
} {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);

  const handleDragEnter = useCallback(
    (event: React.DragEvent) => {
      if (disabled || !containsFiles(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      setIsDragging(true);
    },
    [disabled],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent) => {
      if (disabled || !containsFiles(event)) return;
      // Required, or the browser refuses to fire `drop`.
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    [disabled],
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent) => {
      if (disabled || !containsFiles(event)) return;
      dragDepth.current -= 1;
      if (dragDepth.current <= 0) {
        dragDepth.current = 0;
        setIsDragging(false);
      }
    },
    [disabled],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      if (disabled || !containsFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) {
        onDrop(files);
      }
    },
    [disabled, onDrop],
  );

  return {
    isDragging,
    dropHandlers: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}
