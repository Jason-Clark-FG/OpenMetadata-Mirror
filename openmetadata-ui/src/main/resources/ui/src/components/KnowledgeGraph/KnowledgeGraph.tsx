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

import {
  AimOutlined,
  FullscreenOutlined,
  ReloadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import {
  EdgeData as G6EdgeData,
  ExtensionCategory,
  Graph,
  IElementEvent,
  NodeData as G6NodeData,
  NodePortStyleProps,
  register,
} from '@antv/g6';
import { ReactNode as AntVReactNode } from '@antv/g6-extension-react';
import {
  Button,
  Divider,
  Empty,
  Radio,
  RadioProps,
  Slider,
  Space,
  Spin,
  Tooltip,
  Typography,
} from 'antd';
import { AxiosError } from 'axios';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EntityType } from '../../enums/entity.enum';
import { getEntityGraphData } from '../../rest/rdfAPI';
import { getEntityLinkFromType } from '../../utils/EntityUtils';
import {
  computeRadialPositions,
  findHighlightPath,
  MAX_NODE_WIDTH,
  NODE_HEIGHT,
  NODE_WIDTH,
  transformToG6Format,
} from '../../utils/KnowledgeGraph.utils';
import { showErrorToast } from '../../utils/ToastUtils';
import EntitySummaryPanel from '../Explore/EntitySummaryPanel/EntitySummaryPanel.component';
import { SearchSourceDetails } from '../Explore/EntitySummaryPanel/EntitySummaryPanel.interface';
import CustomNode from './GraphElements/CustomNode';
import {
  GraphData,
  GraphNode,
  KnowledgeGraphProps,
} from './KnowledgeGraph.interface';
import './KnowledgeGraph.style.less';
import KnowledgeGraphNodeDetails from './KnowledgeGraphNodeDetails';

register(ExtensionCategory.NODE, 'react-node', AntVReactNode);

const ENTITY_UUID_REGEX = /\/([a-f0-9-]{36})$/;

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  entity,
  entityType,
  depth = 1,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Graph | null>(null);
  const [loading, setLoading] = useState(true);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [selectedDepth, setSelectedDepth] = useState(depth);
  const [layout, setLayout] = useState<'dagre' | 'radial'>('dagre');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const fetchGraphData = useCallback(async () => {
    if (!entity?.id) {
      return;
    }

    setLoading(true);
    try {
      const data = await getEntityGraphData(
        entity.id,
        entityType,
        selectedDepth
      );
      setGraphData(data);
    } catch (error) {
      showErrorToast(
        error as AxiosError,
        t('server.entity-fetch-error', { entity: t('label.graph') })
      );
    } finally {
      setLoading(false);
    }
  }, [entity?.id, entityType, selectedDepth, t]);

  const renderNode = useCallback(
    (data: G6NodeData) => <CustomNode nodeData={data} />,
    []
  );

  const handleFit = () => {
    if (networkRef.current) {
      void networkRef.current.fitView();
    }
  };

  const handleLayoutChange: RadioProps['onChange'] = ({ target }) => {
    setLayout(target.value);
  };

  const handleDepthChange = (value: number) => {
    setSelectedDepth(value);
  };

  const handleZoomIn = () => {
    if (networkRef.current) {
      const currentZoom = networkRef.current.getZoom();
      void networkRef.current.zoomTo(currentZoom * 1.2, {
        duration: 300,
        easing: 'easeCubic',
      });
    }
  };

  const handleZoomOut = () => {
    if (networkRef.current) {
      const currentZoom = networkRef.current.getZoom();
      void networkRef.current.zoomTo(currentZoom * 0.8, {
        duration: 300,
        easing: 'easeCubic',
      });
    }
  };

  const handleFullscreen = () => {
    const graphContainer = document.querySelector('.knowledge-graph-container');
    if (graphContainer) {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void (graphContainer as HTMLElement).requestFullscreen();
      }
    }
  };

  useEffect(() => {
    if (!containerRef.current || !graphData || loading) {
      return;
    }

    const g6Data = transformToG6Format(graphData);
    const width = containerRef.current.offsetWidth || 800;
    const height = containerRef.current.offsetHeight || 600;

    const maxEdgeLabelLen =
      g6Data.edges?.reduce(
        (max, e) => Math.max(max, String(e.data?.label).length),
        0
      ) ?? 0;

    const dagreNodesep = NODE_HEIGHT + 48;
    const dagreRanksep = NODE_WIDTH + Math.max(100, maxEdgeLabelLen * 8);

    const focusNodeId = entity?.id
      ? (g6Data.nodes ?? []).find(
          (n) => n.id === entity.id || n.id.endsWith(entity.id)
        )?.id ?? entity.id
      : '';

    // Focus node keeps fixed dimensions regardless of content
    if (focusNodeId) {
      g6Data.nodes = (g6Data.nodes ?? []).map((node) =>
        node.id === focusNodeId
          ? {
              ...node,
              style: {
                ...node.style,
                size: [MAX_NODE_WIDTH, NODE_HEIGHT] as [number, number],
              },
            }
          : node
      );
    }

    if (layout === 'radial' && entity?.id) {
      const positions = computeRadialPositions(
        g6Data.nodes ?? [],
        g6Data.edges ?? [],
        focusNodeId,
        width / 2,
        height / 2
      );
      g6Data.nodes = (g6Data.nodes ?? []).map((node) => {
        const pos = positions.get(node.id);

        return pos
          ? { ...node, style: { ...node.style, x: pos.x, y: pos.y } }
          : node;
      });

      // Apply a uniform curveOffset to all radial edges. Because G6's offset
      // is perpendicular to the travel direction, two edges that connect the
      // same pair of nodes in opposite directions automatically curve to
      // opposite sides with the same sign — keeping bidirectional arcs
      // separated without any per-edge sign logic.
      g6Data.edges = (g6Data.edges ?? []).map((edge) => ({
        ...edge,
        style: { ...edge.style, curveOffset: 50 },
      }));
    }

    const dagrePorts: NodePortStyleProps[] = [
      { key: 'left', placement: 'left', linkToCenter: false },
      { key: 'right', placement: 'right', linkToCenter: false },
    ];

    const radialLeftPort = {
      key: 'left',
      placement: [-0.04, 0.5] as [number, number],
      r: 6,
      fill: '#ffffff',
      stroke: '#d9d9d9',
      lineWidth: 1.5,
    };

    const radialRightPort = {
      key: 'right',
      placement: [1.04, 0.5] as [number, number],
      r: 6,
      fill: '#ffffff',
      stroke: '#d9d9d9',
      lineWidth: 1.5,
    };

    if (layout === 'radial') {
      // Build a position map from the already-updated node styles
      const posMap = new Map<string, number>();
      (g6Data.nodes ?? []).forEach((n) => {
        posMap.set(n.id, (n.style?.x as number) ?? width / 2);
      });

      g6Data.nodes = (g6Data.nodes ?? []).map((node) => {
        if (node.id === focusNodeId) {
          return node;
        }

        const myX = posMap.get(node.id) ?? width / 2;
        let needsLeft = false;
        let needsRight = false;

        (g6Data.edges ?? []).forEach((edge) => {
          let otherId: string | null = null;
          if (edge.source === node.id) {
            otherId = edge.target;
          } else if (edge.target === node.id) {
            otherId = edge.source;
          }
          if (otherId !== null) {
            const otherX = posMap.get(otherId) ?? width / 2;
            if (otherX < myX) {
              needsLeft = true;
            } else {
              needsRight = true;
            }
          }
        });

        const ports = [
          ...(needsLeft ? [radialLeftPort] : []),
          ...(needsRight ? [radialRightPort] : []),
        ];

        return { ...node, style: { ...node.style, ports } };
      });
    } else {
      g6Data.nodes = (g6Data.nodes ?? []).map((node) => ({
        ...node,
        style: { ...node.style, ports: dagrePorts },
      }));
    }

    const graph = new Graph({
      container: containerRef.current,
      width,
      height,
      data: g6Data,
      layout:
        layout === 'dagre'
          ? {
              type: 'dagre',
              rankdir: 'RL',
              nodesep: dagreNodesep,
              ranksep: dagreRanksep,
              radial: false,
            }
          : { type: 'preset' },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
      node: {
        type: 'react-node',
        style: {
          component: renderNode,
        },
      },
      edge: {
        type: (datum: G6EdgeData) =>
          String(
            datum.type ??
              (layout === 'radial' ? 'quadratic' : 'cubic-horizontal')
          ),
        style: {
          stroke: '#d9d9d9',
          lineWidth: 1.5,
          endArrow: true,
          labelBackgroundPadding: [3, 6],
        },
        state: {
          selected: { stroke: '#1677ff', lineWidth: 2.5, haloOpacity: 0 },
        },
      },
    });

    void graph.render().then(() => {
      if (entity?.id) {
        void graph.fitView();
        void graph.focusElement(entity.id);
      }
    });

    graph.on('node:click', (evt: IElementEvent) => {
      const nodeId = evt.target.id;
      if (nodeId) {
        const node = graphData.nodes.find((n) => n.id === nodeId);
        setSelectedNode(node || null);

        const { nodeIds: pathNodes, edgeIds: pathEdges } = findHighlightPath(
          focusNodeId,
          nodeId,
          g6Data.nodes ?? [],
          g6Data.edges ?? []
        );

        graph.updateNodeData(
          (g6Data.nodes ?? []).map((n) => ({
            id: n.id,
            data: { highlighted: pathNodes.has(n.id) },
          }))
        );
        void graph.draw();

        (g6Data.edges ?? []).forEach((e) => {
          const edgeId = String(e.id);
          void graph.setElementState(
            edgeId,
            pathEdges.has(edgeId) ? 'selected' : []
          );
        });
      }
    });

    graph.on('node:dblclick', (evt: IElementEvent) => {
      const nodeId = evt.target.id;
      if (nodeId) {
        const node = graphData.nodes.find((n) => n.id === nodeId);
        if (node?.type && node?.fullyQualifiedName) {
          const path = getEntityLinkFromType(
            node.fullyQualifiedName,
            node.type as EntityType
          );

          window.open(path, '_blank', 'noopener,noreferrer');
        }
      }
    });

    graph.on('node:pointerover', (evt: IElementEvent) => {
      const nodeId = evt.target.id;
      if (nodeId) {
        void graph.setElementState(nodeId, 'hover');
      }
    });

    graph.on('node:pointerleave', (evt: IElementEvent) => {
      const nodeId = evt.target.id;
      if (nodeId) {
        void graph.setElementState(nodeId, []);
      }
    });

    graph.on('canvas:click', () => {
      setSelectedNode(null);

      graph.updateNodeData(
        (g6Data.nodes ?? []).map((n) => ({
          id: n.id,
          data: { highlighted: false },
        }))
      );
      void graph.draw();

      (g6Data.edges ?? []).forEach(
        (e) => void graph.setElementState(String(e.id), [])
      );
    });

    networkRef.current = graph;

    return () => {
      graph.destroy();
    };
  }, [graphData, loading, layout, entity?.id, transformToG6Format]);

  useEffect(() => {
    if (entity?.id) {
      fetchGraphData();
    }
  }, [fetchGraphData]);

  const hasNoData = !graphData || graphData.nodes.length === 0;

  const graphCanvas = (
    <>
      <div className="knowledge-graph-canvas" ref={containerRef} />

      {selectedNode &&
        (selectedNode.fullyQualifiedName ? (
          <div className="knowledge-graph-entity-panel">
            <EntitySummaryPanel
              entityDetails={{
                details: {
                  id:
                    ENTITY_UUID_REGEX.exec(selectedNode.id)?.[1] ??
                    selectedNode.id,
                  fullyQualifiedName: selectedNode.fullyQualifiedName,
                  entityType: selectedNode.type as EntityType,
                  name: selectedNode.name ?? selectedNode.label,
                  displayName: selectedNode.label,
                } as SearchSourceDetails,
              }}
              handleClosePanel={() => setSelectedNode(null)}
            />
          </div>
        ) : (
          <KnowledgeGraphNodeDetails
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onNavigate={(nodeId) => {
              const entityIdMatch = ENTITY_UUID_REGEX.exec(nodeId);
              if (entityIdMatch) {
                window.open(
                  `/${selectedNode.type}/${entityIdMatch[1]}`,
                  '_blank',
                  'noopener,noreferrer'
                );
              }
            }}
          />
        ))}
    </>
  );

  const emptyContent = hasNoData ? (
    <div className="knowledge-graph-empty">
      <Empty
        description={t('message.no-data-available')}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    </div>
  ) : (
    graphCanvas
  );

  const graphContent = loading ? (
    <div className="knowledge-graph-loading">
      <Spin size="large" tip={t('label.loading-graph')} />
    </div>
  ) : (
    emptyContent
  );

  if (!entity) {
    return <Empty description={t('message.no-entity-selected')} />;
  }

  return (
    <div className="knowledge-graph-container">
      <div className="knowledge-graph-controls">
        <Typography.Text>
          {t('label.view-entity', { entity: t('label.mode') }) + ':'}
        </Typography.Text>
        <Radio.Group
          optionType="button"
          options={[
            {
              label: t('label.hierarchical'),
              value: 'dagre',
            },
            {
              label: t('label.radial'),
              value: 'radial',
            },
          ]}
          size="small"
          value={layout}
          onChange={handleLayoutChange}
        />

        <Divider type="vertical" />

        <div className="depth-slider-container">
          <span className="depth-label">{t('label.node-depth') + ':'}</span>
          <Slider
            className="depth-slider"
            marks={{
              1: '1',
              5: '5',
              10: '10',
            }}
            max={10}
            min={1}
            tooltip={{
              formatter: (value) => `${t('label.depth')}: ${value}`,
            }}
            value={selectedDepth}
            onChange={handleDepthChange}
          />
        </div>
        <Divider type="vertical" />
        <Space.Compact>
          <Tooltip title={t('label.zoom-in')}>
            <Button
              icon={<ZoomInOutlined />}
              size="small"
              onClick={handleZoomIn}
            />
          </Tooltip>
          <Tooltip title={t('label.zoom-out')}>
            <Button
              icon={<ZoomOutOutlined />}
              size="small"
              onClick={handleZoomOut}
            />
          </Tooltip>
          <Tooltip title={t('label.fit-to-screen')}>
            <Button icon={<AimOutlined />} size="small" onClick={handleFit} />
          </Tooltip>
          <Tooltip title={t('label.fullscreen')}>
            <Button
              icon={<FullscreenOutlined />}
              size="small"
              onClick={handleFullscreen}
            />
          </Tooltip>
          <Tooltip title={t('label.refresh')}>
            <Button
              icon={<ReloadOutlined />}
              loading={loading}
              size="small"
              onClick={fetchGraphData}
            />
          </Tooltip>
        </Space.Compact>
      </div>

      {graphContent}
    </div>
  );
};

export default KnowledgeGraph;
