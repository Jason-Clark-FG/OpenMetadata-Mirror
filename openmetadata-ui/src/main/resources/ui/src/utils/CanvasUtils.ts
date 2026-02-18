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
import { Edge, Node, Viewport } from 'reactflow';

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface EdgeCoordinates {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

export function setupCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  willReadFrequently = false
): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently });
  if (!ctx) {
    throw new Error('Could not get 2D context from canvas');
  }

  const dpr = window.devicePixelRatio || 1;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.scale(dpr, dpr);

  return ctx;
}

export function getNodeHeight(node: Node) {
  const isRootNode = node.data?.isRootNode ?? false;
  const columnCount = node.data?.node.columns?.length || 0;

  let height = columnCount > 0 ? 107 : 56; // Base height for root nodes

  if (isRootNode) {
    height += 10;
  }

  return height;
}

export function getEdgeCoordinates(
  edge: Edge,
  sourceNode?: Node,
  targetNode?: Node,
  columnsInCurrentPages?: Map<string, string[]>
): EdgeCoordinates | null {
  if (!sourceNode || !targetNode) {
    return null;
  }

  if (
    !sourceNode.width ||
    !sourceNode.height ||
    !targetNode.width ||
    !targetNode.height
  ) {
    return null;
  }

  const isColumnLineage = edge.data?.isColumnLineage ?? false;

  const sourceNodeHeight = getNodeHeight(sourceNode);
  const targetNodeHeight = getNodeHeight(targetNode);

  if (isColumnLineage && columnsInCurrentPages) {
    const sourceIds = columnsInCurrentPages.get(sourceNode.id) || [];
    const targetIds = columnsInCurrentPages.get(targetNode.id) || [];
    const sourceIndex = sourceIds.findIndex((id) => id === edge?.sourceHandle);
    const targetIndex = targetIds.findIndex((id) => id === edge?.targetHandle);

    if (sourceIndex === -1 || targetIndex === -1) {
      return null;
    }

    const sourceColumnPosition = 32.85 * sourceIndex + 32.85 / 2;
    const targetColumnPosition = 32.85 * targetIndex + 32.85 / 2;

    return {
      sourceX: sourceNode.position.x + 291,
      sourceY:
        sourceNode.position.y +
        sourceColumnPosition +
        48 +
        sourceNodeHeight +
        4,
      targetX: targetNode.position.x,
      targetY:
        targetNode.position.y +
        targetColumnPosition +
        48 +
        targetNodeHeight +
        4,
    };
  }

  return {
    sourceX: sourceNode.position.x + (sourceNode.width ?? 0),
    sourceY: sourceNode.position.y + sourceNodeHeight / 2,
    targetX: targetNode.position.x,
    targetY: targetNode.position.y + targetNodeHeight / 2,
  };
}

export function getEdgeBounds(
  edge: Edge,
  sourceNode: Node | undefined,
  targetNode: Node | undefined
): BoundingBox | null {
  const coords = getEdgeCoordinates(edge, sourceNode, targetNode);
  if (!coords) {
    return null;
  }

  const padding = 50;

  return {
    minX: Math.min(coords.sourceX, coords.targetX) - padding,
    maxX: Math.max(coords.sourceX, coords.targetX) + padding,
    minY: Math.min(coords.sourceY, coords.targetY) - padding,
    maxY: Math.max(coords.sourceY, coords.targetY) + padding,
  };
}

export function getViewportBounds(
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number
): BoundingBox {
  const { x, y, zoom } = viewport;

  return {
    minX: -x / zoom,
    maxX: (-x + canvasWidth) / zoom,
    minY: -y / zoom,
    maxY: (-y + canvasHeight) / zoom,
  };
}

export function boundsIntersect(a: BoundingBox, b: BoundingBox): boolean {
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY
  );
}

export function isEdgeInViewport(
  edge: Edge,
  sourceNode: Node | undefined,
  targetNode: Node | undefined,
  viewport: Viewport,
  canvasWidth: number,
  canvasHeight: number,
  columnsInCurrentPages: Map<string, string[]>
): boolean {
  const edgeBounds = getEdgeBounds(edge, sourceNode, targetNode);
  if (!edgeBounds) {
    return false;
  }

  if (edge.data?.isColumnLineage && columnsInCurrentPages) {
    const sourceColumnIds = columnsInCurrentPages.get(edge.source) || [];
    const targetColumnIds = columnsInCurrentPages.get(edge.target) || [];

    if (
      !sourceColumnIds.includes(edge.sourceHandle ?? '') ||
      !targetColumnIds.includes(edge.targetHandle ?? '')
    ) {
      return false;
    }
  }

  const viewportBounds = getViewportBounds(viewport, canvasWidth, canvasHeight);

  return boundsIntersect(edgeBounds, viewportBounds);
}

export function hasSignificantViewportChange(
  current: Viewport,
  previous: Viewport,
  threshold: number = 0.1
): boolean {
  const deltaX = Math.abs(current.x - previous.x);
  const deltaY = Math.abs(current.y - previous.y);
  const deltaZoom = Math.abs(current.zoom - previous.zoom);

  return (
    deltaX > threshold || deltaY > threshold || deltaZoom > threshold * 0.1
  );
}

export function transformPoint(
  x: number,
  y: number,
  viewport: Viewport
): { x: number; y: number } {
  return {
    x: x * viewport.zoom + viewport.x,
    y: y * viewport.zoom + viewport.y,
  };
}

export function inverseTransformPoint(
  screenX: number,
  screenY: number,
  viewport: Viewport
): { x: number; y: number } {
  return {
    x: (screenX - viewport.x) / viewport.zoom,
    y: (screenY - viewport.y) / viewport.zoom,
  };
}

export function drawArrowMarker(
  ctx: CanvasRenderingContext2D,
  targetX: number,
  targetY: number,
  angle: number,
  color: string,
  size: number = 10
) {
  ctx.save();

  ctx.translate(targetX, targetY);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size / 2);
  ctx.lineTo(-size, size / 2);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();

  ctx.restore();
}

export function getEdgeAngle(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
): number {
  return Math.atan2(targetY - sourceY, targetX - sourceX);
}
