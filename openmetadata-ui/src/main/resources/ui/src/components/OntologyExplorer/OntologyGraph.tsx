/*
 *  Copyright 2024 Collate.
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

import ELK, { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk.bundled.js';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactFlow, {
  Background,
  Edge,
  EdgeTypes,
  MiniMap,
  Node,
  NodeTypes,
  ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import OntologyEdge, { OntologyEdgeData } from './OntologyEdge';
import {
  GraphSettings,
  OntologyEdge as OntologyEdgeType,
  OntologyNode as OntologyNodeType,
} from './OntologyExplorer.interface';
import OntologyNode, { OntologyNodeData } from './OntologyNode';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 60;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;
const DEFAULT_ZOOM = 0.8;

const elk = new ELK();

const INVERSE_RELATION_PAIRS: Record<string, string> = {
  broader: 'narrower',
  narrower: 'broader',
  parentOf: 'childOf',
  childOf: 'parentOf',
  hasPart: 'partOf',
  partOf: 'hasPart',
  hasA: 'componentOf',
  componentOf: 'hasA',
  composedOf: 'partOf',
  owns: 'ownedBy',
  ownedBy: 'owns',
  manages: 'managedBy',
  managedBy: 'manages',
  contains: 'containedIn',
  containedIn: 'contains',
  hasTypes: 'typeOf',
  typeOf: 'hasTypes',
  usedToCalculate: 'calculatedFrom',
  calculatedFrom: 'usedToCalculate',
  usedBy: 'dependsOn',
  dependsOn: 'usedBy',
};

const SYMMETRIC_RELATIONS = new Set([
  'related',
  'relatedTo',
  'synonym',
  'antonym',
  'seeAlso',
]);

interface MergedEdge {
  from: string;
  to: string;
  relationType: string;
  inverseRelationType?: string;
  isBidirectional: boolean;
}

const layoutOptions: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.spacing.nodeNode': '80',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
  'elk.separateConnectedComponents': 'false',
};

const forceLayoutOptions: Record<string, string> = {
  'elk.algorithm': 'stress',
  'elk.stress.desiredEdgeLength': '200',
  'elk.spacing.nodeNode': '120',
};

const radialLayoutOptions: Record<string, string> = {
  'elk.algorithm': 'radial',
  'elk.spacing.nodeNode': '100',
  'elk.radial.centerOnRoot': 'true',
  'elk.radial.compactor': 'WEDGE_COMPACTION',
};

export interface OntologyGraphProps {
  nodes: OntologyNodeType[];
  edges: OntologyEdgeType[];
  settings: GraphSettings;
  selectedNodeId?: string | null;
  glossaryColorMap: Record<string, string>;
  onNodeClick: (node: OntologyNodeType) => void;
  onNodeDoubleClick: (node: OntologyNodeType) => void;
  onNodeContextMenu: (
    node: OntologyNodeType,
    position: { x: number; y: number }
  ) => void;
  onPaneClick: () => void;
  showMinimap?: boolean;
}

const nodeTypes: NodeTypes = {
  ontologyNode: OntologyNode,
};

const edgeTypes: EdgeTypes = {
  ontologyEdge: OntologyEdge,
};

const OntologyGraph: React.FC<OntologyGraphProps> = ({
  nodes: inputNodes,
  edges: inputEdges,
  settings,
  selectedNodeId,
  glossaryColorMap,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
  onPaneClick,
  showMinimap = false,
}) => {
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isLayouting, setIsLayouting] = useState(false);

  const getLayoutOptions = useCallback(() => {
    switch (settings.layout) {
      case 'hierarchical':
        return layoutOptions;
      case 'radial':
        return radialLayoutOptions;
      case 'force':
      default:
        return forceLayoutOptions;
    }
  }, [settings.layout]);

  const getNeighborIds = useCallback(
    (nodeId: string): Set<string> => {
      const neighbors = new Set<string>();
      inputEdges.forEach((edge) => {
        if (edge.from === nodeId) {
          neighbors.add(edge.to);
        }
        if (edge.to === nodeId) {
          neighbors.add(edge.from);
        }
      });

      return neighbors;
    },
    [inputEdges]
  );

  const connectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    inputEdges.forEach((edge) => {
      counts.set(edge.from, (counts.get(edge.from) ?? 0) + 1);
      counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1);
    });

    return counts;
  }, [inputEdges]);

  const mergedEdges = useMemo((): MergedEdge[] => {
    const edgeMap = new Map<string, OntologyEdgeType>();
    const processedPairs = new Set<string>();
    const result: MergedEdge[] = [];

    inputEdges.forEach((edge) => {
      const key = `${edge.from}->${edge.to}`;
      edgeMap.set(key, edge);
    });

    inputEdges.forEach((edge) => {
      const forwardKey = `${edge.from}->${edge.to}`;
      const reverseKey = `${edge.to}->${edge.from}`;
      const pairKey = [edge.from, edge.to].sort().join('::');

      if (processedPairs.has(pairKey)) {
        return;
      }

      const reverseEdge = edgeMap.get(reverseKey);
      const inverseRelation = INVERSE_RELATION_PAIRS[edge.relationType];
      const isSymmetric = SYMMETRIC_RELATIONS.has(edge.relationType);

      if (reverseEdge && inverseRelation === reverseEdge.relationType) {
        processedPairs.add(pairKey);
        result.push({
          from: edge.from,
          to: edge.to,
          relationType: edge.relationType,
          inverseRelationType: reverseEdge.relationType,
          isBidirectional: true,
        });
      } else if (
        reverseEdge &&
        isSymmetric &&
        edge.relationType === reverseEdge.relationType
      ) {
        processedPairs.add(pairKey);
        result.push({
          from: edge.from,
          to: edge.to,
          relationType: edge.relationType,
          isBidirectional: true,
        });
      } else {
        edgeMap.delete(forwardKey);
        result.push({
          from: edge.from,
          to: edge.to,
          relationType: edge.relationType,
          isBidirectional: false,
        });
      }
    });

    return result;
  }, [inputEdges]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const ontologyNode = inputNodes.find((n) => n.id === node.id);
      if (ontologyNode) {
        onNodeClick(ontologyNode);
      }
    },
    [inputNodes, onNodeClick]
  );

  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const ontologyNode = inputNodes.find((n) => n.id === node.id);
      if (ontologyNode) {
        onNodeDoubleClick(ontologyNode);
      }
    },
    [inputNodes, onNodeDoubleClick]
  );

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      const ontologyNode = inputNodes.find((n) => n.id === node.id);
      if (ontologyNode) {
        onNodeContextMenu(ontologyNode, { x: event.clientX, y: event.clientY });
      }
    },
    [inputNodes, onNodeContextMenu]
  );

  const handlePaneClick = useCallback(() => {
    onPaneClick();
  }, [onPaneClick]);

  const layoutNodes = useCallback(
    async (
      nodesData: OntologyNodeType[],
      edgesData: OntologyEdgeType[]
    ): Promise<Node[]> => {
      const elkNodes: ElkNode[] = nodesData.map((node) => ({
        id: node.id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      }));

      const elkEdges: ElkExtendedEdge[] = edgesData.map((edge, index) => ({
        id: `elk-edge-${index}`,
        sources: [edge.from],
        targets: [edge.to],
      }));

      const graph = {
        id: 'root',
        layoutOptions: getLayoutOptions(),
        children: elkNodes,
        edges: elkEdges,
      };

      try {
        const layoutedGraph = await elk.layout(graph);

        return nodesData.map((node) => {
          const layoutedNode = layoutedGraph.children?.find(
            (n) => n.id === node.id
          );
          const neighborIds = getNeighborIds(node.id);
          const isSelected = selectedNodeId === node.id;
          const isHighlighted =
            selectedNodeId !== null && neighborIds.has(selectedNodeId ?? '');
          const isConnected = connectionCounts.get(node.id) ?? 0 > 0;
          const glossaryColor =
            node.glossaryId && glossaryColorMap[node.glossaryId]
              ? glossaryColorMap[node.glossaryId]
              : '#3062d4';

          const nodeData: OntologyNodeData = {
            node,
            isSelected,
            isHighlighted,
            isConnected,
            glossaryColor,
            onClick: (id) => {
              const n = nodesData.find((n) => n.id === id);
              if (n) {
                onNodeClick(n);
              }
            },
            onDoubleClick: (id) => {
              const n = nodesData.find((n) => n.id === id);
              if (n) {
                onNodeDoubleClick(n);
              }
            },
          };

          return {
            id: node.id,
            type: 'ontologyNode',
            position: {
              x: layoutedNode?.x ?? 0,
              y: layoutedNode?.y ?? 0,
            },
            data: nodeData,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
          };
        });
      } catch {
        return nodesData.map((node, index) => {
          const neighborIds = getNeighborIds(node.id);
          const isSelected = selectedNodeId === node.id;
          const isHighlighted =
            selectedNodeId !== null && neighborIds.has(selectedNodeId ?? '');
          const isConnected = connectionCounts.get(node.id) ?? 0 > 0;
          const glossaryColor =
            node.glossaryId && glossaryColorMap[node.glossaryId]
              ? glossaryColorMap[node.glossaryId]
              : '#3062d4';

          const nodeData: OntologyNodeData = {
            node,
            isSelected,
            isHighlighted,
            isConnected,
            glossaryColor,
            onClick: (id) => {
              const n = nodesData.find((n) => n.id === id);
              if (n) {
                onNodeClick(n);
              }
            },
            onDoubleClick: (id) => {
              const n = nodesData.find((n) => n.id === id);
              if (n) {
                onNodeDoubleClick(n);
              }
            },
          };

          return {
            id: node.id,
            type: 'ontologyNode',
            position: {
              x: (index % 10) * (NODE_WIDTH + 50),
              y: Math.floor(index / 10) * (NODE_HEIGHT + 50),
            },
            data: nodeData,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
          };
        });
      }
    },
    [
      getLayoutOptions,
      getNeighborIds,
      selectedNodeId,
      connectionCounts,
      glossaryColorMap,
      onNodeClick,
      onNodeDoubleClick,
    ]
  );

  const createEdges = useCallback(
    (edgesData: MergedEdge[]): Edge[] => {
      return edgesData.map((edge, index) => {
        const isHighlighted =
          selectedNodeId === edge.from || selectedNodeId === edge.to;

        const edgeData: OntologyEdgeData = {
          relationType: edge.relationType,
          inverseRelationType: edge.inverseRelationType,
          isBidirectional: edge.isBidirectional,
          isHighlighted,
          showLabels: settings.showEdgeLabels,
          color: '',
        };

        return {
          id: `edge-${index}-${edge.from}-${edge.to}`,
          source: edge.from,
          target: edge.to,
          sourceHandle: 'center',
          targetHandle: 'center',
          type: 'ontologyEdge',
          data: edgeData,
        };
      });
    },
    [selectedNodeId, settings.showEdgeLabels]
  );

  useEffect(() => {
    const updateLayout = async () => {
      if (inputNodes.length === 0) {
        setNodes([]);
        setEdges([]);

        return;
      }

      setIsLayouting(true);

      try {
        const layoutedNodes = await layoutNodes(inputNodes, inputEdges);
        const flowEdges = createEdges(mergedEdges);

        setNodes(layoutedNodes);
        setEdges(flowEdges);

        setTimeout(() => {
          reactFlowInstance.current?.fitView({
            padding: 0.05,
            maxZoom: DEFAULT_ZOOM,
            duration: settings.animateTransitions ? 500 : 0,
          });
        }, 100);
      } finally {
        setIsLayouting(false);
      }
    };

    updateLayout();
  }, [
    inputNodes,
    inputEdges,
    mergedEdges,
    settings.layout,
    layoutNodes,
    createEdges,
    setNodes,
    setEdges,
    settings.animateTransitions,
  ]);

  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        const inputNode = inputNodes.find((n) => n.id === node.id);
        if (!inputNode) {
          return node;
        }

        const neighborIds = getNeighborIds(node.id);
        const isSelected = selectedNodeId === node.id;
        const isHighlighted =
          selectedNodeId !== null && neighborIds.has(selectedNodeId ?? '');

        return {
          ...node,
          data: {
            ...node.data,
            isSelected,
            isHighlighted,
          },
        };
      })
    );

    setEdges((eds) =>
      eds.map((edge) => {
        const isHighlighted =
          selectedNodeId === edge.source || selectedNodeId === edge.target;

        return {
          ...edge,
          data: {
            ...edge.data,
            isHighlighted,
          } as OntologyEdgeData,
        };
      })
    );
  }, [selectedNodeId, inputNodes, getNeighborIds, setNodes, setEdges]);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstance.current = instance;
  }, []);

  return (
    <div className="ontology-flow-container">
      <ReactFlow
        fitView
        edgeTypes={edgeTypes}
        edges={edges}
        maxZoom={MAX_ZOOM}
        minZoom={MIN_ZOOM}
        nodeTypes={nodeTypes}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={!isLayouting}
        proOptions={{ hideAttribution: true }}
        selectNodesOnDrag={false}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodesChange={onNodesChange}
        onPaneClick={handlePaneClick}
      >
        <Background color="#e5e7eb" gap={20} size={1} />

        {showMinimap && (
          <MiniMap
            pannable
            zoomable
            maskColor="rgba(0, 0, 0, 0.1)"
            nodeColor={(node) => {
              const data = node.data as OntologyNodeData;

              return data.glossaryColor || '#3062d4';
            }}
            position="bottom-right"
          />
        )}
      </ReactFlow>
    </div>
  );
};

export default OntologyGraph;
