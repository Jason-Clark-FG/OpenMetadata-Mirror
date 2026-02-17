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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Edge, Node, Viewport } from 'reactflow';
import { useBlinkingAnimation } from '../../../hooks/useBlinkingAnimation';
import { useCanvasEdgeRenderer } from '../../../hooks/useCanvasEdgeRenderer';
import { useIconSprites } from '../../../hooks/useIconSprites';
import {
  colorToEdgeIndex,
  inverseTransformPoint,
} from '../../../utils/CanvasUtils';

export interface CanvasEdgeRendererProps {
  edges: Edge[];
  nodes: Node[];
  viewport: Viewport;
  tracedNodes: Set<string>;
  tracedColumns: Set<string>;
  dqHighlightedEdges: Set<string>;
  selectedEdge?: Edge;
  selectedColumn?: string;
  isEditMode?: boolean;
  onEdgeClick?: (edge: Edge, event: React.MouseEvent) => void;
  onEdgeHover?: (edge: Edge | null) => void;
  columnsInCurrentPages: Record<string, string[]>;
}

export const CanvasEdgeRenderer: React.FC<CanvasEdgeRendererProps> = ({
  edges,
  nodes,
  viewport,
  tracedNodes,
  tracedColumns,
  dqHighlightedEdges,
  selectedEdge,
  selectedColumn,
  isEditMode = false,
  onEdgeClick,
  onEdgeHover,
  columnsInCurrentPages,
}) => {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const sprites = useIconSprites();

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

  const { redraw } = useCanvasEdgeRenderer({
    canvasRef,
    hitCanvasRef,
    edges,
    nodes,
    viewport,
    tracedNodes,
    tracedColumns,
    dqHighlightedEdges,
    selectedEdge,
    selectedColumn,
    theme,
    sprites,
    columnsInCurrentPages,
    containerWidth: containerSize.width,
    containerHeight: containerSize.height,
  });

  useBlinkingAnimation({
    canvasRef,
    edges,
    nodes,
    viewport,
    containerWidth: containerSize.width,
    containerHeight: containerSize.height,
  });

  useEffect(() => {
    redraw();
  }, [redraw]);

  const getEdgeAtPoint = useCallback(
    (clientX: number, clientY: number): Edge | null => {
      const hitCanvas = hitCanvasRef.current;
      if (!hitCanvas || !containerRef.current) {
        return null;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      const ctx = hitCanvas.getContext('2d');
      if (!ctx) {
        return null;
      }

      const dpr = window.devicePixelRatio || 1;
      const pixelData = ctx.getImageData(x * dpr, y * dpr, 1, 1).data;

      const edgeIndex = colorToEdgeIndex(
        pixelData[0],
        pixelData[1],
        pixelData[2]
      );

      if (
        edgeIndex === 0 &&
        pixelData[0] === 0 &&
        pixelData[1] === 0 &&
        pixelData[2] === 0
      ) {
        return null;
      }

      const visibleEdges = edges.filter((_edge) => {
        inverseTransformPoint(x, y, viewport);

        return true;
      });

      return visibleEdges[edgeIndex] || null;
    },
    [edges, viewport]
  );

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const edge = getEdgeAtPoint(event.clientX, event.clientY);
      if (edge && onEdgeClick) {
        onEdgeClick(edge, event);
      }
    },
    [getEdgeAtPoint, onEdgeClick]
  );

  const handleCanvasMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const edge = getEdgeAtPoint(event.clientX, event.clientY);
      if (onEdgeHover) {
        onEdgeHover(edge);
      }
    },
    [getEdgeAtPoint, onEdgeHover]
  );

  const handleCanvasMouseLeave = useCallback(() => {
    if (onEdgeHover) {
      onEdgeHover(null);
    }
  }, [onEdgeHover]);

  return (
    <div
      className="lineage-canvas-container"
      ref={containerRef}
      style={{ pointerEvents: isEditMode ? 'none' : 'all' }}>
      <canvas
        height={containerSize.height}
        ref={canvasRef}
        style={{ position: 'absolute', top: 0, left: 0 }}
        width={containerSize.width}
        onClick={handleCanvasClick}
        onMouseLeave={handleCanvasMouseLeave}
        onMouseMove={handleCanvasMouseMove}
      />
      <canvas
        height={containerSize.height}
        ref={hitCanvasRef}
        style={{ position: 'absolute', top: 0, left: 0, display: 'none' }}
        width={containerSize.width}
      />
    </div>
  );
};
