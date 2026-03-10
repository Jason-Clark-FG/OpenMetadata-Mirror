/*
 *  Copyright 2025 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
import React, { useEffect, useRef } from 'react';
import type { InlineResizeHandleProps } from './TableV2.interface';

const InlineResizeHandle = ({
  currentWidth,
  onResize,
}: InlineResizeHandleProps) => {
  const activeHandlers = useRef<{
    move: (e: MouseEvent) => void;
    up: () => void;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (activeHandlers.current) {
        document.removeEventListener('mousemove', activeHandlers.current.move);
        document.removeEventListener('mouseup', activeHandlers.current.up);
        activeHandlers.current = null;
      }
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = currentWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(80, startWidth + (moveEvent.clientX - startX));
      onResize(moveEvent as unknown as React.SyntheticEvent, {
        node: null as unknown as HTMLElement,
        size: { width: newWidth, height: 0 },
        handle: 'e',
      });
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      activeHandlers.current = null;
    };
    activeHandlers.current = { move: onMouseMove, up: onMouseUp };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <span
      aria-hidden="true"
      className="react-resizable-handle react-resizable-handle-e"
      onMouseDown={handleMouseDown}
    />
  );
};

export default InlineResizeHandle;
