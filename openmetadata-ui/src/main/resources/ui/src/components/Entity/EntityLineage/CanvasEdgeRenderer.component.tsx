/*
 *  Copyright 2026 Collate.
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
import { useTheme } from '@mui/material';
import React, { useEffect, useRef, useState } from 'react';
import { Edge } from 'reactflow';
import { useLineageProvider } from '../../../context/LineageProvider/LineageProvider';
import { useCanvasEdgeRenderer } from '../../../hooks/useCanvasEdgeRenderer';
import { useLineageStore } from '../../../hooks/useLineageStore';
import { clearEdgeStyleCache } from '../../../utils/EdgeStyleUtils';

export interface CanvasEdgeRendererProps {
  dqHighlightedEdges: Set<string>;
  hoverEdge: Edge | null;
  onEdgeClick?: (edge: Edge, event: MouseEvent) => void;
  onEdgeHover?: (edge: Edge | null) => void;
}

export const CanvasEdgeRenderer: React.FC<CanvasEdgeRendererProps> = ({
  dqHighlightedEdges,
  onEdgeClick,
  onEdgeHover,
  hoverEdge,
}) => {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const { isEditMode } = useLineageStore();
  const { edges } = useLineageProvider();

  // Keep stable refs for callbacks and getEdgeAtPoint so the pane event listener effect
  // doesn't re-run on every render.
  const onEdgeClickRef = useRef(onEdgeClick);
  const onEdgeHoverRef = useRef(onEdgeHover);
  const getEdgeAtPointRef = useRef<
    ((x: number, y: number, rect: DOMRect) => Edge | null) | null
  >(null);

  useEffect(() => {
    onEdgeClickRef.current = onEdgeClick;
  }, [onEdgeClick]);

  useEffect(() => {
    onEdgeHoverRef.current = onEdgeHover;
  }, [onEdgeHover]);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setContainerSize({ width, height });
      }
    };

    updateSize();

    const resizeObserver = new ResizeObserver(updateSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      clearEdgeStyleCache();
    };
  }, []);

  const { redraw, getEdgeAtPoint } = useCanvasEdgeRenderer({
    canvasRef,
    edges,
    dqHighlightedEdges,
    theme,
    hoverEdge,
    containerWidth: containerSize.width,
    containerHeight: containerSize.height,
  });

  useEffect(() => {
    getEdgeAtPointRef.current = getEdgeAtPoint;
  }, [getEdgeAtPoint]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Attach listeners to the ReactFlow pane element — it sits on top of the
  // canvas and captures all pointer events before they reach us.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    // The pane is a sibling rendered by ReactFlow inside the same wrapper.
    // Walk up to the ReactFlow root and find the pane from there.
    const flowWrapper = container.closest('.react-flow');
    if (!flowWrapper) {
      return;
    }

    const pane = flowWrapper.querySelector('.react-flow__pane');
    if (!pane) {
      return;
    }

    const handleClick = (event: Event) => {
      const mouseEvent = event as MouseEvent;
      const rect = container.getBoundingClientRect();
      const edge = getEdgeAtPointRef.current?.(
        mouseEvent.clientX,
        mouseEvent.clientY,
        rect
      );
      if (edge) {
        onEdgeClickRef.current?.(edge, mouseEvent);
      }
    };

    const handleMouseMove = (event: Event) => {
      if (isEditMode) {
        return;
      }
      const mouseEvent = event as MouseEvent;
      const rect = container.getBoundingClientRect();
      const edge = getEdgeAtPointRef.current?.(
        mouseEvent.clientX,
        mouseEvent.clientY,
        rect
      );
      onEdgeHoverRef.current?.(edge as Edge);
    };

    const handleMouseLeave = () => {
      onEdgeHoverRef.current?.(null);
    };

    pane.addEventListener('click', handleClick);
    pane.addEventListener('mousemove', handleMouseMove);
    pane.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      pane.removeEventListener('click', handleClick);
      pane.removeEventListener('mousemove', handleMouseMove);
      pane.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isEditMode]);

  return (
    <div
      className="lineage-canvas-container"
      ref={containerRef}
      style={{ pointerEvents: 'none' }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', top: 0, left: 0 }}
      />
    </div>
  );
};
