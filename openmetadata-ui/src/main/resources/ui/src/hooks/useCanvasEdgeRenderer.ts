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
import { Theme } from '@mui/material';
import { RefObject, useCallback, useEffect, useRef } from 'react';
import { Edge, Node, Position, useReactFlow, Viewport } from 'reactflow';
import { StatusType } from '../generated/entity/data/pipeline';
import {
  drawArrowMarker,
  edgeIndexToColor,
  getEdgeAngle,
  getEdgeCoordinates,
  isEdgeInViewport,
  setupCanvas,
} from '../utils/CanvasUtils';
import { computeEdgeStyle } from '../utils/EdgeStyleUtils';
import { getEdgePathData } from '../utils/EntityLineageUtils';
import { IconSprites } from './useIconSprites';

interface UseCanvasEdgeRendererProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  hitCanvasRef: RefObject<HTMLCanvasElement>;
  edges: Edge[];
  nodes: Node[];
  viewport: Viewport;
  tracedNodes: Set<string>;
  tracedColumns: Set<string>;
  dqHighlightedEdges: Set<string>;
  selectedEdge?: Edge;
  selectedColumn?: string;
  theme: Theme;
  sprites: IconSprites | null;
  containerWidth: number;
  containerHeight: number;
  columnsInCurrentPages: Record<string, string[]>;
}

export function useCanvasEdgeRenderer({
  canvasRef,
  hitCanvasRef,
  tracedNodes,
  tracedColumns,
  dqHighlightedEdges,
  edges,
  //   selectedEdge,
  selectedColumn,
  columnsInCurrentPages,
  theme,
  sprites,
  containerWidth,
  containerHeight,
}: UseCanvasEdgeRendererProps) {
  const rafIdRef = useRef<number>();
  const isDirtyRef = useRef(false);
  const { getNode, getNodes, getViewport } = useReactFlow();
  const nodes = getNodes();

  const viewport = getViewport();

  const drawEdgeIcons = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      edge: Edge,
      centerX: number,
      centerY: number
    ) => {
      if (!sprites) {
        return;
      }

      const {
        edge: edgeDetails,
        isColumnLineage,
        columnFunctionValue,
        isExpanded,
      } = edge.data;

      const hasLabel = !isColumnLineage && edgeDetails?.pipeline;
      const hasFunction = !isColumnLineage && columnFunctionValue && isExpanded;

      if (hasLabel && edgeDetails.pipeline) {
        const pipelineStatus = edgeDetails.pipeline.pipelineStatus;
        let sprite = sprites.pipeline;

        if (pipelineStatus) {
          switch (pipelineStatus.executionStatus) {
            case StatusType.Successful:
              sprite = sprites.pipelineGreen;

              break;
            case StatusType.Failed:
              sprite = sprites.pipelineRed;

              break;
            case StatusType.Pending:
            case StatusType.Skipped:
              sprite = sprites.pipelineAmber;

              break;
          }
        }

        ctx.drawImage(sprite, centerX - 8, centerY - 8, 16, 16);
      }

      if (hasFunction) {
        ctx.drawImage(sprites.function, centerX - 8, centerY - 8, 16, 16);
      }
    },
    [sprites]
  );

  const drawEdge = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      edge: Edge,
      isHitCanvas: boolean = false,
      hitColor?: string
    ) => {
      const computedPath = edge.data?.computedPath;
      if (!computedPath) {
        const coords = getEdgeCoordinates(
          edge,
          getNode(edge.source),
          getNode(edge.target),
          columnsInCurrentPages
        );
        if (!coords) {
          return;
        }

        const pathData = getEdgePathData(edge.source, edge.target, {
          sourceX: coords.sourceX,
          sourceY: coords.sourceY,
          targetX: coords.targetX,
          targetY: coords.targetY,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        });

        const style = computeEdgeStyle(
          edge,
          tracedNodes,
          tracedColumns,
          dqHighlightedEdges,
          selectedColumn,
          theme,
          edge.data?.isColumnLineage ?? false,
          edge.sourceHandle,
          edge.targetHandle
        );

        if (isHitCanvas && hitColor) {
          ctx.strokeStyle = hitColor;
          ctx.lineWidth = 8;
        } else {
          ctx.strokeStyle = style.stroke;
          ctx.globalAlpha = style.opacity;
          ctx.lineWidth = style.strokeWidth;
        }

        const path = new Path2D(pathData.edgePath);
        ctx.stroke(path);

        ctx.globalAlpha = 1;

        if (!isHitCanvas) {
          const angle = getEdgeAngle(
            coords.sourceX,
            coords.sourceY,
            coords.targetX,
            coords.targetY
          );
          drawArrowMarker(
            ctx,
            coords.targetX,
            coords.targetY,
            angle,
            style.stroke
          );
        }

        if (!isHitCanvas && sprites && edge.data) {
          drawEdgeIcons(ctx, edge, pathData.edgeCenterX, pathData.edgeCenterY);
        }

        return;
      }

      const pathData = computedPath;

      const style = computeEdgeStyle(
        edge,
        tracedNodes,
        tracedColumns,
        dqHighlightedEdges,
        selectedColumn,
        theme,
        edge.data?.isColumnLineage ?? false,
        edge.sourceHandle,
        edge.targetHandle
      );

      if (isHitCanvas && hitColor) {
        ctx.strokeStyle = hitColor;
        ctx.lineWidth = 8;
      } else {
        ctx.strokeStyle = style.stroke;
        ctx.globalAlpha = style.opacity;
        ctx.lineWidth = style.strokeWidth;
      }

      const path = new Path2D(pathData.edgePath);
      ctx.stroke(path);

      ctx.globalAlpha = 1;

      if (!isHitCanvas && pathData.sourceX && pathData.targetX) {
        const angle = getEdgeAngle(
          pathData.sourceX,
          pathData.sourceY,
          pathData.targetX,
          pathData.targetY
        );
        drawArrowMarker(
          ctx,
          pathData.targetX,
          pathData.targetY,
          angle,
          style.stroke
        );
      }

      if (!isHitCanvas && sprites && edge.data) {
        drawEdgeIcons(ctx, edge, pathData.edgeCenterX, pathData.edgeCenterY);
      }
    },
    [
      nodes,
      tracedNodes,
      tracedColumns,
      dqHighlightedEdges,
      selectedColumn,
      theme,
      sprites,
      drawEdgeIcons,
      columnsInCurrentPages,
    ]
  );

  const drawAllEdges = useCallback(() => {
    const canvas = canvasRef.current;
    const hitCanvas = hitCanvasRef.current;

    if (!canvas || !hitCanvas || !containerWidth || !containerHeight) {
      return;
    }

    const ctx = setupCanvas(canvas, containerWidth, containerHeight);
    const hitCtx = setupCanvas(hitCanvas, containerWidth, containerHeight);

    ctx.clearRect(0, 0, containerWidth, containerHeight);
    hitCtx.clearRect(0, 0, containerWidth, containerHeight);

    ctx.save();
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);

    hitCtx.save();
    hitCtx.translate(viewport.x, viewport.y);
    hitCtx.scale(viewport.zoom, viewport.zoom);

    const visibleEdges = edges.filter((edge) =>
      isEdgeInViewport(
        edge,
        getNode(edge.source),
        getNode(edge.target),
        viewport,
        containerWidth,
        containerHeight,
        columnsInCurrentPages
      )
    );

    visibleEdges.forEach((edge, index) => {
      ctx.save();
      drawEdge(ctx, edge, false);
      ctx.restore();

      hitCtx.save();
      const hitColor = edgeIndexToColor(index);
      drawEdge(hitCtx, edge, true, hitColor);
      hitCtx.restore();
    });

    ctx.restore();
    hitCtx.restore();
  }, [
    canvasRef,
    hitCanvasRef,
    edges,
    nodes,
    viewport,
    containerWidth,
    containerHeight,
    drawEdge,
    columnsInCurrentPages,
  ]);

  const scheduleRedraw = useCallback(() => {
    if (isDirtyRef.current) {
      return;
    }

    isDirtyRef.current = true;
    rafIdRef.current = requestAnimationFrame(() => {
      drawAllEdges();
      isDirtyRef.current = false;
    });
  }, [drawAllEdges]);

  useEffect(() => {
    scheduleRedraw();

    return () => {
      if (rafIdRef.current) {
        isDirtyRef.current = false;
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [scheduleRedraw]);

  return { redraw: scheduleRedraw };
}
