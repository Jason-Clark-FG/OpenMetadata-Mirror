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
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
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
import GlossaryGroupNode, { GlossaryGroupNodeData } from './GlossaryGroupNode';
import OntologyEdge, { OntologyEdgeData } from './OntologyEdge';
import {
  GraphSettings,
  OntologyEdge as OntologyEdgeType,
  OntologyNode as OntologyNodeType,
} from './OntologyExplorer.interface';
import OntologyNode, { OntologyNodeData } from './OntologyNode';

const NODE_WIDTH = 200;
const GROUP_PADDING = 24;
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
  nodePositions?: Record<string, { x: number; y: number }>;
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

export interface OntologyGraphHandle {
  fitView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  runLayout: () => void;
  focusNode: (nodeId: string) => void;
  getNodePositions: () => Record<string, { x: number; y: number }>;
}

const nodeTypes: NodeTypes = {
  ontologyNode: OntologyNode,
  glossaryGroup: GlossaryGroupNode,
};

const edgeTypes: EdgeTypes = {
  ontologyEdge: OntologyEdge,
};

const OntologyGraph = forwardRef<OntologyGraphHandle, OntologyGraphProps>(
  (
    {
      nodes: inputNodes,
      edges: inputEdges,
      settings,
      nodePositions,
      selectedNodeId,
      glossaryColorMap,
      onNodeClick,
      onNodeDoubleClick,
      onNodeContextMenu,
      onPaneClick,
      showMinimap = false,
    },
    ref
  ) => {
    const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [isLayouting, setIsLayouting] = useState(false);
    const [runLayoutTrigger, setRunLayoutTrigger] = useState(0);

    const getLayoutOptions = useCallback(() => {
      switch (settings.layout) {
        case 'hierarchical':
          return layoutOptions;
        case 'radial':
        case 'circular':
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
        const pairKey = [edge.from, edge.to]
          .sort((a, b) => a.localeCompare(b))
          .join('::');

        if (processedPairs.has(pairKey)) {
          return;
        }

        const reverseEdge = edgeMap.get(reverseKey);
        const inverseRelation = INVERSE_RELATION_PAIRS[edge.relationType];
        const isSymmetric = SYMMETRIC_RELATIONS.has(edge.relationType);

        if (inverseRelation && reverseEdge?.relationType === inverseRelation) {
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

    const wrapInGlossaryGroups = useCallback(
      (termNodes: Node[], colorMap: Record<string, string>): Node[] => {
        const byGlossary = new Map<string, Node[]>();
        const ungrouped: Node[] = [];

        termNodes.forEach((node) => {
          if (node.type !== 'ontologyNode' || !node.data) {
            ungrouped.push(node);

            return;
          }
          const ontologyData = node.data as OntologyNodeData;
          const glossaryId = ontologyData.node.glossaryId;
          if (!glossaryId) {
            ungrouped.push(node);

            return;
          }
          const list = byGlossary.get(glossaryId) ?? [];
          list.push(node);
          byGlossary.set(glossaryId, list);
        });

        const groupNodes: Node[] = [];
        const groupedTerms: Node[] = [];

        byGlossary.forEach((nodesInGroup, glossaryId) => {
          if (nodesInGroup.length === 0) {
            return;
          }
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          nodesInGroup.forEach((n) => {
            const x = n.position?.x ?? 0;
            const y = n.position?.y ?? 0;
            const w = n.width ?? NODE_WIDTH;
            const h = n.height ?? NODE_HEIGHT;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w);
            maxY = Math.max(maxY, y + h);
          });
          const groupX = minX - GROUP_PADDING;
          const groupY = minY - GROUP_PADDING;
          const groupW = maxX - minX + 2 * GROUP_PADDING;
          const groupH = maxY - minY + 2 * GROUP_PADDING;

          const firstData = nodesInGroup[0].data as OntologyNodeData;
          const glossaryName = firstData.node.group ?? glossaryId;
          const groupColor = colorMap[glossaryId] ?? '#94a3b8';

          const groupId = `glossary-group-${glossaryId}`;
          const groupData: GlossaryGroupNodeData = {
            glossaryId,
            glossaryName,
            color: groupColor,
          };
          groupNodes.push({
            id: groupId,
            type: 'glossaryGroup',
            position: { x: groupX, y: groupY },
            data: groupData,
            width: groupW,
            height: groupH,
            style: { width: groupW, height: groupH },
            selectable: false,
            draggable: true,
            zIndex: 0,
          });

          nodesInGroup.forEach((n) => {
            const relX = (n.position?.x ?? 0) - groupX;
            const relY = (n.position?.y ?? 0) - groupY;
            groupedTerms.push({
              ...n,
              parentNode: groupId,
              extent: 'parent' as const,
              position: { x: relX, y: relY },
              zIndex: 2,
            });
          });
        });

        return [...groupNodes, ...ungrouped, ...groupedTerms];
      },
      []
    );

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
          onNodeContextMenu(ontologyNode, {
            x: event.clientX,
            y: event.clientY,
          });
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

        const nodeById = new Map(nodesData.map((n) => [n.id, n]));
        const handleClick = (id: string) => {
          const n = nodeById.get(id);
          if (n) {
            onNodeClick(n);
          }
        };
        const handleDoubleClick = (id: string) => {
          const n = nodeById.get(id);
          if (n) {
            onNodeDoubleClick(n);
          }
        };

        try {
          const layoutedGraph = await elk.layout(graph);
          const layoutedById = new Map(
            (layoutedGraph.children ?? []).map((n) => [n.id, n])
          );

          return nodesData.map((node) => {
            const layoutedNode = layoutedById.get(node.id);
            const neighborIds = getNeighborIds(node.id);
            const isSelected = selectedNodeId === node.id;
            const isHighlighted =
              selectedNodeId !== null && neighborIds.has(selectedNodeId ?? '');
            const isConnected = (connectionCounts.get(node.id) ?? 0) > 0;
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
              onClick: handleClick,
              onDoubleClick: handleDoubleClick,
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
            const isConnected = (connectionCounts.get(node.id) ?? 0) > 0;
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
              onClick: handleClick,
              onDoubleClick: handleDoubleClick,
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

    const layoutNodesWithHulls = useCallback(
      async (
        nodesData: OntologyNodeType[],
        edgesData: OntologyEdgeType[]
      ): Promise<Node[]> => {
        // Group nodes by glossary
        const byGlossary = new Map<string, OntologyNodeType[]>();
        const ungroupedData: OntologyNodeType[] = [];
        nodesData.forEach((node) => {
          if (node.glossaryId) {
            const list = byGlossary.get(node.glossaryId) ?? [];
            list.push(node);
            byGlossary.set(node.glossaryId, list);
          } else {
            ungroupedData.push(node);
          }
        });

        // Split edges into intra-group (same glossary) and cross-group
        const nodeToGlossary = new Map(
          nodesData.map((n) => [n.id, n.glossaryId])
        );
        const intraByGlossary = new Map<string, OntologyEdgeType[]>();
        const crossEdgesList: OntologyEdgeType[] = [];
        edgesData.forEach((edge) => {
          const fromG = nodeToGlossary.get(edge.from);
          const toG = nodeToGlossary.get(edge.to);
          if (fromG && fromG === toG) {
            const list = intraByGlossary.get(fromG) ?? [];
            list.push(edge);
            intraByGlossary.set(fromG, list);
          } else {
            crossEdgesList.push(edge);
          }
        });

        // Build ELK compound graph: each glossary is a compound node
        const topPadding = GROUP_PADDING + 22; // extra room for glossary label
        const elkChildren: ElkNode[] = [];
        byGlossary.forEach((terms, glossaryId) => {
          const intraEdges = intraByGlossary.get(glossaryId) ?? [];
          elkChildren.push({
            id: `glossary-group-${glossaryId}`,
            layoutOptions: {
              'elk.algorithm': 'layered',
              'elk.direction': 'RIGHT',
              'elk.spacing.nodeNode': '60',
              'elk.layered.spacing.nodeNodeBetweenLayers': '80',
              'elk.padding': `[top=${topPadding},left=${GROUP_PADDING},bottom=${GROUP_PADDING},right=${GROUP_PADDING}]`,
            },
            children: terms.map((t) => ({
              id: t.id,
              width: NODE_WIDTH,
              height: NODE_HEIGHT,
            })),
            edges: intraEdges.map((e, i) => ({
              id: `intra-${glossaryId}-${i}`,
              sources: [e.from],
              targets: [e.to],
            })),
          });
        });
        ungroupedData.forEach((node) => {
          elkChildren.push({
            id: node.id,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
          });
        });

        const elkEdges: ElkExtendedEdge[] = crossEdgesList.map((edge, i) => ({
          id: `cross-${i}`,
          sources: [edge.from],
          targets: [edge.to],
        }));

        const graph: ElkNode = {
          id: 'root',
          layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': 'RIGHT',
            'elk.spacing.nodeNode': '120',
            'elk.layered.spacing.nodeNodeBetweenLayers': '160',
            'elk.separateConnectedComponents': 'false',
          },
          children: elkChildren,
          edges: elkEdges,
        };

        const nodeById = new Map(nodesData.map((n) => [n.id, n]));
        const handleClick = (id: string) => {
          const n = nodeById.get(id);
          if (n) {
            onNodeClick(n);
          }
        };
        const handleDoubleClick = (id: string) => {
          const n = nodeById.get(id);
          if (n) {
            onNodeDoubleClick(n);
          }
        };

        try {
          const layoutedGraph = await elk.layout(graph);
          const groupNodes: Node[] = [];
          const termNodes: Node[] = [];

          layoutedGraph.children?.forEach((elkNode) => {
            if (elkNode.id.startsWith('glossary-group-')) {
              const glossaryId = elkNode.id.replace('glossary-group-', '');
              const groupW = elkNode.width ?? 200;
              const groupH = elkNode.height ?? 100;
              const firstTerm = byGlossary.get(glossaryId)?.[0];
              const glossaryName = firstTerm?.group ?? glossaryId;
              const groupColor = glossaryColorMap[glossaryId] ?? '#94a3b8';

              groupNodes.push({
                id: elkNode.id,
                type: 'glossaryGroup',
                position: { x: elkNode.x ?? 0, y: elkNode.y ?? 0 },
                data: {
                  glossaryId,
                  glossaryName,
                  color: groupColor,
                } as GlossaryGroupNodeData,
                width: groupW,
                height: groupH,
                style: { width: groupW, height: groupH },
                selectable: false,
                draggable: true,
                zIndex: 0,
              });

              elkNode.children?.forEach((child) => {
                const ontNode = nodeById.get(child.id);
                if (!ontNode) {
                  return;
                }
                const neighborIds = getNeighborIds(ontNode.id);
                const isSelected = selectedNodeId === ontNode.id;
                const isHighlighted =
                  selectedNodeId !== null &&
                  neighborIds.has(selectedNodeId ?? '');
                const isConnected = (connectionCounts.get(ontNode.id) ?? 0) > 0;
                const nodeGlossaryColor =
                  ontNode.glossaryId && glossaryColorMap[ontNode.glossaryId]
                    ? glossaryColorMap[ontNode.glossaryId]
                    : '#3062d4';

                termNodes.push({
                  id: child.id,
                  type: 'ontologyNode',
                  position: { x: child.x ?? 0, y: child.y ?? 0 },
                  parentNode: elkNode.id,
                  extent: 'parent' as const,
                  data: {
                    node: ontNode,
                    isSelected,
                    isHighlighted,
                    isConnected,
                    glossaryColor: nodeGlossaryColor,
                    onClick: handleClick,
                    onDoubleClick: handleDoubleClick,
                  } as OntologyNodeData,
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT,
                  zIndex: 2,
                });
              });
            } else {
              const ontNode = nodeById.get(elkNode.id);
              if (!ontNode) {
                return;
              }
              const neighborIds = getNeighborIds(ontNode.id);
              const isSelected = selectedNodeId === ontNode.id;
              const isHighlighted =
                selectedNodeId !== null &&
                neighborIds.has(selectedNodeId ?? '');
              const isConnected = (connectionCounts.get(ontNode.id) ?? 0) > 0;
              const nodeGlossaryColor =
                ontNode.glossaryId && glossaryColorMap[ontNode.glossaryId]
                  ? glossaryColorMap[ontNode.glossaryId]
                  : '#3062d4';

              termNodes.push({
                id: elkNode.id,
                type: 'ontologyNode',
                position: { x: elkNode.x ?? 0, y: elkNode.y ?? 0 },
                data: {
                  node: ontNode,
                  isSelected,
                  isHighlighted,
                  isConnected,
                  glossaryColor: nodeGlossaryColor,
                  onClick: handleClick,
                  onDoubleClick: handleDoubleClick,
                } as OntologyNodeData,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
              });
            }
          });

          // Group nodes must precede their children in the React Flow array
          return [...groupNodes, ...termNodes];
        } catch {
          return layoutNodes(nodesData, edgesData);
        }
      },
      [
        getNeighborIds,
        selectedNodeId,
        connectionCounts,
        glossaryColorMap,
        onNodeClick,
        onNodeDoubleClick,
        layoutNodes,
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

    const buildNodesWithPositions = useCallback(
      (
        nodesData: OntologyNodeType[],
        positions: Record<string, { x: number; y: number }>
      ): Node[] => {
        const nodeById = new Map(nodesData.map((n) => [n.id, n]));
        const handleClick = (id: string) => {
          const n = nodeById.get(id);
          if (n) {
            onNodeClick(n);
          }
        };
        const handleDoubleClick = (id: string) => {
          const n = nodeById.get(id);
          if (n) {
            onNodeDoubleClick(n);
          }
        };

        return nodesData.map((node) => {
          const pos = positions[node.id] ?? { x: 0, y: 0 };
          const neighborIds = getNeighborIds(node.id);
          const isSelected = selectedNodeId === node.id;
          const isHighlighted =
            selectedNodeId !== null && neighborIds.has(selectedNodeId ?? '');
          const isConnected = (connectionCounts.get(node.id) ?? 0) > 0;
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
            onClick: handleClick,
            onDoubleClick: handleDoubleClick,
          };

          return {
            id: node.id,
            type: 'ontologyNode',
            position: pos,
            data: nodeData,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
          };
        });
      },
      [
        getNeighborIds,
        selectedNodeId,
        connectionCounts,
        glossaryColorMap,
        onNodeClick,
        onNodeDoubleClick,
      ]
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
          const hasSavedPositions =
            runLayoutTrigger === 0 &&
            nodePositions &&
            Object.keys(nodePositions).length > 0;
          const flowEdges = createEdges(mergedEdges);

          if (hasSavedPositions) {
            const positionedNodes = buildNodesWithPositions(
              inputNodes,
              nodePositions ?? {}
            );
            setNodes(
              settings.showGlossaryHulls
                ? wrapInGlossaryGroups(positionedNodes, glossaryColorMap)
                : positionedNodes
            );
            setEdges(flowEdges);
          } else {
            const layoutedNodes = settings.showGlossaryHulls
              ? await layoutNodesWithHulls(inputNodes, inputEdges)
              : await layoutNodes(inputNodes, inputEdges);
            setNodes(layoutedNodes);
            setEdges(flowEdges);
          }

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
      settings.animateTransitions,
      settings.showGlossaryHulls,
      layoutNodes,
      layoutNodesWithHulls,
      createEdges,
      buildNodesWithPositions,
      wrapInGlossaryGroups,
      glossaryColorMap,
      setNodes,
      setEdges,
      nodePositions,
      runLayoutTrigger,
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

    useImperativeHandle(
      ref,
      () => ({
        fitView: () => {
          reactFlowInstance.current?.fitView({
            padding: 0.05,
            maxZoom: DEFAULT_ZOOM,
            duration: settings.animateTransitions ? 400 : 0,
          });
        },
        zoomIn: () => {
          reactFlowInstance.current?.zoomIn();
        },
        zoomOut: () => {
          reactFlowInstance.current?.zoomOut();
        },
        runLayout: () => {
          setRunLayoutTrigger((t) => t + 1);
        },
        focusNode: (nodeId: string) => {
          const instance = reactFlowInstance.current;
          if (!instance) {
            return;
          }
          const flowNodes = instance.getNodes();
          const byId = new Map(flowNodes.map((n) => [n.id, n]));
          const node = byId.get(nodeId);
          if (!node?.position) {
            return;
          }
          let x = node.position.x;
          let y = node.position.y;
          if (node.parentNode) {
            const parent = byId.get(node.parentNode);
            if (parent?.position) {
              x += parent.position.x;
              y += parent.position.y;
            }
          }
          const nodeW = node.width ?? NODE_WIDTH;
          const nodeH = node.height ?? NODE_HEIGHT;
          instance.setCenter(x + nodeW / 2, y + nodeH / 2, {
            zoom: 1.2,
            duration: settings.animateTransitions ? 400 : 0,
          });
        },
        getNodePositions: () => {
          const flowNodes = reactFlowInstance.current?.getNodes() ?? [];
          const byId = new Map(flowNodes.map((n) => [n.id, n]));
          const positions: Record<string, { x: number; y: number }> = {};
          flowNodes.forEach((n) => {
            if (n.type === 'glossaryGroup') {
              return;
            }
            let x = n.position?.x ?? 0;
            let y = n.position?.y ?? 0;
            if (n.parentNode) {
              const parent = byId.get(n.parentNode);
              if (parent?.position) {
                x += parent.position.x;
                y += parent.position.y;
              }
            }
            positions[n.id] = { x, y };
          });

          return positions;
        },
      }),
      [settings.animateTransitions]
    );

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
          onPaneClick={handlePaneClick}>
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
  }
);

OntologyGraph.displayName = 'OntologyGraph';

export default OntologyGraph;
