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
import { LINEAGE_CHILD_ITEMS_PER_PAGE } from '../constants/constants';

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

const getNodeYPadding = (node: Node): number => {
  const columnsLength = node.data.node.columns?.length ?? 0;
  let sourceYPadding = columnsLength > 0 ? 48 : 0;

  const needsNavigation = columnsLength > LINEAGE_CHILD_ITEMS_PER_PAGE;
  if (needsNavigation) {
    sourceYPadding += 28;
  }

  // Add padding for the node's border
  return sourceYPadding + 32.85 / 2;
};

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

    const sourceColumnPosition =
      32.85 * sourceIndex +
      (sourceIndex >= LINEAGE_CHILD_ITEMS_PER_PAGE ? 17 : 0);
    const targetColumnPosition =
      32.85 * targetIndex +
      (targetIndex >= LINEAGE_CHILD_ITEMS_PER_PAGE ? 17 : 0);

    const sourceYPadding = getNodeYPadding(sourceNode);
    const targetYPadding = getNodeYPadding(targetNode);

    return {
      sourceX: sourceNode.position.x + 400,
      sourceY:
        sourceNode.position.y +
        sourceColumnPosition +
        sourceYPadding +
        sourceNodeHeight,
      // reduce 20 for NodeHandles
      targetX: targetNode.position.x,
      targetY:
        targetNode.position.y +
        targetColumnPosition +
        targetYPadding +
        targetNodeHeight,
    };
  }

  return {
    sourceX: sourceNode.position.x + (sourceNode.width ?? 0),
    sourceY: sourceNode.position.y + sourceNodeHeight / 2,
    targetX: targetNode.position.x - 10, // reduce 20 for NodeHandles
    targetY: targetNode.position.y + targetNodeHeight / 2,
  };
}

export function getEdgeBounds(
  edge: Edge,
  sourceNode: Node | undefined,
  targetNode: Node | undefined,
  columnsInCurrentPages?: Map<string, string[]>
): BoundingBox | null {
  const coords = getEdgeCoordinates(
    edge,
    sourceNode,
    targetNode,
    columnsInCurrentPages
  );
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
  const edgeBounds = getEdgeBounds(
    edge,
    sourceNode,
    targetNode,
    columnsInCurrentPages
  );
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

/**
 * Draws an arrowhead that matches ReactFlow's built-in ArrowClosed marker:
 *   <polyline points="-5,-4 0,0 -5,4 -5,-4"
 *             stroke-linecap="round" stroke-linejoin="round"
 *             style="stroke: <color>; fill: <color>; stroke-width: 1;" />
 * The marker viewBox is "-10 -10 20 20" with refX=0, refY=0, so the tip
 * sits exactly at the path endpoint.
 */
export function drawArrowMarker(
  ctx: CanvasRenderingContext2D,
  targetX: number,
  targetY: number,
  angle: number,
  color: string
) {
  ctx.save();

  ctx.translate(targetX, targetY);
  ctx.rotate(angle);

  // Scale factor 1 matches ReactFlow's effective marker size when
  // markerUnits="strokeWidth" is combined with strokeWidth=2.
  const s = 1;
  ctx.beginPath();
  ctx.moveTo(-5 * s, -4 * s);
  ctx.lineTo(0, 0);
  ctx.lineTo(-5 * s, 4 * s);
  ctx.lineTo(-5 * s, -4 * s);
  ctx.closePath();

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fill();
  ctx.stroke();

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

/**
 * Computes the arrival tangent angle at the end of a bezier SVG path string.
 *
 * ReactFlow's markerEnd arrow is oriented along the tangent of the bezier curve
 * at t=1, which is the direction from the last control point (c2) to the end
 * point. Using the raw source→target chord angle (getEdgeAngle) diverges from
 * this whenever nodes are at different Y positions.
 *
 * For a cubic bezier "M sx sy C c1x c1y c2x c2y tx ty" the tangent at t=1
 * is (tx - c2x, ty - c2y).
 *
 * Falls back to the chord angle when the path cannot be parsed (e.g.
 * self-connecting arc paths).
 */
export function getBezierEndTangentAngle(
  pathString: string,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
): number {
  // Match a cubic bezier command: C c1x c1y c2x c2y tx ty
  // Numbers may be negative / decimal.
  const cubicRe =
    /[Cc]\s*([-\d.e+]+)[,\s]+([-\d.e+]+)[,\s]+([-\d.e+]+)[,\s]+([-\d.e+]+)[,\s]+([-\d.e+]+)[,\s]+([-\d.e+]+)/g;

  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = cubicRe.exec(pathString)) !== null) {
    lastMatch = match;
  }

  if (lastMatch) {
    const c2x = parseFloat(lastMatch[3]);
    const c2y = parseFloat(lastMatch[4]);
    const tx = parseFloat(lastMatch[5]);
    const ty = parseFloat(lastMatch[6]);
    const dx = tx - c2x;
    const dy = ty - c2y;

    // Only use the bezier tangent if the control point isn't collapsed onto
    // the endpoint (degenerate bezier).
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
      return Math.atan2(dy, dx);
    }
  }

  return getEdgeAngle(sourceX, sourceY, targetX, targetY);
}
