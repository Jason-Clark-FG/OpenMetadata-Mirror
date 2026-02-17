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
import { RefObject, useEffect, useRef } from 'react';
import { Edge, Node, Viewport } from 'reactflow';
import { StatusType } from '../generated/entity/data/pipeline';
import { EntityReference } from '../generated/entity/type';
import { isEdgeInViewport } from '../utils/CanvasUtils';

interface UseBlinkingAnimationProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  edges: Edge[];
  nodes: Node[];
  viewport: Viewport;
  containerWidth: number;
  containerHeight: number;
}

function getPipelineStatusColor(pipeline?: EntityReference): string {
  if (!pipeline?.pipelineStatus) {
    return '';
  }

  switch (pipeline.pipelineStatus.executionStatus) {
    case StatusType.Successful:
      return '#52C41A';
    case StatusType.Failed:
      return '#F5222D';
    case StatusType.Pending:
    case StatusType.Skipped:
      return '#FAAD14';
    default:
      return '';
  }
}

function drawBlinkingIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  frame: number
) {
  const pulse = Math.sin(frame * 0.06) * 1 + 2;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = pulse;
  ctx.strokeRect(x - 12, y - 12, 24, 24);
  ctx.restore();
}

export function useBlinkingAnimation({
  canvasRef,
  edges,
  nodes,
  viewport,
  containerWidth,
  containerHeight,
}: UseBlinkingAnimationProps) {
  const animationFrameRef = useRef(0);
  const rafIdRef = useRef<number>();

  useEffect(() => {
    const blinkingEdges = edges.filter(
      (edge) =>
        edge.data?.isPipelineRootNode &&
        isEdgeInViewport(edge, nodes, viewport, containerWidth, containerHeight)
    );

    if (blinkingEdges.length === 0) {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }

      return;
    }

    const animate = () => {
      animationFrameRef.current++;
      const frame = animationFrameRef.current;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) {
        return;
      }

      ctx.save();
      ctx.translate(viewport.x, viewport.y);
      ctx.scale(viewport.zoom, viewport.zoom);

      blinkingEdges.forEach((edge) => {
        const pathData = edge.data?.computedPath;
        if (!pathData) {
          return;
        }

        const color = getPipelineStatusColor(edge.data?.edge?.pipeline);
        if (!color) {
          return;
        }

        drawBlinkingIcon(
          ctx,
          pathData.edgeCenterX,
          pathData.edgeCenterY,
          color,
          frame
        );
      });

      ctx.restore();

      rafIdRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [edges, nodes, viewport, containerWidth, containerHeight, canvasRef]);
}
