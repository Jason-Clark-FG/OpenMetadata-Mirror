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
import { Edge } from 'reactflow';

export interface EdgeStyle {
  stroke: string;
  opacity: number;
  strokeWidth: number;
}

const edgeStyleCache = new Map<string, EdgeStyle>();

function getStyleCacheKey(
  edgeId: string,
  tracedNodesSize: number,
  tracedColumnsSize: number,
  dqHighlightedEdgesHas: boolean,
  selectedColumn: string | undefined,
  isColumnHighlighted: boolean,
  isHoveredEdge?: boolean
): string {
  return `${edgeId}-${tracedNodesSize}-${tracedColumnsSize}-${dqHighlightedEdgesHas}-${selectedColumn}-${isColumnHighlighted}-${isHoveredEdge}`;
}

export function computeEdgeStyle(
  edge: Edge,
  tracedNodes: Set<string>,
  tracedColumns: Set<string>,
  dqHighlightedEdges: Set<string>,
  selectedColumn: string | undefined,
  theme: Theme,
  isColumnLineage: boolean,
  sourceHandle?: string | null,
  targetHandle?: string | null,
  isEdgeHovered?: boolean
): EdgeStyle {
  const isColumnHighlighted =
    isColumnLineage && tracedColumns.size > 0
      ? (() => {
          return (
            tracedColumns.has(sourceHandle ?? '') &&
            tracedColumns.has(targetHandle ?? '')
          );
        })()
      : false;

  const cacheKey = getStyleCacheKey(
    edge.id,
    tracedNodes.size,
    tracedColumns.size,
    dqHighlightedEdges.has(edge.id),
    selectedColumn,
    isColumnHighlighted,
    isEdgeHovered
  );

  if (edgeStyleCache.has(cacheKey)) {
    return edgeStyleCache.get(cacheKey)!;
  }

  const style = calculateEdgeStyle(
    edge,
    tracedNodes,
    tracedColumns,
    dqHighlightedEdges,
    selectedColumn,
    theme,
    isColumnLineage,
    isColumnHighlighted,
    isEdgeHovered
  );

  edgeStyleCache.set(cacheKey, style);

  return style;
}

function calculateEdgeStyle(
  edge: Edge,
  tracedNodes: Set<string>,
  tracedColumns: Set<string>,
  dqHighlightedEdges: Set<string>,
  selectedColumn: string | undefined,
  theme: Theme,
  isColumnLineage: boolean,
  isColumnHighlighted: boolean,
  isEdgeHovered?: boolean
): EdgeStyle {
  const fromEntityId = edge.data?.edge?.fromEntity?.id;
  const toEntityId = edge.data?.edge?.toEntity?.id;

  const isNodeTraced =
    fromEntityId &&
    toEntityId &&
    tracedNodes.has(fromEntityId) &&
    tracedNodes.has(toEntityId);

  let stroke = isEdgeHovered
    ? theme.palette.primary.main
    : 'rgba(177, 177, 183)';
  let opacity = 1;
  const strokeWidth = 2;

  if (isNodeTraced) {
    stroke = theme.palette.primary.main;
  } else if (tracedNodes.size > 0 || tracedColumns.size > 0) {
    opacity = 0.3;
  }

  if (isColumnLineage && isColumnHighlighted) {
    stroke = selectedColumn
      ? theme.palette.allShades.indigo[600]
      : theme.palette.primary.main;
    opacity = 1;
  }

  if (dqHighlightedEdges.has(edge.id)) {
    stroke = theme.palette.allShades.error[600];
    opacity = 1;
  }

  return {
    stroke,
    opacity,
    strokeWidth,
  };
}

export function clearEdgeStyleCache(): void {
  edgeStyleCache.clear();
}

export function invalidateEdgeStyles(affectedEdgeIds: string[]): void {
  affectedEdgeIds.forEach((id) => {
    const keysToDelete: string[] = [];
    edgeStyleCache.forEach((_, key) => {
      if (key.startsWith(`${id}-`)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => edgeStyleCache.delete(key));
  });
}
