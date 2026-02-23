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
  ApartmentOutlined,
  DownloadOutlined,
  ExpandOutlined,
  FolderOpenOutlined,
  FullscreenOutlined,
  PlusOutlined,
  RedoOutlined,
  SaveOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import {
  Button,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  List,
  MenuProps,
  Modal,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { AxiosError } from 'axios';
import classNames from 'classnames';
import { compare } from 'fast-json-patch';
import { isEqual, isUndefined, omitBy } from 'lodash';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { EntityType, TabSpecificField } from '../../enums/entity.enum';
import { Glossary } from '../../generated/entity/data/glossary';
import { GlossaryTerm } from '../../generated/entity/data/glossaryTerm';
import { Metric } from '../../generated/entity/data/metric';
import { EntityReference } from '../../generated/entity/data/table';
import {
  LabelType,
  State,
  TagLabel,
  TagSource,
} from '../../generated/type/tagLabel';
import { TermRelation } from '../../generated/type/termRelation';
import {
  addTermRelation,
  getGlossariesList,
  getGlossaryTermAssets,
  getGlossaryTerms,
} from '../../rest/glossaryAPI';
import { getMetricByFqn, getMetrics, patchMetric } from '../../rest/metricsAPI';
import {
  checkRdfEnabled,
  downloadGlossaryOntology,
  getGlossaryTermGraph,
  GraphData,
  OntologyExportFormat,
} from '../../rest/rdfAPI';
import {
  getGlossaryTermRelationSettings,
  GlossaryTermRelationType,
} from '../../rest/settingConfigAPI';
import {
  getEntityDetailsPath,
  getGlossaryTermDetailsPath,
} from '../../utils/RouterUtils';
import { fetchGlossaryList } from '../../utils/TagsUtils';
import { showErrorToast, showSuccessToast } from '../../utils/ToastUtils';
import { useGenericContext } from '../Customization/GenericProvider/GenericProvider';
import ConceptsTree from './ConceptsTree';
import CytoscapeGraph, { CytoscapeGraphHandle } from './CytoscapeGraph';
import DetailsPanel from './DetailsPanel';
import FilterToolbar from './FilterToolbar';
import GraphSettingsPanel from './GraphSettingsPanel';
import NodeContextMenu from './NodeContextMenu';
import OntologyControlButtons from './OntologyControlButtons';
import {
  ConceptsTreeNode,
  GraphFilters,
  GraphSettings,
  GraphViewMode,
  OntologyEdge,
  OntologyExplorerProps,
  OntologyGraphData,
  OntologyNode,
} from './OntologyExplorer.interface';
import './OntologyExplorer.style.less';
import OntologyLegend from './OntologyLegend';

const isValidUUID = (str: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  return uuidRegex.test(str);
};

const GLOSSARY_COLORS = [
  '#3062d4', // Primary blue (lineage style)
  '#7c3aed', // Purple
  '#059669', // Emerald
  '#dc2626', // Red
  '#ea580c', // Orange
  '#0891b2', // Cyan
  '#4f46e5', // Indigo
  '#ca8a04', // Yellow
  '#be185d', // Pink
  '#0d9488', // Teal
];

const METRIC_NODE_TYPE = 'metric';
const METRIC_RELATION_TYPE = 'metricFor';
const ASSET_NODE_TYPE = 'dataAsset';
const ASSET_RELATION_TYPE = 'hasGlossaryTerm';
const SAVED_EXPLORATIONS_KEY = 'om_ontology_explorer_saved_explorations';

const DEFAULT_SETTINGS: GraphSettings = {
  layout: 'force',
  nodeColorMode: 'glossary',
  nodeSizeMode: 'uniform',
  showEdgeLabels: true,
  showNodeDescriptions: false,
  showGlossaryHulls: true,
  showMetrics: true,
  highlightOnHover: true,
  animateTransitions: true,
  physicsEnabled: true,
  edgeBundling: false,
};

const DEFAULT_FILTERS: GraphFilters = {
  viewMode: 'overview',
  glossaryIds: [],
  relationTypes: [],
  hierarchyLevels: [],
  showIsolatedNodes: true,
  showCrossGlossaryOnly: false,
  searchQuery: '',
  depth: 0,
};

const DEFAULT_LIMIT = 500;
const HISTORY_LIMIT = 50;
const ASSET_TERM_LIMIT = 40;
const ASSET_TOTAL_LIMIT = 200;

type ExplorationMode = 'model' | 'data';

interface ExplorationSnapshot {
  filters: GraphFilters;
  settings: GraphSettings;
  explorationMode: ExplorationMode;
  selectedNodeId?: string | null;
  nodePositions?: Record<string, { x: number; y: number }>;
}

interface SavedExploration {
  id: string;
  name: string;
  createdAt: number;
  snapshot: ExplorationSnapshot;
}

const OntologyExplorer: React.FC<OntologyExplorerProps> = ({
  scope,
  entityId: propEntityId,
  glossaryId,
  className,
  showHeader = true,
  height = 'calc(100vh - 200px)',
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const graphRef = useRef<CytoscapeGraphHandle | null>(null);

  const contextData = useGenericContext<GlossaryTerm>();
  const entityId =
    propEntityId ?? (scope === 'term' ? contextData?.data?.id : undefined);

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [graphData, setGraphData] = useState<OntologyGraphData | null>(null);
  const [assetGraphData, setAssetGraphData] =
    useState<OntologyGraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<OntologyNode | null>(null);
  const [selectedTreeNode, setSelectedTreeNode] =
    useState<ConceptsTreeNode | null>(null);
  const [rdfEnabled, setRdfEnabled] = useState<boolean | null>(null);
  const [dataSource, setDataSource] = useState<'rdf' | 'database'>('database');
  const [relationTypes, setRelationTypes] = useState<
    GlossaryTermRelationType[]
  >([]);
  const [glossaries, setGlossaries] = useState<Glossary[]>([]);
  const [, setMetrics] = useState<Metric[]>([]);
  const [settings, setSettings] = useState<GraphSettings>(DEFAULT_SETTINGS);
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_FILTERS);
  const [explorationMode, setExplorationMode] =
    useState<ExplorationMode>('model');
  const [isMinimapVisible, setIsMinimapVisible] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    node: OntologyNode;
    position: { x: number; y: number };
  } | null>(null);
  const [history, setHistory] = useState<ExplorationSnapshot[]>([]);
  const [future, setFuture] = useState<ExplorationSnapshot[]>([]);
  const [savedExplorations, setSavedExplorations] = useState<
    SavedExploration[]
  >([]);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSavedDrawerOpen, setIsSavedDrawerOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [selectedRelationType, setSelectedRelationType] =
    useState<string>('relatedTo');
  const [selectedTermValues, setSelectedTermValues] = useState<string[]>([]);
  const [termOptions, setTermOptions] = useState<
    Array<{ label: string; value: string; term: GlossaryTerm }>
  >([]);
  const [termSearchLoading, setTermSearchLoading] = useState(false);
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [savedPositions, setSavedPositions] = useState<Record<
    string,
    { x: number; y: number }
  > | null>(null);
  const [saveForm] = Form.useForm();

  const historyApplyingRef = useRef(false);
  const modelFiltersRef = useRef<GraphFilters>(DEFAULT_FILTERS);
  const dataFiltersRef = useRef<GraphFilters>({
    ...DEFAULT_FILTERS,
    relationTypes: [METRIC_RELATION_TYPE, ASSET_RELATION_TYPE],
  });
  const selectedTermMapRef = useRef<Map<string, GlossaryTerm>>(new Map());

  const glossaryColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    glossaries.forEach((g, i) => {
      map[g.id] = GLOSSARY_COLORS[i % GLOSSARY_COLORS.length];
    });

    return map;
  }, [glossaries]);

  const combinedGraphData = useMemo(() => {
    if (!graphData) {
      return null;
    }
    if (explorationMode !== 'data' || !assetGraphData) {
      return graphData;
    }

    return {
      nodes: [...graphData.nodes, ...assetGraphData.nodes],
      edges: [...graphData.edges, ...assetGraphData.edges],
    };
  }, [graphData, assetGraphData, explorationMode]);

  const filteredGraphData = useMemo(() => {
    if (!combinedGraphData) {
      return null;
    }

    let filteredNodes = [...combinedGraphData.nodes];
    let filteredEdges = [...combinedGraphData.edges];

    if (!settings.showMetrics) {
      filteredNodes = filteredNodes.filter((n) => n.type !== METRIC_NODE_TYPE);
      const nodeIds = new Set(filteredNodes.map((n) => n.id));
      filteredEdges = filteredEdges.filter(
        (e) => nodeIds.has(e.from) && nodeIds.has(e.to)
      );
    }

    // For term scope, filter to only show the selected term and its direct connections
    if (scope === 'term' && entityId) {
      // Find edges connected to the current term
      filteredEdges = filteredEdges.filter(
        (e) => e.from === entityId || e.to === entityId
      );

      // Find nodes that are directly connected to the current term
      const connectedNodeIds = new Set<string>([entityId]);
      filteredEdges.forEach((e) => {
        connectedNodeIds.add(e.from);
        connectedNodeIds.add(e.to);
      });

      filteredNodes = filteredNodes.filter((n) => connectedNodeIds.has(n.id));
    }

    // Filter by glossary
    if (filters.glossaryIds.length > 0) {
      const glossaryTermIds = new Set(
        filteredNodes
          .filter(
            (n) =>
              n.type !== METRIC_NODE_TYPE &&
              n.type !== ASSET_NODE_TYPE &&
              n.glossaryId &&
              filters.glossaryIds.includes(n.glossaryId)
          )
          .map((n) => n.id)
      );

      const metricIds = new Set<string>();
      const assetIds = new Set<string>();
      filteredEdges.forEach((edge) => {
        if (edge.relationType === METRIC_RELATION_TYPE) {
          if (glossaryTermIds.has(edge.to) || glossaryTermIds.has(edge.from)) {
            metricIds.add(edge.from);
            metricIds.add(edge.to);
          }

          return;
        }
        if (edge.relationType === ASSET_RELATION_TYPE) {
          if (glossaryTermIds.has(edge.to) || glossaryTermIds.has(edge.from)) {
            assetIds.add(edge.from);
            assetIds.add(edge.to);
          }
        }
      });

      filteredNodes = filteredNodes.filter((n) => {
        if (n.type === 'glossary') {
          return filters.glossaryIds.includes(n.id);
        }
        if (n.type === METRIC_NODE_TYPE) {
          return metricIds.has(n.id);
        }
        if (n.type === ASSET_NODE_TYPE) {
          return assetIds.has(n.id);
        }

        return n.glossaryId && filters.glossaryIds.includes(n.glossaryId);
      });
      const nodeIds = new Set(filteredNodes.map((n) => n.id));
      filteredEdges = filteredEdges.filter(
        (e) => nodeIds.has(e.from) && nodeIds.has(e.to)
      );
    }

    // Filter by relation type
    if (filters.relationTypes.length > 0) {
      filteredEdges = filteredEdges.filter((e) =>
        filters.relationTypes.includes(e.relationType)
      );
    }

    // Filter cross-glossary relations only
    if (filters.showCrossGlossaryOnly) {
      const nodeById = new Map(filteredNodes.map((node) => [node.id, node]));
      filteredEdges = filteredEdges.filter((edge) => {
        const fromGlossary = nodeById.get(edge.from)?.glossaryId;
        const toGlossary = nodeById.get(edge.to)?.glossaryId;

        return fromGlossary && toGlossary && fromGlossary !== toGlossary;
      });

      const nodeIds = new Set<string>();
      filteredEdges.forEach((edge) => {
        nodeIds.add(edge.from);
        nodeIds.add(edge.to);
      });
      filteredNodes = filteredNodes.filter((node) => nodeIds.has(node.id));
    }

    // Limit neighborhood depth around the selected node
    if (filters.depth > 0) {
      const rootId = selectedNode?.id ?? selectedTreeNode?.data?.id;
      if (rootId) {
        const adjacency = new Map<string, Set<string>>();
        filteredEdges.forEach((edge) => {
          if (!adjacency.has(edge.from)) {
            adjacency.set(edge.from, new Set());
          }
          if (!adjacency.has(edge.to)) {
            adjacency.set(edge.to, new Set());
          }
          adjacency.get(edge.from)?.add(edge.to);
          adjacency.get(edge.to)?.add(edge.from);
        });

        const visited = new Set<string>([rootId]);
        let frontier = new Set<string>([rootId]);

        for (let depth = 0; depth < filters.depth; depth++) {
          const next = new Set<string>();
          frontier.forEach((nodeId) => {
            adjacency.get(nodeId)?.forEach((neighbor) => {
              if (!visited.has(neighbor)) {
                visited.add(neighbor);
                next.add(neighbor);
              }
            });
          });
          frontier = next;
          if (frontier.size === 0) {
            break;
          }
        }

        filteredNodes = filteredNodes.filter((node) => visited.has(node.id));
        filteredEdges = filteredEdges.filter(
          (edge) => visited.has(edge.from) && visited.has(edge.to)
        );
      }
    }

    // Filter isolated nodes
    if (!filters.showIsolatedNodes) {
      const connectedIds = new Set<string>();
      filteredEdges.forEach((e) => {
        connectedIds.add(e.from);
        connectedIds.add(e.to);
      });
      filteredNodes = filteredNodes.filter(
        (n) => connectedIds.has(n.id) || n.type === 'glossary'
      );
    }

    // Filter by search query
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filteredNodes = filteredNodes.filter(
        (n) =>
          n.label.toLowerCase().includes(query) ||
          n.fullyQualifiedName?.toLowerCase().includes(query) ||
          n.description?.toLowerCase().includes(query)
      );
      const nodeIds = new Set(filteredNodes.map((n) => n.id));
      filteredEdges = filteredEdges.filter(
        (e) => nodeIds.has(e.from) && nodeIds.has(e.to)
      );
    }

    return { nodes: filteredNodes, edges: filteredEdges };
  }, [
    combinedGraphData,
    filters,
    scope,
    entityId,
    selectedNode,
    selectedTreeNode,
    settings.showMetrics,
  ]);

  const activeGlossaryId = useMemo(() => {
    if (filters.glossaryIds.length === 1) {
      return filters.glossaryIds[0];
    }

    return 'all';
  }, [filters.glossaryIds]);

  const searchOptions = useMemo(() => {
    const termOptions =
      combinedGraphData?.nodes
        .filter(
          (node) =>
            node.type !== 'glossary' &&
            node.type !== METRIC_NODE_TYPE &&
            node.type !== ASSET_NODE_TYPE
        )
        .map((node) => ({
          label: node.originalLabel ?? node.label,
          value: node.originalLabel ?? node.label,
          type: 'term' as const,
          nodeId: node.id,
        })) ?? [];

    const metricOptions = settings.showMetrics
      ? combinedGraphData?.nodes
          .filter((node) => node.type === METRIC_NODE_TYPE)
          .map((node) => ({
            label: node.originalLabel ?? node.label,
            value: node.originalLabel ?? node.label,
            type: 'metric' as const,
            nodeId: node.id,
          })) ?? []
      : [];

    const assetOptions =
      explorationMode === 'data'
        ? combinedGraphData?.nodes
            .filter((node) => node.type === ASSET_NODE_TYPE)
            .map((node) => ({
              label: node.originalLabel ?? node.label,
              value: node.originalLabel ?? node.label,
              type: 'asset' as const,
              nodeId: node.id,
            })) ?? []
        : [];

    const glossaryOptions = glossaries.map((glossary) => ({
      label: glossary.displayName || glossary.name,
      value: glossary.displayName || glossary.name,
      type: 'glossary' as const,
      glossaryId: glossary.id,
    }));

    const relationOptions = relationTypes.map((relationType) => ({
      label: relationType.displayName || relationType.name,
      value: relationType.displayName || relationType.name,
      type: 'relationType' as const,
      relationType: relationType.name,
    }));

    const groups = [];
    if (glossaryOptions.length > 0) {
      groups.push({
        label: t('label.glossary'),
        options: glossaryOptions,
      });
    }
    if (termOptions.length > 0) {
      groups.push({
        label: t('label.term-plural'),
        options: termOptions,
      });
    }
    if (metricOptions.length > 0) {
      groups.push({
        label: t('label.metric-plural'),
        options: metricOptions,
      });
    }
    if (relationOptions.length > 0) {
      groups.push({
        label: t('label.relation-type'),
        options: relationOptions,
      });
    }
    if (assetOptions.length > 0) {
      groups.push({
        label: t('label.data-asset-plural'),
        options: assetOptions,
      });
    }

    return groups;
  }, [
    combinedGraphData,
    glossaries,
    relationTypes,
    settings.showMetrics,
    explorationMode,
    t,
  ]);

  const relationTypesForFilters = useMemo(() => {
    if (explorationMode !== 'data') {
      return relationTypes;
    }
    const extras: GlossaryTermRelationType[] = [
      {
        name: METRIC_RELATION_TYPE,
        displayName: `${t('label.metric')} ${t('label.for-lowercase')}`,
        category: 'associative',
      },
      {
        name: ASSET_RELATION_TYPE,
        displayName: t('label.tagged-with'),
        category: 'associative',
      },
    ];

    const merged = [...relationTypes];
    extras.forEach((extra) => {
      if (!merged.find((item) => item.name === extra.name)) {
        merged.push(extra);
      }
    });

    return merged;
  }, [relationTypes, explorationMode, t]);

  const snapshot = useCallback(
    (includePositions = false): ExplorationSnapshot => {
      return {
        filters,
        settings,
        explorationMode,
        selectedNodeId: selectedNode?.id ?? null,
        nodePositions: includePositions
          ? graphRef.current?.getNodePositions()
          : undefined,
      };
    },
    [filters, settings, explorationMode, selectedNode]
  );

  const applySnapshot = useCallback(
    (next: ExplorationSnapshot) => {
      historyApplyingRef.current = true;
      setFilters(next.filters);
      setSettings(next.settings);
      setExplorationMode(next.explorationMode);
      setSavedPositions(next.nodePositions ?? null);
      if (next.selectedNodeId && graphData?.nodes) {
        const node =
          graphData.nodes.find((n) => n.id === next.selectedNodeId) ?? null;
        setSelectedNode(node);
      } else {
        setSelectedNode(null);
      }
      window.requestAnimationFrame(() => {
        historyApplyingRef.current = false;
      });
    },
    [graphData]
  );

  useEffect(() => {
    if (historyApplyingRef.current) {
      return;
    }
    const nextSnapshot = snapshot();
    setHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last && isEqual(last, nextSnapshot)) {
        return prev;
      }
      const updated = [...prev, nextSnapshot];

      return updated.length > HISTORY_LIMIT
        ? updated.slice(updated.length - HISTORY_LIMIT)
        : updated;
    });
    setFuture([]);
  }, [snapshot]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SAVED_EXPLORATIONS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SavedExploration[];
        setSavedExplorations(parsed ?? []);
      }
    } catch {
      setSavedExplorations([]);
    }
  }, []);

  const persistSavedExplorations = useCallback((items: SavedExploration[]) => {
    setSavedExplorations(items);
    localStorage.setItem(SAVED_EXPLORATIONS_KEY, JSON.stringify(items));
  }, []);

  const mergeMetricsIntoGraph = useCallback(
    (graph: OntologyGraphData | null, metricList: Metric[]) => {
      if (!graph || metricList.length === 0) {
        return graph;
      }

      const nodes = [...graph.nodes];
      const edges = [...graph.edges];
      const nodeIds = new Set(nodes.map((n) => n.id));
      const edgeKeys = new Set(
        edges.map((edge) => `${edge.from}-${edge.to}-${edge.relationType}`)
      );
      const termByFqn = new Map<string, OntologyNode>();

      nodes.forEach((node) => {
        if (node.fullyQualifiedName) {
          termByFqn.set(node.fullyQualifiedName, node);
        }
      });

      metricList.forEach((metric) => {
        const glossaryTags =
          metric.tags?.filter((tag) => tag.source === TagSource.Glossary) ?? [];

        if (glossaryTags.length === 0 || !metric.id) {
          return;
        }

        const relatedTerms = glossaryTags
          .map((tag) => termByFqn.get(tag.tagFQN))
          .filter((term): term is OntologyNode => Boolean(term));

        if (relatedTerms.length === 0) {
          return;
        }

        if (!nodeIds.has(metric.id)) {
          nodes.push({
            id: metric.id,
            label: metric.displayName || metric.name,
            originalLabel: metric.displayName || metric.name,
            type: METRIC_NODE_TYPE,
            fullyQualifiedName: metric.fullyQualifiedName,
            description: metric.description,
            group: t('label.metric-plural'),
            entityRef: {
              id: metric.id,
              name: metric.name,
              displayName: metric.displayName,
              type: EntityType.METRIC,
              fullyQualifiedName: metric.fullyQualifiedName,
              description: metric.description,
            },
          });
          nodeIds.add(metric.id);
        }

        relatedTerms.forEach((term) => {
          const edgeKey = `${metric.id}-${term.id}-${METRIC_RELATION_TYPE}`;
          if (!edgeKeys.has(edgeKey)) {
            edges.push({
              from: metric.id,
              to: term.id,
              label: 'Metric for',
              relationType: METRIC_RELATION_TYPE,
            });
            edgeKeys.add(edgeKey);
          }
        });
      });

      return { nodes, edges };
    },
    [t]
  );

  const buildAssetGraphData = useCallback(
    async (termNodes: OntologyNode[]): Promise<OntologyGraphData> => {
      const nodes: OntologyNode[] = [];
      const edges: OntologyEdge[] = [];
      const nodeIds = new Set<string>();
      const edgeKeys = new Set<string>();
      let totalAssets = 0;

      for (const termNode of termNodes) {
        if (!termNode.id || totalAssets >= ASSET_TOTAL_LIMIT) {
          break;
        }

        const limit = Math.min(100, ASSET_TOTAL_LIMIT - totalAssets);
        try {
          const response = await getGlossaryTermAssets(termNode.id, limit, 0);
          const assets = response.data ?? [];
          totalAssets += assets.length;

          assets.forEach((asset) => {
            if (!asset.id) {
              return;
            }
            if (!nodeIds.has(asset.id)) {
              nodes.push({
                id: asset.id,
                label:
                  asset.displayName ||
                  asset.name ||
                  asset.fullyQualifiedName ||
                  asset.id,
                originalLabel:
                  asset.displayName ||
                  asset.name ||
                  asset.fullyQualifiedName ||
                  asset.id,
                type: ASSET_NODE_TYPE,
                fullyQualifiedName: asset.fullyQualifiedName,
                description: asset.description,
                entityRef: asset,
              });
              nodeIds.add(asset.id);
            }

            const edgeKey = `${asset.id}-${termNode.id}-${ASSET_RELATION_TYPE}`;
            if (!edgeKeys.has(edgeKey)) {
              edges.push({
                from: asset.id,
                to: termNode.id,
                label: t('label.tagged-with'),
                relationType: ASSET_RELATION_TYPE,
              });
              edgeKeys.add(edgeKey);
            }
          });
        } catch {
          // Skip assets for this term if fetch fails
        }
      }

      return { nodes, edges };
    },
    [t]
  );

  const fetchAllMetrics = useCallback(async (): Promise<Metric[]> => {
    const allMetrics: Metric[] = [];
    let after: string | undefined;

    while (allMetrics.length < DEFAULT_LIMIT) {
      const response = await getMetrics({
        fields: 'tags',
        limit: Math.min(100, DEFAULT_LIMIT - allMetrics.length),
        after,
      });
      allMetrics.push(...response.data);
      after = response.paging?.after;
      if (!after) {
        break;
      }
    }

    return allMetrics;
  }, []);

  const convertRdfGraphToOntologyGraph = useCallback(
    (rdfData: GraphData, glossaryList: Glossary[]): OntologyGraphData => {
      // Create mapping from glossary name to ID for lookups
      const glossaryNameToId = new Map<string, string>();
      glossaryList.forEach((g) => {
        glossaryNameToId.set(g.name.toLowerCase(), g.id);
        if (g.fullyQualifiedName) {
          glossaryNameToId.set(g.fullyQualifiedName.toLowerCase(), g.id);
        }
      });

      const nodes: OntologyNode[] = rdfData.nodes.map((node) => {
        // Extract glossary name from group or FQN
        let glossaryId: string | undefined;
        if (node.group) {
          glossaryId = glossaryNameToId.get(node.group.toLowerCase());
        }
        if (!glossaryId && node.fullyQualifiedName) {
          const glossaryName = node.fullyQualifiedName.split('.')[0];
          glossaryId = glossaryNameToId.get(glossaryName.toLowerCase());
        }

        // Determine the best label - fallback to extracting from FQN if label looks like a UUID
        let nodeLabel = node.label;
        const isUuidLabel =
          nodeLabel &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            nodeLabel
          );

        if (!nodeLabel || isUuidLabel) {
          // Try to extract label from fullyQualifiedName (last part after the last dot)
          if (node.fullyQualifiedName) {
            const parts = node.fullyQualifiedName.split('.');
            nodeLabel = parts[parts.length - 1];
          } else if (node.title) {
            nodeLabel = node.title;
          } else {
            nodeLabel = node.id;
          }
        }

        return {
          id: node.id,
          label: nodeLabel,
          type: node.type || 'glossaryTerm',
          fullyQualifiedName: node.fullyQualifiedName,
          description: node.description,
          glossaryId,
          group: node.group,
        };
      });

      // Deduplicate edges, preferring specific relation types over 'relatedTo'
      const edgeMap = new Map<string, OntologyEdge>();
      rdfData.edges.forEach((edge) => {
        const relationType = edge.relationType || 'relatedTo';
        const nodePairKey = [edge.from, edge.to].sort().join('-');
        const existingEdge = edgeMap.get(nodePairKey);

        // Add if no existing edge, or replace if new type is more specific
        if (
          !existingEdge ||
          (existingEdge.relationType === 'relatedTo' &&
            relationType !== 'relatedTo')
        ) {
          edgeMap.set(nodePairKey, {
            from: edge.from,
            to: edge.to,
            label: edge.label || relationType,
            relationType: relationType,
          });
        }
      });

      return { nodes, edges: Array.from(edgeMap.values()) };
    },
    []
  );

  const buildGraphFromAllTerms = useCallback(
    (terms: GlossaryTerm[], glossaryList: Glossary[]): OntologyGraphData => {
      const nodesMap = new Map<string, OntologyNode>();
      const edges: OntologyEdge[] = [];
      const edgeSet = new Set<string>();

      // Note: We don't add glossary nodes - ontology graph shows only term-to-term relations

      terms.forEach((term) => {
        if (!term.id || !isValidUUID(term.id)) {
          return;
        }

        const hasRelations =
          (term.relatedTerms && term.relatedTerms.length > 0) ||
          (term.children && term.children.length > 0) ||
          term.parent;

        nodesMap.set(term.id, {
          id: term.id,
          label: term.displayName || term.name,
          type: hasRelations ? 'glossaryTerm' : 'glossaryTermIsolated',
          fullyQualifiedName: term.fullyQualifiedName,
          description: term.description,
          glossaryId: term.glossary?.id,
          group: glossaryList.find((g) => g.id === term.glossary?.id)?.name,
        });

        if (term.relatedTerms && term.relatedTerms.length > 0) {
          term.relatedTerms.forEach((relation: TermRelation) => {
            const relatedTermRef = relation.term;
            const relationType = relation.relationType || 'relatedTo';
            if (relatedTermRef?.id && isValidUUID(relatedTermRef.id)) {
              // Use node-pair key (without relationType) to avoid duplicate edges
              const nodePairKey = [term.id, relatedTermRef.id].sort().join('-');

              // Check if we already have an edge for this node pair
              if (!edgeSet.has(nodePairKey)) {
                edgeSet.add(nodePairKey);
                edges.push({
                  from: term.id,
                  to: relatedTermRef.id,
                  label: relationType,
                  relationType: relationType,
                });
              } else if (relationType !== 'relatedTo') {
                // If we have a more specific relationType, update the existing edge
                const existingEdgeIndex = edges.findIndex(
                  (e) =>
                    [e.from, e.to].sort().join('-') === nodePairKey &&
                    e.relationType === 'relatedTo'
                );
                if (existingEdgeIndex !== -1) {
                  edges[existingEdgeIndex] = {
                    from: term.id,
                    to: relatedTermRef.id,
                    label: relationType,
                    relationType: relationType,
                  };
                }
              }
            }
          });
        }

        if (term.parent?.id && isValidUUID(term.parent.id)) {
          const edgeKey = `parent-${term.parent.id}-${term.id}`;
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey);
            edges.push({
              from: term.parent.id,
              to: term.id,
              label: t('label.parent'),
              relationType: 'parentOf',
            });
          }
        }
      });

      return { nodes: Array.from(nodesMap.values()), edges };
    },
    [t]
  );

  const fetchGraphDataFromRdf = useCallback(
    async (glossaryIdParam?: string, glossaryList?: Glossary[]) => {
      try {
        const rdfData = await getGlossaryTermGraph({
          glossaryId: glossaryIdParam,
          limit: DEFAULT_LIMIT,
          includeIsolated: true,
        });

        if (rdfData.nodes && rdfData.nodes.length > 0) {
          // Check if labels are valid (not just UUIDs) - if too many UUID labels, fall back to database
          const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          const nodesWithBadLabels = rdfData.nodes.filter(
            (node) => !node.label || uuidRegex.test(node.label)
          );

          // If more than half the nodes have bad labels, skip RDF and use database
          if (nodesWithBadLabels.length > rdfData.nodes.length / 2) {
            return null;
          }

          setDataSource(rdfData.source === 'database' ? 'database' : 'rdf');

          return convertRdfGraphToOntologyGraph(rdfData, glossaryList ?? []);
        }

        return null;
      } catch {
        return null;
      }
    },
    [convertRdfGraphToOntologyGraph]
  );

  const fetchGraphDataFromDatabase = useCallback(
    async (glossaryIdParam?: string, fetchedGlossaries?: Glossary[]) => {
      const glossariesToUse = fetchedGlossaries ?? glossaries;
      const allTerms: GlossaryTerm[] = [];

      const glossariesToFetch = glossaryIdParam
        ? glossariesToUse.filter((g) => g.id === glossaryIdParam)
        : glossariesToUse;

      for (const glossary of glossariesToFetch) {
        try {
          const termsResponse = await getGlossaryTerms({
            glossary: glossary.id,
            fields: [
              TabSpecificField.RELATED_TERMS,
              TabSpecificField.CHILDREN,
              TabSpecificField.PARENT,
            ],
            limit: 1000,
          });
          allTerms.push(...termsResponse.data);
        } catch {
          // Continue with other glossaries if one fails
        }
      }

      return buildGraphFromAllTerms(allTerms, glossariesToFetch);
    },
    // Note: glossaries is intentionally excluded to prevent infinite loop
    // fetchedGlossaries parameter is always passed from fetchAllGlossaryData

    [buildGraphFromAllTerms]
  );

  const fetchAllGlossaryData = useCallback(
    async (glossaryIdParam?: string) => {
      setLoading(true);
      try {
        // Always fetch glossaries list for export functionality
        const [glossariesResponse, metricsResponse] = await Promise.all([
          getGlossariesList({
            fields: 'owners,tags',
            limit: 100,
          }),
          fetchAllMetrics().catch(() => []),
        ]);
        const fetchedGlossaries = glossariesResponse.data;
        setGlossaries(fetchedGlossaries);
        setMetrics(metricsResponse);

        let data: OntologyGraphData | null = null;

        if (rdfEnabled) {
          data = await fetchGraphDataFromRdf(
            glossaryIdParam,
            fetchedGlossaries
          );
        }

        if (!data || data.nodes.length === 0) {
          setDataSource('database');
          data = await fetchGraphDataFromDatabase(
            glossaryIdParam,
            fetchedGlossaries
          );
        }

        const mergedData = mergeMetricsIntoGraph(data, metricsResponse);
        setGraphData(mergedData);
        setAssetGraphData(null);
        setSavedPositions(null);
      } catch (error) {
        showErrorToast(error as AxiosError, t('server.entity-fetch-error'));
        setGraphData(null);
      } finally {
        setLoading(false);
      }
    },
    [
      rdfEnabled,
      fetchGraphDataFromRdf,
      fetchGraphDataFromDatabase,
      fetchAllMetrics,
      mergeMetricsIntoGraph,
      t,
    ]
  );

  const loadAssetsForDataMode = useCallback(async () => {
    if (!graphData) {
      return;
    }

    let termNodes = graphData.nodes.filter(
      (node) =>
        node.type === 'glossaryTerm' || node.type === 'glossaryTermIsolated'
    );

    if (filters.glossaryIds.length > 0) {
      termNodes = termNodes.filter(
        (node) =>
          node.glossaryId && filters.glossaryIds.includes(node.glossaryId)
      );
    }

    if (scope === 'term' && entityId) {
      termNodes = termNodes.filter((node) => node.id === entityId);
    }

    const limitedTerms = termNodes.slice(0, ASSET_TERM_LIMIT);
    const assetData = await buildAssetGraphData(limitedTerms);
    setAssetGraphData(assetData);
  }, [graphData, filters.glossaryIds, scope, entityId, buildAssetGraphData]);

  // Initialize settings
  useEffect(() => {
    const initializeSettings = async () => {
      const [enabled, relSettings] = await Promise.all([
        checkRdfEnabled(),
        getGlossaryTermRelationSettings().catch(() => ({ relationTypes: [] })),
      ]);
      setRdfEnabled(enabled);
      setRelationTypes(relSettings.relationTypes);
    };
    initializeSettings();
  }, []);

  useEffect(() => {
    if (relationTypes.length > 0) {
      setSelectedRelationType(relationTypes[0].name);
    }
  }, [relationTypes]);

  // Fetch data when scope changes
  useEffect(() => {
    if (rdfEnabled === null) {
      return;
    }

    if (scope === 'global') {
      fetchAllGlossaryData();
    } else if (scope === 'glossary' && glossaryId) {
      fetchAllGlossaryData(glossaryId);
    } else if (scope === 'term' && entityId) {
      fetchAllGlossaryData();
    } else {
      setLoading(false);
    }
  }, [scope, glossaryId, entityId, rdfEnabled, fetchAllGlossaryData]);

  useEffect(() => {
    if (explorationMode !== 'data') {
      setAssetGraphData(null);

      return;
    }

    loadAssetsForDataMode();
  }, [explorationMode, loadAssetsForDataMode]);

  // Focus on selected tree node
  useEffect(() => {
    if (selectedTreeNode?.data?.id) {
      setSelectedNode(
        filteredGraphData?.nodes.find(
          (n) => n.id === selectedTreeNode.data?.id
        ) ?? null
      );
    }
  }, [selectedTreeNode, filteredGraphData]);

  const handleZoomIn = useCallback(() => {
    graphRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    graphRef.current?.zoomOut();
  }, []);

  const handleFitToScreen = useCallback(() => {
    graphRef.current?.fitView();
  }, []);

  const handleFullscreen = useCallback(() => {
    const container = document.querySelector('.ontology-explorer');
    if (container) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        (container as HTMLElement).requestFullscreen();
        setIsFullscreen(true);
      }
    }
  }, []);

  const handleToggleMinimap = useCallback(() => {
    setIsMinimapVisible((prev) => !prev);
  }, []);

  const handleRearrange = useCallback(() => {
    graphRef.current?.runLayout();
  }, []);

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length < 2) {
        return prev;
      }
      const nextHistory = prev.slice(0, -1);
      const lastSnapshot = prev[prev.length - 1];
      setFuture((futurePrev) =>
        [lastSnapshot, ...futurePrev].slice(0, HISTORY_LIMIT)
      );
      applySnapshot(nextHistory[nextHistory.length - 1]);

      return nextHistory;
    });
  }, [applySnapshot]);

  const handleRedo = useCallback(() => {
    setFuture((prev) => {
      if (prev.length === 0) {
        return prev;
      }
      const [nextSnapshot, ...rest] = prev;
      setHistory((historyPrev) =>
        [...historyPrev, nextSnapshot].slice(-HISTORY_LIMIT)
      );
      applySnapshot(nextSnapshot);

      return rest;
    });
  }, [applySnapshot]);

  const handleSaveExploration = useCallback(() => {
    saveForm.validateFields().then((values) => {
      const newItem: SavedExploration = {
        id: crypto.randomUUID(),
        name: values.name,
        createdAt: Date.now(),
        snapshot: snapshot(true),
      };
      const updated = [newItem, ...savedExplorations];
      persistSavedExplorations(updated);
      setIsSaveModalOpen(false);
      saveForm.resetFields();
      showSuccessToast(t('label.saved'));
    });
  }, [persistSavedExplorations, saveForm, savedExplorations, snapshot, t]);

  const handleOpenExploration = useCallback(
    (item: SavedExploration) => {
      applySnapshot(item.snapshot);
      setIsSavedDrawerOpen(false);
    },
    [applySnapshot]
  );

  const handleDeleteExploration = useCallback(
    (id: string) => {
      const updated = savedExplorations.filter((item) => item.id !== id);
      persistSavedExplorations(updated);
    },
    [persistSavedExplorations, savedExplorations]
  );

  const handleNewExploration = useCallback(() => {
    setExplorationMode('model');
    setFilters(DEFAULT_FILTERS);
    setSettings(DEFAULT_SETTINGS);
    setSelectedNode(null);
    setSelectedTreeNode(null);
    setContextMenu(null);
    setSavedPositions(null);
  }, []);

  const handleGraphScopeChange = useCallback((value: string) => {
    if (value === 'all') {
      setFilters((prev) => ({ ...prev, glossaryIds: [] }));
    } else {
      setFilters((prev) => ({ ...prev, glossaryIds: [value] }));
    }
  }, []);

  const handleModeChange = useCallback(
    (mode: ExplorationMode) => {
      setExplorationMode(mode);
      if (mode === 'data') {
        modelFiltersRef.current = filters;
        const nextFilters: GraphFilters = {
          ...dataFiltersRef.current,
          relationTypes: [METRIC_RELATION_TYPE, ASSET_RELATION_TYPE],
          viewMode: 'overview' as GraphViewMode,
        };
        setFilters(nextFilters);
        setSettings((prev) => ({ ...prev, showMetrics: true }));
      } else {
        dataFiltersRef.current = filters;
        setFilters(modelFiltersRef.current);
      }
    },
    [filters]
  );

  const handleExpandNeighbors = useCallback(
    (node: OntologyNode, depth: number) => {
      setSelectedNode(node);
      graphRef.current?.focusNode(node.id);
      setFilters((prev) => ({
        ...prev,
        viewMode: 'neighborhood',
        depth,
        showCrossGlossaryOnly: false,
      }));
    },
    []
  );

  const handleGrowSelection = useCallback(
    (depth: number) => {
      const focusId = selectedNode?.id ?? selectedTreeNode?.data?.id;
      if (!focusId || !filteredGraphData?.nodes) {
        return;
      }
      const focusNode =
        filteredGraphData.nodes.find((n) => n.id === focusId) ?? null;
      if (!focusNode) {
        return;
      }
      handleExpandNeighbors(focusNode, depth);
    },
    [selectedNode, selectedTreeNode, filteredGraphData, handleExpandNeighbors]
  );

  const handleQuickAddOpen = useCallback((node?: OntologyNode) => {
    if (node) {
      setSelectedNode(node);
    }
    setQuickAddOpen(true);
  }, []);

  const handleQuickAddClose = useCallback(() => {
    setQuickAddOpen(false);
    setSelectedTermValues([]);
    setTermOptions([]);
    selectedTermMapRef.current.clear();
  }, []);

  const handleSearchGlossaryTerms = useCallback(async (searchText: string) => {
    setTermSearchLoading(true);
    try {
      const response = await fetchGlossaryList(searchText, 1);
      const options = response.data.map((item) => ({
        label: item.data.displayName || item.data.name || item.value,
        value: item.value,
        term: item.data,
      }));
      options.forEach((opt) => {
        selectedTermMapRef.current.set(opt.value, opt.term);
      });
      setTermOptions(options);
    } catch {
      setTermOptions([]);
    } finally {
      setTermSearchLoading(false);
    }
  }, []);

  const handleTermSelectionChange = useCallback((values: string[]) => {
    setSelectedTermValues(values);
  }, []);

  const handleAddRelation = useCallback(async () => {
    if (!selectedNode || !selectedNode.id) {
      return;
    }
    if (selectedNode.type === ASSET_NODE_TYPE) {
      return;
    }
    if (selectedTermValues.length === 0) {
      return;
    }
    setQuickAddSaving(true);
    try {
      const termRefs: EntityReference[] = selectedTermValues
        .map((value) => selectedTermMapRef.current.get(value))
        .filter((term): term is GlossaryTerm => Boolean(term))
        .filter((term) => Boolean(term.id))
        .map((term) => ({
          id: term.id,
          name: term.name,
          displayName: term.displayName,
          type: EntityType.GLOSSARY_TERM,
          fullyQualifiedName: term.fullyQualifiedName,
        }));

      if (selectedNode.type === METRIC_NODE_TYPE) {
        if (!selectedNode.fullyQualifiedName) {
          return;
        }
        const metric = await getMetricByFqn(selectedNode.fullyQualifiedName, {
          fields: 'tags',
        });
        if (!metric.id) {
          return;
        }
        const existingTags = metric.tags ?? [];
        const existingGlossaryTags = new Set(
          existingTags
            .filter((tag) => tag.source === TagSource.Glossary)
            .map((tag) => tag.tagFQN)
        );

        const newTags: TagLabel[] = selectedTermValues
          .filter((fqn) => !existingGlossaryTags.has(fqn))
          .map((fqn) => ({
            tagFQN: fqn,
            source: TagSource.Glossary,
            labelType: LabelType.Manual,
            state: State.Confirmed,
          }));

        const updatedMetric = {
          ...metric,
          tags: [...existingTags, ...newTags],
        };

        const jsonPatch = compare(omitBy(metric, isUndefined), updatedMetric);
        await patchMetric(metric.id, jsonPatch);
      } else {
        if (!selectedRelationType) {
          return;
        }
        await Promise.all(
          termRefs.map((termRef) =>
            addTermRelation(selectedNode.id, {
              relationType: selectedRelationType,
              term: termRef,
            })
          )
        );
      }
      showSuccessToast(t('label.updated'));
      setSelectedTermValues([]);
      fetchAllGlossaryData(glossaryId);
    } catch (error) {
      showErrorToast(
        error as AxiosError,
        t('server.entity-updating-error', { entity: t('label.relation') })
      );
    } finally {
      setQuickAddSaving(false);
    }
  }, [
    selectedNode,
    selectedRelationType,
    selectedTermValues,
    t,
    fetchAllGlossaryData,
    glossaryId,
  ]);

  const handleFocusSelected = useCallback(() => {
    if (selectedNode?.id) {
      graphRef.current?.focusNode(selectedNode.id);
    }
  }, [selectedNode]);

  const handleFocusHome = useCallback(() => {
    graphRef.current?.fitView();
  }, []);

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleContextMenuFocus = useCallback((node: OntologyNode) => {
    setSelectedNode(node);
    graphRef.current?.focusNode(node.id);
  }, []);

  const handleContextMenuViewDetails = useCallback((node: OntologyNode) => {
    setSelectedNode(node);
  }, []);

  const getNodePath = useCallback((node: OntologyNode) => {
    if (node.entityRef?.type && node.entityRef?.fullyQualifiedName) {
      return getEntityDetailsPath(
        node.entityRef.type as EntityType,
        node.entityRef.fullyQualifiedName
      );
    }
    if (node.type === METRIC_NODE_TYPE && node.fullyQualifiedName) {
      return getEntityDetailsPath(EntityType.METRIC, node.fullyQualifiedName);
    }
    if (node.fullyQualifiedName) {
      return getGlossaryTermDetailsPath(node.fullyQualifiedName);
    }

    return '';
  }, []);

  const handleContextMenuOpenInNewTab = useCallback(
    (node: OntologyNode) => {
      const path = getNodePath(node);
      if (!path) {
        return;
      }
      window.open(path, '_blank');
    },
    [getNodePath]
  );

  const handleRefresh = useCallback(() => {
    if (scope === 'global') {
      fetchAllGlossaryData();
    } else if (scope === 'glossary' && glossaryId) {
      fetchAllGlossaryData(glossaryId);
    }
  }, [scope, glossaryId, fetchAllGlossaryData]);

  const handleSettingsChange = useCallback((nextSettings: GraphSettings) => {
    setSettings((prev) => {
      if (prev.layout !== nextSettings.layout) {
        setSavedPositions(null);
      }

      return nextSettings;
    });
  }, []);

  const handleExport = useCallback(
    async (format: OntologyExportFormat = 'turtle') => {
      if (!rdfEnabled) {
        showErrorToast(t('message.rdf-not-enabled-for-export'));

        return;
      }

      if (glossaries.length === 0) {
        showErrorToast(t('message.no-glossary-to-export'));

        return;
      }

      setExporting(true);
      try {
        let exportCount = 0;
        if (glossaryId) {
          const glossary = glossaries.find((g) => g.id === glossaryId);
          await downloadGlossaryOntology(
            glossaryId,
            glossary?.name || 'glossary',
            format
          );
          exportCount = 1;
        } else if (glossaries.length === 1) {
          await downloadGlossaryOntology(
            glossaries[0].id,
            glossaries[0].name,
            format
          );
          exportCount = 1;
        } else if (glossaries.length > 1) {
          for (const glossary of glossaries) {
            await downloadGlossaryOntology(glossary.id, glossary.name, format);
            exportCount++;
          }
        }
        if (exportCount > 0) {
          showSuccessToast(
            exportCount === 1
              ? t('message.export-successful')
              : t('message.export-count-successful', { count: exportCount })
          );
        }
      } catch (error) {
        showErrorToast(error as AxiosError, t('message.export-failed'));
      } finally {
        setExporting(false);
      }
    },
    [rdfEnabled, glossaryId, glossaries, t]
  );

  const exportMenuItems: MenuProps['items'] = [
    { key: 'turtle', label: 'Turtle (.ttl)' },
    { key: 'rdfxml', label: 'RDF/XML (.rdf)' },
    { key: 'jsonld', label: 'JSON-LD (.jsonld)' },
    { key: 'ntriples', label: 'N-Triples (.nt)' },
  ];

  const handleNodeFocus = useCallback((nodeId: string) => {
    if (isValidUUID(nodeId)) {
      graphRef.current?.focusNode(nodeId);
    }
  }, []);

  const handleTreeNodeSelect = useCallback((node: ConceptsTreeNode) => {
    setSelectedTreeNode(node);

    // When a glossary is selected, filter the graph to show only that glossary's terms
    if (node.type === 'glossary' && node.data?.id) {
      setFilters((prevFilters) => {
        // If clicking the same glossary, toggle the filter off
        if (
          prevFilters.glossaryIds.length === 1 &&
          prevFilters.glossaryIds[0] === node.data?.id
        ) {
          return { ...prevFilters, glossaryIds: [] };
        }

        return { ...prevFilters, glossaryIds: [node.data?.id ?? ''] };
      });
    }
  }, []);

  const handleDetailsPanelNodeClick = useCallback(
    (nodeId: string) => {
      handleNodeFocus(nodeId);
      const node = filteredGraphData?.nodes.find((n) => n.id === nodeId);
      if (node) {
        setSelectedNode(node);
      }
    },
    [handleNodeFocus, filteredGraphData]
  );

  const handleGraphNodeClick = useCallback((node: OntologyNode) => {
    setContextMenu(null);
    setSelectedNode(node);
  }, []);

  const handleGraphNodeDoubleClick = useCallback(
    (node: OntologyNode) => {
      const path = getNodePath(node);
      if (!path) {
        return;
      }
      window.open(path, '_blank');
    },
    [getNodePath]
  );

  const handleGraphNodeContextMenu = useCallback(
    (node: OntologyNode, position: { x: number; y: number }) => {
      setContextMenu({ node, position });
    },
    []
  );

  const handleGraphPaneClick = useCallback(() => {
    setContextMenu(null);
    setSelectedNode(null);
  }, []);

  const handleSearchSelect = useCallback(
    (
      value: string,
      option: {
        type?: 'term' | 'metric' | 'asset' | 'glossary' | 'relationType';
        nodeId?: string;
        glossaryId?: string;
        relationType?: string;
      }
    ) => {
      if (option.type === 'term' && option.nodeId) {
        const node =
          combinedGraphData?.nodes.find((n) => n.id === option.nodeId) ?? null;
        if (node) {
          setSelectedNode(node);
          graphRef.current?.focusNode(node.id);
        }

        return;
      }

      if (option.type === 'metric' && option.nodeId) {
        const node =
          combinedGraphData?.nodes.find((n) => n.id === option.nodeId) ?? null;
        if (node) {
          setSelectedNode(node);
          graphRef.current?.focusNode(node.id);
        }

        return;
      }

      if (option.type === 'asset' && option.nodeId) {
        const node =
          combinedGraphData?.nodes.find((n) => n.id === option.nodeId) ?? null;
        if (node) {
          setSelectedNode(node);
          graphRef.current?.focusNode(node.id);
        }

        return;
      }

      if (option.type === 'glossary' && option.glossaryId) {
        setFilters((prev) => ({
          ...prev,
          glossaryIds: [option.glossaryId ?? ''],
          searchQuery: value,
        }));

        return;
      }

      if (option.type === 'relationType' && option.relationType) {
        setFilters((prev) => ({
          ...prev,
          relationTypes: [option.relationType ?? ''],
          searchQuery: value,
        }));
      }
    },
    [combinedGraphData]
  );

  const handleViewModeChange = useCallback(
    (viewMode: GraphViewMode) => {
      setFilters((prev) => {
        const next = { ...prev, viewMode };
        const dataRelations =
          explorationMode === 'data'
            ? [METRIC_RELATION_TYPE, ASSET_RELATION_TYPE]
            : [];

        switch (viewMode) {
          case 'hierarchy': {
            const hierarchicalTypes = relationTypes
              .filter((rt) => rt.category === 'hierarchical')
              .map((rt) => rt.name);
            const relationSet = new Set([
              ...hierarchicalTypes,
              'parentOf',
              ...dataRelations,
            ]);

            return {
              ...next,
              relationTypes: Array.from(relationSet),
              showCrossGlossaryOnly: false,
              depth: 0,
            };
          }
          case 'neighborhood': {
            return {
              ...next,
              showCrossGlossaryOnly: false,
              depth: prev.depth > 0 ? prev.depth : 1,
            };
          }
          case 'crossGlossary': {
            return {
              ...next,
              showCrossGlossaryOnly: true,
            };
          }
          case 'overview':
          default:
            return {
              ...next,
              relationTypes: [],
              showCrossGlossaryOnly: false,
              depth: 0,
            };
        }
      });
    },
    [relationTypes, explorationMode]
  );

  const statsText = useMemo(() => {
    if (!filteredGraphData) {
      return '';
    }
    const termCount = filteredGraphData.nodes.filter(
      (n) => n.type === 'glossaryTerm' || n.type === 'glossaryTermIsolated'
    ).length;
    const metricCount = filteredGraphData.nodes.filter(
      (n) => n.type === METRIC_NODE_TYPE
    ).length;
    const assetCount = filteredGraphData.nodes.filter(
      (n) => n.type === ASSET_NODE_TYPE
    ).length;
    const relationCount = filteredGraphData.edges.length;
    const isolatedCount = filteredGraphData.nodes.filter(
      (n) => n.type === 'glossaryTermIsolated'
    ).length;

    const sourceLabel = dataSource === 'rdf' ? ' (RDF)' : '';

    const metricText =
      metricCount > 0 ? ` • ${metricCount} ${t('label.metric-plural')}` : '';

    const assetText =
      explorationMode === 'data' && assetCount > 0
        ? ` • ${assetCount} ${t('label.data-asset-plural')}`
        : '';

    return `${termCount} ${t(
      'label.term-plural'
    )}${metricText}${assetText} • ${relationCount} ${t(
      'label.relation-plural'
    )} • ${isolatedCount} ${t('label.isolated')}${sourceLabel}`;
  }, [filteredGraphData, dataSource, explorationMode, t]);

  const canUndo = history.length > 1;
  const canRedo = future.length > 0;

  return (
    <div
      className={classNames('ontology-explorer', className)}
      style={{ height }}>
      {showHeader && (
        <div className="ontology-explorer-header">
          <Typography.Title className="header-title" level={4}>
            {t('label.ontology-explorer')}
          </Typography.Title>
          {filteredGraphData && (
            <Typography.Text className="header-stats" type="secondary">
              {statsText}
            </Typography.Text>
          )}
        </div>
      )}

      <div className="ontology-explorer-toolbar">
        <FilterToolbar
          filters={filters}
          glossaries={glossaries}
          relationTypes={relationTypesForFilters}
          searchOptions={searchOptions}
          onFiltersChange={setFilters}
          onSearchSelect={handleSearchSelect}
          onViewModeChange={handleViewModeChange}
        />

        <div className="ontology-explorer-actionbar">
          <Space wrap size="small">
            <Tooltip
              title={
                scope === 'global'
                  ? t('label.change-entity', { entity: t('label.glossary') })
                  : t('message.available-on-global-view')
              }>
              <Select
                className="actionbar-select"
                disabled={scope !== 'global'}
                options={[
                  { label: t('label.all-glossaries'), value: 'all' },
                  ...glossaries.map((glossary) => ({
                    label: glossary.displayName || glossary.name,
                    value: glossary.id,
                  })),
                ]}
                value={activeGlossaryId}
                onChange={handleGraphScopeChange}
              />
            </Tooltip>

            <Segmented
              options={[
                { label: t('label.model'), value: 'model' },
                { label: t('label.data'), value: 'data' },
              ]}
              size="small"
              value={explorationMode}
              onChange={(value) => handleModeChange(value as ExplorationMode)}
            />

            <Button
              icon={<PlusOutlined />}
              size="small"
              onClick={handleNewExploration}>
              {t('label.new')}
            </Button>

            <Button
              icon={<SaveOutlined />}
              size="small"
              onClick={() => setIsSaveModalOpen(true)}>
              {t('label.save')}
            </Button>

            <Button
              icon={<FolderOpenOutlined />}
              size="small"
              onClick={() => setIsSavedDrawerOpen(true)}>
              {t('label.open')}
            </Button>

            <Button
              disabled={!canUndo}
              icon={<UndoOutlined />}
              size="small"
              onClick={handleUndo}
            />

            <Button
              disabled={!canRedo}
              icon={<RedoOutlined />}
              size="small"
              onClick={handleRedo}
            />

            <Dropdown
              menu={{
                items: [
                  { key: '1', label: t('label.expand-1-hops') },
                  { key: '2', label: t('label.expand-2-hops') },
                ],
                onClick: ({ key }) => handleGrowSelection(Number(key)),
              }}>
              <Button
                disabled={!selectedNode && !selectedTreeNode}
                icon={<ExpandOutlined />}
                size="small">
                {t('label.grow-selection')}
              </Button>
            </Dropdown>

            <Button
              icon={<FullscreenOutlined />}
              size="small"
              onClick={handleFullscreen}
            />

            <Button
              icon={<ApartmentOutlined />}
              size="small"
              onClick={() => handleQuickAddOpen(selectedNode ?? undefined)}>
              {t('label.quick-add')}
            </Button>
          </Space>
        </div>
      </div>

      <div className="ontology-explorer-content">
        {scope !== 'term' && (
          <ConceptsTree
            entityId={entityId}
            glossaryId={glossaryId}
            scope={scope}
            selectedNodeId={selectedTreeNode?.key}
            onNodeFocus={handleNodeFocus}
            onNodeSelect={handleTreeNodeSelect}
          />
        )}

        <div className="ontology-explorer-graph">
          <div className="ontology-explorer-controls">
            <GraphSettingsPanel
              settings={settings}
              onSettingsChange={handleSettingsChange}
            />

            <OntologyControlButtons
              isFullscreen={isFullscreen}
              isLoading={loading}
              isMinimapVisible={isMinimapVisible}
              onFitToScreen={handleFitToScreen}
              onFocusHome={handleFocusHome}
              onFocusSelected={selectedNode ? handleFocusSelected : undefined}
              onFullscreen={handleFullscreen}
              onRearrange={handleRearrange}
              onRefresh={handleRefresh}
              onToggleMinimap={handleToggleMinimap}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
            />

            {rdfEnabled && (
              <Dropdown
                menu={{
                  items: exportMenuItems,
                  onClick: ({ key }) =>
                    handleExport(key as OntologyExportFormat),
                }}
                placement="bottomRight">
                <Button
                  icon={<DownloadOutlined />}
                  loading={exporting}
                  size="small">
                  {t('label.export')}
                </Button>
              </Dropdown>
            )}
          </div>

          {loading ? (
            <div className="ontology-explorer-loading">
              <Spin size="large" />
              <Typography.Text className="m-t-md" type="secondary">
                {t('label.loading-graph')}
              </Typography.Text>
            </div>
          ) : !filteredGraphData || filteredGraphData.nodes.length === 0 ? (
            <div className="ontology-explorer-empty">
              <Empty
                description={t('message.no-glossary-terms-found')}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </div>
          ) : (
            <div className="ontology-explorer-canvas">
              <CytoscapeGraph
                edges={filteredGraphData.edges}
                glossaryColorMap={glossaryColorMap}
                nodePositions={savedPositions ?? undefined}
                nodes={filteredGraphData.nodes}
                ref={graphRef}
                selectedNodeId={selectedNode?.id}
                settings={settings}
                onNodeClick={handleGraphNodeClick}
                onNodeContextMenu={handleGraphNodeContextMenu}
                onNodeDoubleClick={handleGraphNodeDoubleClick}
                onPaneClick={handleGraphPaneClick}
              />
              <OntologyLegend edges={filteredGraphData.edges} />
            </div>
          )}

          {selectedNode && (
            <DetailsPanel
              edges={filteredGraphData?.edges}
              node={selectedNode}
              nodes={filteredGraphData?.nodes}
              relationTypes={relationTypes}
              onAddRelation={(node) => handleQuickAddOpen(node)}
              onClose={() => setSelectedNode(null)}
              onFocusNode={handleFocusSelected}
              onNavigate={(node) => {
                const path = getNodePath(node);
                if (!path) {
                  return;
                }
                navigate(path);
              }}
              onNodeClick={handleDetailsPanelNodeClick}
            />
          )}

          {contextMenu && (
            <NodeContextMenu
              node={contextMenu.node}
              position={contextMenu.position}
              onAddRelation={handleQuickAddOpen}
              onClose={handleContextMenuClose}
              onExpandNeighbors={handleExpandNeighbors}
              onFocus={handleContextMenuFocus}
              onOpenInNewTab={handleContextMenuOpenInNewTab}
              onViewDetails={handleContextMenuViewDetails}
            />
          )}
        </div>
      </div>

      <Modal
        destroyOnClose
        open={isSaveModalOpen}
        title={t('label.save-exploration')}
        onCancel={() => setIsSaveModalOpen(false)}
        onOk={handleSaveExploration}>
        <Form form={saveForm} layout="vertical">
          <Form.Item
            label={t('label.name')}
            name="name"
            rules={[
              {
                required: true,
                message: t('label.field-required', { field: t('label.name') }),
              },
            ]}>
            <Input
              placeholder={t('label.enter-entity', { entity: t('label.name') })}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        open={isSavedDrawerOpen}
        placement="right"
        title={t('label.saved-explorations')}
        width={420}
        onClose={() => setIsSavedDrawerOpen(false)}>
        <List
          dataSource={savedExplorations}
          locale={{ emptyText: t('label.no-data-found') }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button
                  key="open"
                  size="small"
                  type="link"
                  onClick={() => handleOpenExploration(item)}>
                  {t('label.open')}
                </Button>,
                <Button
                  danger
                  key="delete"
                  size="small"
                  type="link"
                  onClick={() => handleDeleteExploration(item.id)}>
                  {t('label.delete')}
                </Button>,
              ]}>
              <List.Item.Meta
                description={new Date(item.createdAt).toLocaleString()}
                title={item.name}
              />
            </List.Item>
          )}
        />
      </Drawer>

      <Drawer
        open={quickAddOpen}
        placement="right"
        title={t('label.quick-add')}
        width={420}
        onClose={handleQuickAddClose}>
        <div className="quick-add-panel">
          {(() => {
            const isMetric = selectedNode?.type === METRIC_NODE_TYPE;
            const isAsset = selectedNode?.type === ASSET_NODE_TYPE;
            const editEntityLabel = isMetric
              ? t('label.metric')
              : isAsset
              ? t('label.data-asset')
              : t('label.glossary-term');

            return (
              <>
                <Typography.Text type="secondary">
                  {selectedNode?.label ?? t('label.select-entity')}
                </Typography.Text>

                <Divider />

                <Typography.Text strong>
                  {isMetric
                    ? t('label.glossary-term-plural')
                    : t('label.relationships')}
                </Typography.Text>
                {!isMetric && !isAsset && (
                  <div className="m-t-sm">
                    <Select
                      className="w-full"
                      options={relationTypes.map((rt) => ({
                        label: rt.displayName || rt.name,
                        value: rt.name,
                      }))}
                      placeholder={t('label.select-entity', {
                        entity: t('label.relation-type'),
                      })}
                      value={selectedRelationType}
                      onChange={setSelectedRelationType}
                    />
                  </div>
                )}
                <div className="m-t-sm">
                  <Select
                    className="w-full"
                    filterOption={false}
                    loading={termSearchLoading}
                    mode="multiple"
                    options={termOptions.map((option) => ({
                      label: option.label,
                      value: option.value,
                    }))}
                    placeholder={t('label.search-for-type', {
                      type: t('label.glossary-term'),
                    })}
                    value={selectedTermValues}
                    onChange={handleTermSelectionChange}
                    onDropdownVisibleChange={(open) => {
                      if (open && termOptions.length === 0) {
                        handleSearchGlossaryTerms('');
                      }
                    }}
                    onSearch={handleSearchGlossaryTerms}
                  />
                </div>
                <Button
                  className="m-t-sm"
                  disabled={
                    !selectedNode ||
                    isAsset ||
                    selectedTermValues.length === 0 ||
                    (!isMetric && !selectedRelationType)
                  }
                  loading={quickAddSaving}
                  type="primary"
                  onClick={handleAddRelation}>
                  {isMetric
                    ? t('label.add-entity', {
                        entity: t('label.glossary-term'),
                      })
                    : t('label.add-entity', { entity: t('label.relation') })}
                </Button>

                {isMetric && (
                  <Typography.Text className="m-t-sm d-block" type="secondary">
                    {t('message.metric-tags-info')}
                  </Typography.Text>
                )}

                {isAsset && (
                  <Typography.Text className="m-t-sm d-block" type="secondary">
                    {t('message.asset-relations-select-term')}
                  </Typography.Text>
                )}

                <Divider />

                <Typography.Text strong>
                  {t('label.properties')}
                </Typography.Text>
                <div className="m-t-sm">
                  <Button
                    block
                    disabled={!selectedNode?.fullyQualifiedName}
                    onClick={() => {
                      if (!selectedNode?.fullyQualifiedName) {
                        return;
                      }
                      const path = getNodePath(selectedNode);
                      window.open(path, '_blank');
                    }}>
                    {t('label.edit-entity', { entity: editEntityLabel })}
                  </Button>
                </div>

                <div className="m-t-sm">
                  <Tag color="blue">{t('label.tip')}</Tag>
                  <Typography.Text type="secondary">
                    {t('message.quick-add-tip')}
                  </Typography.Text>
                </div>
              </>
            );
          })()}
        </div>
      </Drawer>
    </div>
  );
};

export default OntologyExplorer;
