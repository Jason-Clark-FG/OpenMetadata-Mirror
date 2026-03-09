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
import {
  CanvasEvent,
  ComboData,
  Graph,
  GraphData,
  IElementEvent,
  NodeData,
  NodeEvent,
} from '@antv/g6';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  DEFAULT_ZOOM,
  EDGE_STROKE_COLOR,
  MAX_ZOOM,
  MIN_ZOOM,
  NODE_BORDER_COLOR,
  NODE_BORDER_RADIUS,
  NODE_FILL_DEFAULT,
  NODE_LABEL_FILL,
  NODE_LABEL_FONT_SIZE,
  NODE_LABEL_FONT_WEIGHT,
  NODE_LABEL_PADDING,
  NODE_SHADOW_BLUR,
  NODE_SHADOW_COLOR,
  NODE_SHADOW_OFFSET_Y,
  TERM_LABEL_BG_PADDING,
} from '../OntologyExplorer.constants';
import { GraphSettings, OntologyNode } from '../OntologyExplorer.interface';
import { getLayoutConfig } from '../utils/graphConfig';
import {
  getCanvasColor,
  LABEL_PLACEMENT_BOTTOM,
  LABEL_PLACEMENT_CENTER,
} from '../utils/graphStyles';

const DATA_MODE_ASSET_CIRCLE_SIZE = 20;
const DATA_MODE_ASSET_LABEL_FONT_SIZE = 10;

/** Zoom-out factor applied after fitView so the graph always shows a zoomed-out view in every mode/layout. */
const FIT_VIEW_ZOOM_OUT = 0.6;

interface GraphNodeMeta {
  color?: string;
  assetColor?: string;
  label?: string;
  hierarchyBadge?: string;
  assetCount?: number;
  ontologyNode?: OntologyNode;
}

interface GraphEdgeMeta {
  isCrossTeam?: boolean;
  isHighlighted?: boolean;
  isClickedEdge?: boolean;
  edgeColor?: string;
}

interface GraphComboMeta {
  color?: string;
  glossaryName?: string;
}

interface UseOntologyGraphProps {
  containerRef: React.RefObject<HTMLDivElement>;
  graphData: GraphData;
  inputNodes: OntologyNode[];
  mergedEdgesList: Array<{ from: string; to: string; relationType: string }>;
  explorationMode: 'model' | 'data' | 'hierarchy';
  settings: GraphSettings;
  layoutType: string;
  focusNodeId?: string | null;
  selectedNodeId?: string | null;
  dataSignature?: string;
  showMinimap?: boolean;
  onNodeClick: (node: OntologyNode) => void;
  onNodeDoubleClick: (node: OntologyNode) => void;
  onNodeContextMenu: (
    node: OntologyNode,
    position: { x: number; y: number }
  ) => void;
  onPaneClick: () => void;
  setClickedEdgeId: (id: string | null) => void;
  neighborSet: Set<string>;
  glossaryColorMap: Record<string, string>;
  computeNodeColor: (node: OntologyNode) => string;
}

export function useOntologyGraph({
  containerRef,
  graphData,
  inputNodes,
  mergedEdgesList,
  explorationMode,
  settings,
  layoutType,
  focusNodeId,
  selectedNodeId,
  dataSignature,
  showMinimap,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
  onPaneClick,
  setClickedEdgeId,
  neighborSet,
  glossaryColorMap,
  computeNodeColor,
}: UseOntologyGraphProps) {
  const graphRef = useRef<Graph | null>(null);
  const settingsRef = useRef(settings);

  settingsRef.current = settings;

  const prevDataSignatureRef = useRef<string>('');
  const structuralFingerprintRef = useRef<string>('');
  const justInitializedRef = useRef<boolean>(false);
  const cancelPendingUpdateRef = useRef<(() => void) | null>(null);

  const setClickedEdgeIdRef = useRef(setClickedEdgeId);
  setClickedEdgeIdRef.current = setClickedEdgeId;

  const extractNodePositions = useCallback((): Record<
    string,
    { x: number; y: number }
  > => {
    const graph = graphRef.current;
    if (!graph) {
      return {};
    }
    const positions: Record<string, { x: number; y: number }> = {};
    graph.getNodeData().forEach((node) => {
      const pos = graph.getElementPosition(node.id);
      if (pos && Array.isArray(pos)) {
        const rawSize = node.style?.size;
        const sizeArr = Array.isArray(rawSize) ? rawSize : null;
        const w =
          (sizeArr ? Number(sizeArr[0]) : Number(node.style?.size) || 200) / 2;
        const h =
          (sizeArr ? Number(sizeArr[1]) : Number(node.style?.size) || 40) / 2;
        positions[node.id] = { x: pos[0] - w, y: pos[1] - h };
      }
    });

    return positions;
  }, []);

  const hasBakedPositions = useMemo(() => {
    const hierarchyWithBakedLayout =
      explorationMode === 'hierarchy' &&
      (layoutType === 'circular' || layoutType === 'radial');
    if (hierarchyWithBakedLayout) {
      return true;
    }
    if (explorationMode === 'hierarchy') {
      return false;
    }
    const distinctGlossaryIds = new Set(
      inputNodes.map((n) => n.glossaryId).filter(Boolean)
    );
    const hasGroupLayout =
      explorationMode !== 'data' && distinctGlossaryIds.size > 1;

    return hasGroupLayout || explorationMode === 'data';
  }, [inputNodes, explorationMode, layoutType]);

  useEffect(() => {
    if (!containerRef.current || inputNodes.length === 0) {
      return;
    }

    const container = containerRef.current;
    const width = container.offsetWidth || 800;
    const height = container.offsetHeight || 600;

    const graph = new Graph({
      container,
      width,
      height,
      data: graphData,
      zoomRange: [MIN_ZOOM, MAX_ZOOM],
      zoom: DEFAULT_ZOOM,
      theme: false,
      node: {
        type: 'rect',
        style: (datum: NodeData) => {
          const d = (datum.data ?? {}) as GraphNodeMeta;
          const nodeColor = d?.color;
          const assetColor = d?.assetColor;
          const ontNode = d?.ontologyNode;
          const isAsset =
            ontNode?.type === 'dataAsset' || ontNode?.type === 'metric';
          const isDataMd = explorationMode === 'data';
          const isTerm = isDataMd && !isAsset;

          if (isDataMd && isAsset) {
            const ac = assetColor ?? NODE_BORDER_COLOR;

            return {
              size: [DATA_MODE_ASSET_CIRCLE_SIZE, DATA_MODE_ASSET_CIRCLE_SIZE],
              zIndex: 2,
              fill: ac + '33',
              stroke: ac,
              lineWidth: 1.5,
              radius: DATA_MODE_ASSET_CIRCLE_SIZE / 2,
              icon: false,
              labelText: d?.label ?? datum.id,
              labelFill: NODE_LABEL_FILL,
              labelFontSize: DATA_MODE_ASSET_LABEL_FONT_SIZE,
              labelFontWeight: 500,
              labelPlacement: LABEL_PLACEMENT_BOTTOM,
              labelOffsetY: 10,
              shadowColor: NODE_SHADOW_COLOR,
              shadowBlur: NODE_SHADOW_BLUR,
              shadowOffsetY: NODE_SHADOW_OFFSET_Y,
            };
          }

          if (isTerm) {
            const tc = nodeColor ?? NODE_BORDER_COLOR;
            const assetCount = d?.assetCount ?? 0;
            const hasAssetBadge = assetCount > 0;

            return {
              size: [30, 30],
              zIndex: 2,
              fill: tc,
              stroke: 'none',
              lineWidth: 0,
              radius: 15,
              icon: false,
              labelText: d?.label ?? datum.id,
              labelFill: '#ffffff',
              labelFontSize: NODE_LABEL_FONT_SIZE,
              labelFontWeight: 600,
              labelPlacement: LABEL_PLACEMENT_BOTTOM,
              labelOffsetY: 10,
              labelBackground: true,
              labelBackgroundFill: tc,
              labelBackgroundStroke: 'none',
              labelBackgroundRadius: 6,
              labelPadding: TERM_LABEL_BG_PADDING,
              badge: hasAssetBadge,
              badges: hasAssetBadge
                ? [
                    {
                      text: String(assetCount),
                      placement: 'top-right',
                      offsetX: 8,
                      offsetY: -8,
                      textAlign: 'center',
                      fontSize: 10,
                      fontWeight: 600,
                      fill: '#ffffff',
                      background: true,
                      backgroundFill: getCanvasColor(tc, '#3b82f6'),
                      backgroundRadius: 10,
                      backgroundStroke: getCanvasColor(tc, '#3b82f6'),
                      backgroundLineWidth: 1,
                      padding: [2, 6, 2, 6],
                    },
                  ]
                : [],
              shadowColor: NODE_SHADOW_COLOR,
              shadowBlur: NODE_SHADOW_BLUR,
              shadowOffsetY: NODE_SHADOW_OFFSET_Y,
            };
          }

          const hasHierarchyBadge = Boolean(d?.hierarchyBadge);
          const badgeGlossaryId =
            ontNode?.originalGlossary ?? ontNode?.glossaryId;
          const badgeGlossaryColor = badgeGlossaryId
            ? glossaryColorMap[badgeGlossaryId] ?? NODE_BORDER_COLOR
            : NODE_BORDER_COLOR;
          const badgeColor = getCanvasColor(badgeGlossaryColor, '#3b82f6');
          const nodeBorderColor = hasHierarchyBadge
            ? badgeColor
            : NODE_BORDER_COLOR;

          return {
            zIndex: 2,
            fill: NODE_FILL_DEFAULT,
            stroke: nodeBorderColor,
            lineWidth: 1,
            radius: NODE_BORDER_RADIUS,
            icon: false,
            labelText: d?.label ?? datum.id,
            labelFill: NODE_LABEL_FILL,
            labelFontSize: NODE_LABEL_FONT_SIZE,
            labelFontWeight: NODE_LABEL_FONT_WEIGHT,
            labelPlacement: LABEL_PLACEMENT_CENTER,
            labelPadding: NODE_LABEL_PADDING,
            badge: hasHierarchyBadge,
            badges: hasHierarchyBadge
              ? [
                  {
                    text: String(d.hierarchyBadge ?? ''),
                    placement: 'top-left',
                    offsetX: 10,
                    offsetY: -18,
                    textAlign: 'left',
                    fontSize: 10,
                    fontWeight: 600,
                    fill: '#ffffff',
                    background: true,
                    backgroundFill: badgeColor,
                    backgroundRadius: [8, 8, 0, 0],
                    backgroundStroke: badgeColor,
                    backgroundLineWidth: 1,
                    padding: [4, 10, 4, 10],
                  },
                ]
              : [],
            shadowColor: NODE_SHADOW_COLOR,
            shadowBlur: NODE_SHADOW_BLUR,
            shadowOffsetY: NODE_SHADOW_OFFSET_Y,
          };
        },
      },
      edge: {
        type: 'cubic-vertical',
        animation: {
          enter: false,
        },
        style: (datum) => {
          const d = (datum.data ?? {}) as GraphEdgeMeta;
          const isCrossTeam = d?.isCrossTeam ?? false;
          const isHighlighted = d?.isHighlighted ?? false;
          const isClickedEdge = d?.isClickedEdge ?? false;
          const edgeColor = d?.edgeColor ?? EDGE_STROKE_COLOR;

          let edgeLineWidth = 1.5;
          if (isCrossTeam) {
            edgeLineWidth = 2;
          } else if (isHighlighted || isClickedEdge) {
            edgeLineWidth = 2.5;
          }

          const base = {
            zIndex: 1,
            stroke: edgeColor,
            lineWidth: edgeLineWidth,
            lineAppendWidth: 12,
            opacity: 1,
            endArrow: explorationMode !== 'data',
          };

          const merged = (
            datum.style ? { ...base, ...datum.style } : { ...base }
          ) as Record<string, unknown>;
          if (settingsRef.current.showEdgeLabels) {
            if (merged.labelText) {
              merged.label = true;
            }
          } else {
            merged.label = false;
            merged.labelText = '';
          }

          return merged;
        },
      },
      combo: {
        type: 'glossary-combo',
        style: (datum: ComboData) => {
          const d = (datum.data ?? {}) as GraphComboMeta;
          const color = d?.color ?? '#94a3b8';
          const glossaryName = d?.glossaryName ?? '';

          return {
            zIndex: 0,
            fill: '#ffffff',
            stroke: color,
            lineWidth: 0.8,
            radius: 10,
            padding: 48,
            label: true,
            labelText: glossaryName,
            labelFill: color,
            labelFontSize: 12,
            labelFontWeight: 500,
            labelPlacement: 'top-left',
            labelOffsetX: 13,
            labelOffsetY: 10,
            labelTextAlign: 'left',
          };
        },
      },
      layout: getLayoutConfig(
        layoutType,
        inputNodes.length,
        true,
        layoutType === 'radial'
          ? focusNodeId ?? selectedNodeId ?? undefined
          : undefined,
        explorationMode === 'data',
        explorationMode === 'hierarchy'
      ),
      behaviors: [
        { type: 'drag-canvas' },
        { type: 'zoom-canvas' },
        { type: 'drag-element' },
      ],
      plugins: showMinimap
        ? [
            {
              key: 'minimap',
              type: 'minimap',
              size: [180, 120],
              position: 'bottom-right',
            },
          ]
        : [],
    });

    graphRef.current = graph;
    justInitializedRef.current = true;
    structuralFingerprintRef.current = '';

    const resolveNodeForCallback = (node: OntologyNode): OntologyNode =>
      node.originalNode ?? node;

    const handleNodeClick = (e: IElementEvent) => {
      const id = e.target.id;
      if (id) {
        const node = inputNodes.find((n) => n.id === id);
        if (node) {
          onNodeClick(resolveNodeForCallback(node));
        }
      }
    };

    const handleNodeDblClick = (e: IElementEvent) => {
      const id = e.target.id;
      if (id) {
        const node = inputNodes.find((n) => n.id === id);
        if (node) {
          onNodeDoubleClick(resolveNodeForCallback(node));
        }
      }
    };

    const handleNodeContextMenu = (e: IElementEvent) => {
      e.preventDefault();
      const id = e.target.id;
      if (id) {
        const node = inputNodes.find((n) => n.id === id);
        if (node) {
          onNodeContextMenu(resolveNodeForCallback(node), {
            x: e.clientX ?? 0,
            y: e.clientY ?? 0,
          });
        }
      }
    };

    graph.on(NodeEvent.CLICK, handleNodeClick);
    graph.on(NodeEvent.DBLCLICK, handleNodeDblClick);
    graph.on(NodeEvent.CONTEXT_MENU, handleNodeContextMenu);
    graph.on(CanvasEvent.CLICK, () => {
      setClickedEdgeIdRef.current(null);
      onPaneClick();
    });

    const handleEdgeClick = (e: IElementEvent) => {
      setClickedEdgeIdRef.current(e.target.id ?? null);
    };
    graph.on('edge:click', handleEdgeClick);

    const runRender = async () => {
      if (hasBakedPositions) {
        await graph.draw();
      } else {
        await graph.render();
      }
      const duration = 0;
      if (inputNodes.length === 1) {
        await graph.fitCenter({ duration });
        await graph.zoomBy(FIT_VIEW_ZOOM_OUT, { duration });
      } else {
        await graph.fitView(undefined, { duration });
        await graph.zoomBy(FIT_VIEW_ZOOM_OUT, { duration });
      }
    };

    runRender();

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && graphRef.current) {
        graphRef.current.resize(
          containerRef.current.offsetWidth,
          containerRef.current.offsetHeight
        );
      }
    });
    resizeObserver.observe(container);

    return () => {
      if (cancelPendingUpdateRef.current) {
        cancelPendingUpdateRef.current();
        cancelPendingUpdateRef.current = null;
      }
      resizeObserver.disconnect();
      graph.off(NodeEvent.CLICK, handleNodeClick);
      graph.off(NodeEvent.DBLCLICK, handleNodeDblClick);
      graph.off(NodeEvent.CONTEXT_MENU, handleNodeContextMenu);
      graph.off(CanvasEvent.CLICK);
      graph.off('edge:click', handleEdgeClick);
      graph.destroy();
      graphRef.current = null;
    };
  }, [inputNodes.length, explorationMode]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || inputNodes.length === 0) {
      return;
    }

    if (justInitializedRef.current) {
      justInitializedRef.current = false;

      return;
    }

    const dataSignatureChanged = prevDataSignatureRef.current !== dataSignature;
    if (dataSignatureChanged) {
      prevDataSignatureRef.current = dataSignature ?? '';
    }

    const newFingerprint = [
      inputNodes.map((n) => n.id).join(','),
      mergedEdgesList.length.toString(),
      mergedEdgesList
        .map((e) => `${e.from}>${e.to}:${e.relationType}`)
        .join(','),
      layoutType,
      layoutType === 'radial' ? focusNodeId ?? selectedNodeId ?? '' : '',
      explorationMode,
    ].join('||');

    const structuralChanged =
      dataSignatureChanged ||
      newFingerprint !== structuralFingerprintRef.current;

    if (!structuralChanged) {
      // In-place UI update for node states without re-layout
      graph.updateNodeData(graphData.nodes ?? []);
      graph.updateEdgeData(graphData.edges ?? []);
      graph.draw();

      return;
    }

    structuralFingerprintRef.current = newFingerprint;

    const layoutOptions = getLayoutConfig(
      layoutType,
      inputNodes.length,
      true,
      focusNodeId ?? undefined,
      explorationMode === 'data',
      explorationMode === 'hierarchy'
    );

    if (cancelPendingUpdateRef.current) {
      cancelPendingUpdateRef.current();
    }
    let cancelled = false;
    cancelPendingUpdateRef.current = () => {
      cancelled = true;
    };

    const runUpdate = async () => {
      try {
        graph.stopLayout();
        if (cancelled) {
          return;
        }

        graph.setData(graphData);
        if (!hasBakedPositions) {
          graph.setLayout(layoutOptions);
          await graph.layout();
          if (cancelled) {
            return;
          }
        }
        graph.draw();

        if (cancelled) {
          return;
        }

        if (explorationMode !== 'data') {
          const duration = 0;
          if (inputNodes.length === 1) {
            await graph.fitCenter({ duration });
            await graph.zoomBy(FIT_VIEW_ZOOM_OUT, { duration });
          } else {
            await graph.fitView(undefined, { duration });
            await graph.zoomBy(FIT_VIEW_ZOOM_OUT, { duration });
          }
        }
      } finally {
        if (!cancelled) {
          cancelPendingUpdateRef.current = null;
        }
      }
    };

    runUpdate();
  }, [
    graphData,
    layoutType,
    inputNodes,
    mergedEdgesList,
    selectedNodeId,
    neighborSet,
    settings.showEdgeLabels,
    computeNodeColor,
    dataSignature,
    explorationMode,
    focusNodeId,
  ]);

  return { graphRef, extractNodePositions };
}
