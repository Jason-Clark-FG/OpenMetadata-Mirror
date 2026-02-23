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

import cytoscape, {
  Core,
  EventObject,
  LayoutOptions,
  NodeSingular,
  StylesheetStyle,
} from 'cytoscape';
import fcose from 'cytoscape-fcose';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import {
  GraphSettings,
  OntologyEdge,
  OntologyNode,
} from './OntologyExplorer.interface';

cytoscape.use(fcose);

const RELATION_COLORS: Record<string, string> = {
  relatedTo: '#3062d4',
  related: '#3062d4',
  synonym: '#7c3aed',
  antonym: '#dc2626',
  typeOf: '#059669',
  hasTypes: '#10b981',
  hasA: '#0891b2',
  partOf: '#0d9488',
  hasPart: '#14b8a6',
  componentOf: '#0891b2',
  composedOf: '#06b6d4',
  calculatedFrom: '#d97706',
  usedToCalculate: '#f59e0b',
  derivedFrom: '#ea580c',
  seeAlso: '#be185d',
  parentOf: '#4f46e5',
  childOf: '#6366f1',
  broader: '#4f46e5',
  narrower: '#6366f1',
  isA: '#059669',
  instanceOf: '#10b981',
  owns: '#7c3aed',
  ownedBy: '#8b5cf6',
  manages: '#3062d4',
  managedBy: '#3b82f6',
  contains: '#0891b2',
  containedIn: '#06b6d4',
  dependsOn: '#dc2626',
  usedBy: '#d97706',
  metricFor: '#0ea5e9',
  hasGlossaryTerm: '#0f766e',
  default: '#6b7280',
};

const METRIC_NODE_TYPE = 'metric';
const METRIC_COLOR = '#0ea5e9';
const ASSET_NODE_TYPE = 'dataAsset';
const ASSET_COLOR = '#0f766e';

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

export interface CytoscapeGraphProps {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
  settings: GraphSettings;
  nodePositions?: Record<string, { x: number; y: number }>;
  selectedNodeId?: string | null;
  glossaryColorMap: Record<string, string>;
  onNodeClick: (node: OntologyNode) => void;
  onNodeDoubleClick: (node: OntologyNode) => void;
  onNodeContextMenu: (
    node: OntologyNode,
    position: { x: number; y: number }
  ) => void;
  onPaneClick: () => void;
}

export interface CytoscapeGraphHandle {
  fitView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  runLayout: () => void;
  focusNode: (nodeId: string) => void;
  getNodePositions: () => Record<string, { x: number; y: number }>;
}

interface MergedEdge {
  from: string;
  to: string;
  relationType: string;
  inverseRelationType?: string;
  isBidirectional: boolean;
}

const CytoscapeGraph = forwardRef<CytoscapeGraphHandle, CytoscapeGraphProps>(
  (
    {
      nodes,
      edges,
      settings,
      nodePositions,
      selectedNodeId,
      glossaryColorMap,
      onNodeClick,
      onNodeDoubleClick,
      onNodeContextMenu,
      onPaneClick,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<Core | null>(null);
    const nodesMapRef = useRef<Map<string, OntologyNode>>(new Map());
    const getLayoutConfigRef = useRef<() => LayoutOptions>(() => ({
      name: 'fcose',
    }));

    useImperativeHandle(
      ref,
      () => ({
        fitView: () => {
          if (cyRef.current) {
            cyRef.current.fit(undefined, 80);
          }
        },
        zoomIn: () => {
          const cy = cyRef.current;
          if (cy) {
            cy.zoom(Math.min(cy.zoom() * 1.3, cy.maxZoom()));
            cy.center();
          }
        },
        zoomOut: () => {
          const cy = cyRef.current;
          if (cy) {
            cy.zoom(Math.max(cy.zoom() / 1.3, cy.minZoom()));
            cy.center();
          }
        },
        runLayout: () => {
          const cy = cyRef.current;
          if (cy && cy.nodes().length > 0) {
            const layout = cy.layout(getLayoutConfigRef.current());
            layout.run();
            layout.on('layoutstop', () => cy.fit(undefined, 50));
          }
        },
        focusNode: (nodeId: string) => {
          if (!cyRef.current) {
            return;
          }
          const target = cyRef.current.$id(nodeId);
          if (target && target.length > 0) {
            target.select();
            cyRef.current.animate(
              {
                center: { eles: target },
                zoom: 1.2,
              },
              {
                duration: settings.animateTransitions ? 400 : 0,
              }
            );
          }
        },
        getNodePositions: () => {
          const cy = cyRef.current;
          if (!cy) {
            return {};
          }
          const positions: Record<string, { x: number; y: number }> = {};
          cy.nodes().forEach((node) => {
            const position = node.position();
            positions[node.id()] = { x: position.x, y: position.y };
          });

          return positions;
        },
      }),
      [settings.animateTransitions]
    );

    const mergedEdges = useMemo((): MergedEdge[] => {
      const edgeMap = new Map<string, OntologyEdge>();
      const processedPairs = new Set<string>();
      const result: MergedEdge[] = [];

      edges.forEach((edge) => {
        const key = `${edge.from}->${edge.to}`;
        edgeMap.set(key, edge);
      });

      edges.forEach((edge) => {
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
          result.push({
            from: edge.from,
            to: edge.to,
            relationType: edge.relationType,
            isBidirectional: false,
          });
        }
      });

      return result;
    }, [edges]);

    const cytoscapeElements = useMemo(() => {
      nodesMapRef.current.clear();
      const nodeById = new Map<string, OntologyNode>();
      const glossaryGroups = new Map<
        string,
        { id: string; label: string; color: string }
      >();
      nodes.forEach((node) => {
        nodesMapRef.current.set(node.id, node);
        nodeById.set(node.id, node);
        if (settings.showGlossaryHulls && node.glossaryId) {
          const glossaryGroupId = `glossary-${node.glossaryId}`;
          if (!glossaryGroups.has(glossaryGroupId)) {
            glossaryGroups.set(glossaryGroupId, {
              id: glossaryGroupId,
              label: node.group ?? 'Glossary',
              color:
                glossaryColorMap[node.glossaryId] ?? RELATION_COLORS.default,
            });
          }
        }
      });

      // Calculate grid positions for deterministic initial layout
      const cols = Math.ceil(Math.sqrt(nodes.length));
      const spacing = 350;

      const cyNodes = nodes.map((node, index) => {
        const glossaryColor =
          node.type === METRIC_NODE_TYPE
            ? METRIC_COLOR
            : node.type === ASSET_NODE_TYPE
            ? ASSET_COLOR
            : node.glossaryId && glossaryColorMap[node.glossaryId]
            ? glossaryColorMap[node.glossaryId]
            : '#3062d4';

        // Grid-based initial position for deterministic layout
        const row = Math.floor(index / cols);
        const col = index % cols;

        const nodeLabel =
          node.originalLabel || node.label || node.id || 'Unknown';

        const savedPosition = nodePositions?.[node.id];

        return {
          data: {
            id: node.id,
            label: String(nodeLabel),
            type: node.type,
            glossaryColor,
            group: node.group,
            parent:
              settings.showGlossaryHulls && node.glossaryId
                ? `glossary-${node.glossaryId}`
                : undefined,
          },
          position: {
            x: savedPosition?.x ?? col * spacing,
            y: savedPosition?.y ?? row * spacing,
          },
        };
      });

      const glossaryGroupNodes = settings.showGlossaryHulls
        ? Array.from(glossaryGroups.values()).map((group) => ({
            data: {
              id: group.id,
              label: group.label,
              type: 'glossaryGroup',
              glossaryColor: group.color,
            },
          }))
        : [];

      const cyEdges = mergedEdges.map((edge, index) => {
        const color =
          RELATION_COLORS[edge.relationType] ?? RELATION_COLORS.default;
        const fromGlossary = nodeById.get(edge.from)?.glossaryId;
        const toGlossary = nodeById.get(edge.to)?.glossaryId;
        const isCrossGlossary =
          !!fromGlossary && !!toGlossary && fromGlossary !== toGlossary;

        return {
          data: {
            id: `edge-${index}-${edge.from}-${edge.to}`,
            source: edge.from,
            target: edge.to,
            relationType: edge.relationType,
            inverseRelationType: edge.inverseRelationType,
            isBidirectional: edge.isBidirectional,
            isCrossGlossary,
            color,
            label:
              edge.isBidirectional && edge.inverseRelationType
                ? `${edge.relationType} / ${edge.inverseRelationType}`
                : edge.relationType,
          },
        };
      });

      return [...glossaryGroupNodes, ...cyNodes, ...cyEdges];
    }, [
      nodes,
      mergedEdges,
      glossaryColorMap,
      settings.showGlossaryHulls,
      nodePositions,
    ]);

    const getStylesheet = useCallback((): StylesheetStyle[] => {
      return [
        {
          selector: 'node',
          style: {
            'background-color': '#ffffff',
            'border-width': 2,
            'border-color': 'data(glossaryColor)',
            label: 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '12px',
            'font-family':
              'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: '#1f2937',
            'text-wrap': 'ellipsis',
            'text-max-width': '140px',
            width: '160px',
            height: '50px',
            shape: 'roundrectangle',
            'text-outline-color': '#ffffff',
            'text-outline-width': 1,
          },
        },
        {
          selector: 'node[type = "glossary"]',
          style: {
            'background-color': 'data(glossaryColor)',
            color: '#ffffff',
            'font-weight': 'bold',
            'text-outline-color': 'data(glossaryColor)',
            'text-outline-width': 1,
          },
        },
        {
          selector: 'node[type = "metric"]',
          style: {
            'background-color': '#f0f9ff',
            'border-color': METRIC_COLOR,
            'border-width': 2,
            color: '#0f172a',
            'font-weight': 600,
            width: '140px',
            height: '44px',
            shape: 'roundrectangle',
          },
        },
        {
          selector: 'node[type = "dataAsset"]',
          style: {
            'background-color': '#f0fdfa',
            'border-color': ASSET_COLOR,
            'border-width': 2,
            color: '#0f172a',
            'font-weight': 600,
            width: '160px',
            height: '44px',
            shape: 'roundrectangle',
          },
        },
        {
          selector: 'node[type = "glossaryGroup"]',
          style: {
            'background-color': 'data(glossaryColor)',
            'background-opacity': 0.08,
            'border-color': 'data(glossaryColor)',
            'border-width': 1,
            shape: 'roundrectangle',
            label: 'data(label)',
            'text-valign': 'top',
            'text-halign': 'left',
            'text-margin-x': 8,
            'text-margin-y': 6,
            'font-size': '11px',
            color: '#374151',
            padding: '16px',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': 'data(glossaryColor)',
            'background-color': '#f0f9ff',
          },
        },
        {
          selector: 'node.highlighted',
          style: {
            'border-width': 2,
            'border-color': 'data(glossaryColor)',
            'background-opacity': 0.9,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'triangle',
            'curve-style': settings.edgeBundling ? 'bezier' : 'straight',
            'control-point-step-size': settings.edgeBundling ? 40 : undefined,
            'arrow-scale': 0.8,
            opacity: 0.7,
          },
        },
        {
          selector: 'edge[isCrossGlossary]',
          style: {
            opacity: 0.55,
            width: 1.2,
          },
        },
        {
          selector: 'edge[isBidirectional]',
          style: {
            'source-arrow-color': 'data(color)',
            'source-arrow-shape': 'triangle',
          },
        },
        {
          selector: 'edge:selected',
          style: {
            width: 2.5,
            opacity: 1,
            label: settings.showEdgeLabels ? 'data(label)' : '',
            'font-size': '9px',
            'text-rotation': 'autorotate',
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.9,
            'text-background-padding': '2px',
          },
        },
        {
          selector: 'edge.highlighted',
          style: {
            width: 2,
            opacity: 1,
            label: settings.showEdgeLabels ? 'data(label)' : '',
            'font-size': '9px',
            'text-rotation': 'autorotate',
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.9,
            'text-background-padding': '2px',
          },
        },
      ];
    }, [settings.showEdgeLabels, settings.edgeBundling]);

    const getLayoutConfig = useCallback(() => {
      if (nodePositions && Object.keys(nodePositions).length > 0) {
        return {
          name: 'preset',
          fit: true,
          padding: 80,
        };
      }

      switch (settings.layout) {
        case 'hierarchical':
          return {
            name: 'breadthfirst',
            directed: true,
            spacingFactor: 2.5,
            avoidOverlap: true,
            nodeDimensionsIncludeLabels: true,
            padding: 80,
            grid: false,
          };
        case 'radial':
          return {
            name: 'concentric',
            spacingFactor: 2.5,
            avoidOverlap: true,
            nodeDimensionsIncludeLabels: true,
            concentric: (node: NodeSingular) => node.degree(),
            levelWidth: () => 3,
            minNodeSpacing: 100,
          };
        case 'circular':
          return {
            name: 'circle',
            padding: 80,
            avoidOverlap: true,
            nodeDimensionsIncludeLabels: true,
          };
        case 'force':
        default:
          return {
            name: 'fcose',
            quality: 'proof',
            randomize: false,
            animate: settings.animateTransitions,
            animationDuration: 500,
            fit: true,
            padding: 80,
            nodeDimensionsIncludeLabels: true,
            uniformNodeDimensions: true,
            packComponents: false,
            nodeRepulsion: 15000,
            idealEdgeLength: 250,
            edgeElasticity: 0.1,
            nestingFactor: 0.1,
            gravity: 0.05,
            gravityRange: 1.5,
            gravityCompound: 0.5,
            gravityRangeCompound: 1.0,
            numIter: 5000,
            tile: false,
            nodeSeparation: 150,
          };
      }
    }, [settings.layout, settings.animateTransitions, nodePositions]);

    useEffect(() => {
      getLayoutConfigRef.current = getLayoutConfig;
    }, [getLayoutConfig]);

    useEffect(() => {
      if (!containerRef.current) {
        return;
      }

      const layoutConfig = getLayoutConfig();

      const cy = cytoscape({
        container: containerRef.current,
        elements: cytoscapeElements,
        style: getStylesheet(),
        layout: {
          ...layoutConfig,
          stop: () => {
            cy.fit(undefined, 50);
          },
        },
        minZoom: 0.3,
        maxZoom: 2,
        wheelSensitivity: 0.3,
        boxSelectionEnabled: false,
      });

      cyRef.current = cy;

      cy.ready(() => {
        cy.resize();
      });

      cy.on('tap', 'node', (evt: EventObject) => {
        const nodeId = evt.target.id();
        const node = nodesMapRef.current.get(nodeId);
        if (node) {
          onNodeClick(node);
        }
      });

      cy.on('dbltap', 'node', (evt: EventObject) => {
        const nodeId = evt.target.id();
        const node = nodesMapRef.current.get(nodeId);
        if (node) {
          onNodeDoubleClick(node);
        }
      });

      cy.on('cxttap', 'node', (evt: EventObject) => {
        const nodeId = evt.target.id();
        const node = nodesMapRef.current.get(nodeId);
        if (node) {
          const position = evt.renderedPosition;
          onNodeContextMenu(node, { x: position.x, y: position.y });
        }
      });

      cy.on('tap', (evt: EventObject) => {
        if (evt.target === cy) {
          onPaneClick();
        }
      });

      return () => {
        cy.destroy();
        cyRef.current = null;
      };
    }, [cytoscapeElements, getStylesheet, getLayoutConfig]);

    useEffect(() => {
      const cy = cyRef.current;
      if (!cy) {
        return;
      }

      cy.nodes().removeClass('highlighted');
      cy.edges().removeClass('highlighted');

      if (selectedNodeId) {
        const selectedNode = cy.getElementById(selectedNodeId);
        if (selectedNode.length) {
          selectedNode.select();

          const connectedEdges = selectedNode.connectedEdges();
          const connectedNodes = selectedNode.neighborhood('node');

          connectedEdges.addClass('highlighted');
          connectedNodes.addClass('highlighted');
        }
      } else {
        cy.nodes().unselect();
        cy.edges().unselect();
      }
    }, [selectedNodeId]);

    useEffect(() => {
      const cy = cyRef.current;
      if (!cy) {
        return;
      }

      cy.style(getStylesheet());
    }, [settings.showEdgeLabels, getStylesheet]);

    useEffect(() => {
      const cy = cyRef.current;
      if (!cy || nodes.length === 0) {
        return;
      }

      if (nodePositions && Object.keys(nodePositions).length > 0) {
        return;
      }

      const layoutConfig = getLayoutConfig();
      const layout = cy.layout(layoutConfig);
      layout.run();

      layout.on('layoutstop', () => {
        cy.fit(undefined, 50);
      });
    }, [settings.layout, getLayoutConfig, nodes.length, nodePositions]);

    return (
      <div
        className="ontology-cytoscape-container"
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
      />
    );
  }
);

export default CytoscapeGraph;
