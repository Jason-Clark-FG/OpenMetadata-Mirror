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
import { useEffect, useRef } from 'react';
import { Edge, Position, useStore } from 'reactflow';
import { getEdgeCoordinates } from '../utils/CanvasUtils';
import { getEdgePathData } from '../utils/EntityLineageUtils';

export function useEdgePathComputation(
  edges: Edge[],
  setEdges: (edges: Edge[]) => void,
  columnsInCurrentPages: Record<string, string[]>
) {
  const computedEdgeIds = useRef(new Set<string>());

  const nodeInternals = useStore((state) => state.nodeInternals);

  useEffect(() => {
    const edgesToUpdate: Edge[] = [];

    edges.forEach((edge) => {
      if (computedEdgeIds.current.has(edge.id)) {
        return;
      }

      const sourceNode = nodeInternals.get(edge.source);
      const targetNode = nodeInternals.get(edge.target);

      if (!sourceNode || !targetNode) {
        return;
      }

      if (
        !sourceNode.width ||
        !sourceNode.height ||
        !targetNode.width ||
        !targetNode.height
      ) {
        return;
      }

      const coords = getEdgeCoordinates(
        edge,
        sourceNode,
        targetNode,
        columnsInCurrentPages
      );
      if (!coords) {
        return;
      }

      const { sourceX, sourceY, targetX, targetY } = coords;

      const pathData = getEdgePathData(edge.source, edge.target, {
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });

      edgesToUpdate.push({
        ...edge,
        data: {
          ...edge.data,
          computedPath: {
            ...pathData,
            sourceX,
            sourceY,
            targetX,
            targetY,
          },
        },
      });

      computedEdgeIds.current.add(edge.id);
    });

    if (edgesToUpdate.length > 0) {
      setEdges(
        edges.map((edge) => {
          const updatedEdge = edgesToUpdate.find((e) => e.id === edge.id);

          return updatedEdge || edge;
        })
      );
    }
  }, [edges, nodeInternals, columnsInCurrentPages, setEdges]);
}
