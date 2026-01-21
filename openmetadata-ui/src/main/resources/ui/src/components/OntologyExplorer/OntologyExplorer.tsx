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
  DownloadOutlined,
  FullscreenOutlined,
  ReloadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import {
  Button,
  Dropdown,
  Empty,
  MenuProps,
  Space,
  Spin,
  Tooltip,
  Typography,
} from 'antd';
import { AxiosError } from 'axios';
import classNames from 'classnames';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { DataSet } from 'vis-data';
import { Data, Edge, Network, Options } from 'vis-network';
import { EntityType, TabSpecificField } from '../../enums/entity.enum';
import { Glossary } from '../../generated/entity/data/glossary';
import { GlossaryTerm } from '../../generated/entity/data/glossaryTerm';
import { TermRelation } from '../../generated/type/termRelation';
import { getGlossariesList, getGlossaryTerms } from '../../rest/glossaryAPI';
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
import { getEntityDetailsPath } from '../../utils/RouterUtils';
import { showErrorToast, showSuccessToast } from '../../utils/ToastUtils';
import { useGenericContext } from '../Customization/GenericProvider/GenericProvider';
import ConceptsTree from './ConceptsTree';
import DetailsPanel from './DetailsPanel';
import FilterToolbar from './FilterToolbar';
import GraphSettingsPanel from './GraphSettingsPanel';
import {
  ConceptsTreeNode,
  GraphFilters,
  GraphSettings,
  OntologyEdge,
  OntologyExplorerProps,
  OntologyGraphData,
  OntologyNode,
} from './OntologyExplorer.interface';
import './OntologyExplorer.style.less';

const isValidUUID = (str: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  return uuidRegex.test(str);
};

const GLOSSARY_COLORS = [
  '#1890ff',
  '#52c41a',
  '#722ed1',
  '#eb2f96',
  '#fa8c16',
  '#13c2c2',
  '#2f54eb',
  '#faad14',
  '#a0d911',
  '#f5222d',
];

const DEFAULT_RELATION_COLORS: Record<string, string> = {
  relatedTo: '#1890ff',
  related: '#1890ff',
  synonym: '#722ed1',
  antonym: '#f5222d',
  typeOf: '#52c41a',
  hasTypes: '#73d13d',
  hasA: '#13c2c2',
  partOf: '#36cfc9',
  hasPart: '#5cdbd3',
  componentOf: '#13c2c2',
  composedOf: '#36cfc9',
  calculatedFrom: '#faad14',
  usedToCalculate: '#ffc53d',
  derivedFrom: '#fa8c16',
  seeAlso: '#eb2f96',
  parentOf: '#597ef7',
  childOf: '#85a5ff',
  broader: '#597ef7',
  narrower: '#85a5ff',
  isA: '#52c41a',
  instanceOf: '#73d13d',
  owns: '#722ed1',
  ownedBy: '#9254de',
  manages: '#2f54eb',
  managedBy: '#597ef7',
  contains: '#13c2c2',
  containedIn: '#36cfc9',
  dependsOn: '#fa541c',
  usedBy: '#faad14',
};

const RELATION_DISPLAY_NAMES: Record<string, string> = {
  relatedTo: 'Related To',
  related: 'Related To',
  synonym: 'Synonym',
  antonym: 'Antonym',
  typeOf: 'Type Of',
  hasTypes: 'Has Types',
  hasA: 'Has A',
  partOf: 'Part Of',
  hasPart: 'Has Part',
  componentOf: 'Component Of',
  composedOf: 'Composed Of',
  calculatedFrom: 'Calculated From',
  usedToCalculate: 'Used To Calculate',
  derivedFrom: 'Derived From',
  seeAlso: 'See Also',
  parentOf: 'Parent Of',
  childOf: 'Child Of',
  broader: 'Broader',
  narrower: 'Narrower',
  isA: 'Is A',
  instanceOf: 'Instance Of',
  owns: 'Owns',
  ownedBy: 'Owned By',
  manages: 'Manages',
  managedBy: 'Managed By',
  contains: 'Contains',
  containedIn: 'Contained In',
  dependsOn: 'Depends On',
  usedBy: 'Used By',
};

/**
 * Format a relation type name for display when not found in settings or defaults.
 * Converts camelCase to Title Case with spaces (e.g., "calculatedFrom" -> "Calculated From")
 */
const formatRelationTypeName = (relationType: string): string => {
  if (!relationType) {
    return 'Related To';
  }

  // Insert space before capital letters and capitalize first letter
  return relationType
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};

/**
 * Generate a consistent color for a relation type based on its name.
 * Uses a hash function to generate a hue value for HSL color.
 */
const generateRelationColor = (relationType: string): string => {
  if (!relationType) {
    return '#8c8c8c';
  }
  // Simple hash function to generate a consistent hue
  let hash = 0;
  for (let i = 0; i < relationType.length; i++) {
    hash = relationType.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;

  // Use medium saturation and lightness for readable colors
  return `hsl(${hue}, 65%, 50%)`;
};

const DEFAULT_SETTINGS: GraphSettings = {
  layout: 'force',
  nodeColorMode: 'glossary',
  nodeSizeMode: 'uniform',
  showEdgeLabels: true,
  showNodeDescriptions: false,
  highlightOnHover: true,
  animateTransitions: true,
  physicsEnabled: true,
};

const DEFAULT_FILTERS: GraphFilters = {
  glossaryIds: [],
  relationTypes: [],
  hierarchyLevels: [],
  showIsolatedNodes: true,
  searchQuery: '',
};

const DEFAULT_LIMIT = 500;

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
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesDataSetRef = useRef<DataSet<OntologyNode> | null>(null);
  const edgesDataSetRef = useRef<DataSet<Edge> | null>(null);

  const contextData = useGenericContext<GlossaryTerm>();
  const entityId =
    propEntityId ?? (scope === 'term' ? contextData?.data?.id : undefined);

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [graphData, setGraphData] = useState<OntologyGraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<OntologyNode | null>(null);
  const [selectedTreeNode, setSelectedTreeNode] =
    useState<ConceptsTreeNode | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [rdfEnabled, setRdfEnabled] = useState<boolean | null>(null);
  const [dataSource, setDataSource] = useState<'rdf' | 'database'>('database');
  const [relationTypes, setRelationTypes] = useState<
    GlossaryTermRelationType[]
  >([]);
  const [glossaries, setGlossaries] = useState<Glossary[]>([]);
  const [settings, setSettings] = useState<GraphSettings>(DEFAULT_SETTINGS);
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_FILTERS);

  const glossaryColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    glossaries.forEach((g, i) => {
      map[g.id] = GLOSSARY_COLORS[i % GLOSSARY_COLORS.length];
    });

    return map;
  }, [glossaries]);

  const filteredGraphData = useMemo(() => {
    if (!graphData) {
      return null;
    }

    let filteredNodes = [...graphData.nodes];
    let filteredEdges = [...graphData.edges];

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
      filteredNodes = filteredNodes.filter((n) =>
        n.type === 'glossary'
          ? filters.glossaryIds.includes(n.id)
          : n.glossaryId && filters.glossaryIds.includes(n.glossaryId)
      );
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
  }, [graphData, filters, scope, entityId]);

  const networkOptions: Options = useMemo(
    () => ({
      nodes: {
        shape: 'box',
        widthConstraint: { minimum: 100, maximum: 200 },
        heightConstraint: { minimum: 36, maximum: 60 },
        font: {
          size: 12,
          color: '#262626',
          face: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          multi: 'html',
        },
        borderWidth: 2,
        borderWidthSelected: 3,
        shadow: {
          enabled: true,
          color: 'rgba(0,0,0,0.1)',
          size: 8,
          x: 2,
          y: 2,
        },
        margin: { top: 8, bottom: 8, left: 12, right: 12 },
      },
      edges: {
        width: 2,
        color: { color: '#d9d9d9', highlight: '#1890ff', hover: '#40a9ff' },
        arrows: { to: { enabled: true, scaleFactor: 0.6, type: 'arrow' } },
        font: {
          size: settings.showEdgeLabels ? 11 : 0,
          align: 'middle',
          background: '#ffffff',
          strokeWidth: 3,
          strokeColor: '#ffffff',
          color: '#434343',
          face: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        },
        smooth: {
          enabled: true,
          type: 'dynamic',
          roundness: 0.5,
        },
        chosen: true,
        labelHighlightBold: false,
      },
      layout:
        settings.layout === 'hierarchical'
          ? {
              hierarchical: {
                direction: 'LR',
                sortMethod: 'directed',
                levelSeparation: 280,
                nodeSpacing: 120,
                treeSpacing: 180,
                blockShifting: true,
                edgeMinimization: true,
              },
            }
          : settings.layout === 'radial'
          ? { improvedLayout: true, randomSeed: 42 }
          : settings.layout === 'circular'
          ? { improvedLayout: true, randomSeed: 42 }
          : { improvedLayout: true, randomSeed: 42 },
      physics: {
        enabled: settings.physicsEnabled && settings.layout === 'force',
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -120,
          centralGravity: 0.005,
          springLength: 250,
          springConstant: 0.08,
          damping: 0.4,
          avoidOverlap: 1,
        },
        stabilization: {
          enabled: true,
          iterations: 400,
          updateInterval: 25,
          fit: true,
        },
        minVelocity: 0.75,
      },
      interaction: {
        hover: true,
        tooltipDelay: 100,
        hideEdgesOnDrag: false,
        hideEdgesOnZoom: false,
        navigationButtons: false,
        keyboard: { enabled: true },
        multiselect: true,
      },
    }),
    [settings]
  );

  const getNodeColor = useCallback(
    (node: OntologyNode, isHovered: boolean, isNeighbor: boolean) => {
      const isIsolated = node.type === 'glossaryTermIsolated';
      const isGlossary = node.type === 'glossary';
      const isFaded =
        hoveredNodeId && !isHovered && !isNeighbor && settings.highlightOnHover;

      let baseColor = '#1890ff';
      let bgColor = '#e6f7ff';

      if (settings.nodeColorMode === 'glossary' && node.glossaryId) {
        baseColor = glossaryColorMap[node.glossaryId] || '#1890ff';
        bgColor = `${baseColor}15`;
      } else if (isGlossary) {
        baseColor = '#52c41a';
        bgColor = '#f6ffed';
      } else if (isIsolated) {
        baseColor = '#fa8c16';
        bgColor = '#fff7e6';
      }

      const opacity = isFaded ? 0.3 : 1;

      return {
        background: isFaded ? '#f5f5f5' : bgColor,
        border: baseColor,
        highlight: { background: bgColor, border: baseColor },
        hover: { background: bgColor, border: baseColor },
        opacity,
      };
    },
    [hoveredNodeId, settings, glossaryColorMap]
  );

  const getEdgeColor = useCallback(
    (edge: OntologyEdge) => {
      // 1. Check settings for configured color
      const relationType = relationTypes.find(
        (rt) => rt.name === edge.relationType
      );
      if (relationType?.color) {
        return relationType.color;
      }

      // 2. Check hardcoded defaults
      if (DEFAULT_RELATION_COLORS[edge.relationType]) {
        return DEFAULT_RELATION_COLORS[edge.relationType];
      }

      // 3. Generate a consistent color based on the relation type name
      return generateRelationColor(edge.relationType);
    },
    [relationTypes]
  );

  const getEdgeLabel = useCallback(
    (edge: OntologyEdge) => {
      if (!settings.showEdgeLabels) {
        return '';
      }

      // 1. Check settings for configured display name
      const relationType = relationTypes.find(
        (rt) => rt.name === edge.relationType
      );
      if (relationType?.displayName) {
        return relationType.displayName;
      }

      // 2. Check hardcoded defaults
      if (RELATION_DISPLAY_NAMES[edge.relationType]) {
        return RELATION_DISPLAY_NAMES[edge.relationType];
      }

      // 3. Format the relation type name dynamically
      return formatRelationTypeName(edge.relationType);
    },
    [relationTypes, settings.showEdgeLabels]
  );

  const convertRdfGraphToOntologyGraph = useCallback(
    (rdfData: GraphData): OntologyGraphData => {
      const nodes: OntologyNode[] = rdfData.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        type: node.type || 'glossaryTerm',
        fullyQualifiedName: node.fullyQualifiedName,
        description: node.description,
      }));

      const edges: OntologyEdge[] = rdfData.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        label: edge.label,
        relationType: edge.relationType || 'relatedTo',
      }));

      return { nodes, edges };
    },
    []
  );

  const buildGraphFromAllTerms = useCallback(
    (terms: GlossaryTerm[], glossaryList: Glossary[]): OntologyGraphData => {
      const nodesMap = new Map<string, OntologyNode>();
      const edges: OntologyEdge[] = [];
      const edgeSet = new Set<string>();

      glossaryList.forEach((glossary) => {
        nodesMap.set(glossary.id, {
          id: glossary.id,
          label: glossary.displayName || glossary.name,
          type: 'glossary',
          fullyQualifiedName: glossary.fullyQualifiedName,
          description: glossary.description,
        });
      });

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
              const edgeKey = `${relationType}-${[term.id, relatedTermRef.id]
                .sort()
                .join('-')}`;
              if (!edgeSet.has(edgeKey)) {
                edgeSet.add(edgeKey);
                edges.push({
                  from: term.id,
                  to: relatedTermRef.id,
                  label: relationType,
                  relationType: relationType,
                });
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
    async (glossaryIdParam?: string) => {
      try {
        const rdfData = await getGlossaryTermGraph({
          glossaryId: glossaryIdParam,
          limit: DEFAULT_LIMIT,
          includeIsolated: true,
        });

        if (rdfData.nodes && rdfData.nodes.length > 0) {
          setDataSource(rdfData.source === 'database' ? 'database' : 'rdf');

          return convertRdfGraphToOntologyGraph(rdfData);
        }

        return null;
      } catch {
        return null;
      }
    },
    [convertRdfGraphToOntologyGraph]
  );

  const fetchGraphDataFromDatabase = useCallback(
    async (glossaryIdParam?: string) => {
      const glossariesResponse = await getGlossariesList({
        fields: 'owners,tags',
        limit: 100,
      });

      const fetchedGlossaries = glossariesResponse.data;
      setGlossaries(fetchedGlossaries);
      const allTerms: GlossaryTerm[] = [];

      const glossariesToFetch = glossaryIdParam
        ? fetchedGlossaries.filter((g) => g.id === glossaryIdParam)
        : fetchedGlossaries;

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
    [buildGraphFromAllTerms]
  );

  const fetchAllGlossaryData = useCallback(
    async (glossaryIdParam?: string) => {
      setLoading(true);
      try {
        let data: OntologyGraphData | null = null;

        if (rdfEnabled) {
          data = await fetchGraphDataFromRdf(glossaryIdParam);
        }

        if (!data || data.nodes.length === 0) {
          setDataSource('database');
          data = await fetchGraphDataFromDatabase(glossaryIdParam);
        }

        setGraphData(data);
      } catch (error) {
        showErrorToast(error as AxiosError, t('server.entity-fetch-error'));
        setGraphData(null);
      } finally {
        setLoading(false);
      }
    },
    [rdfEnabled, fetchGraphDataFromRdf, fetchGraphDataFromDatabase, t]
  );

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

  // Create and update network
  useEffect(() => {
    if (!containerRef.current || !filteredGraphData || loading) {
      return;
    }

    const container = containerRef.current;
    if (container.offsetWidth === 0 || container.offsetHeight === 0) {
      const timer = setTimeout(() => {
        networkRef.current?.redraw();
        networkRef.current?.fit();
      }, 100);

      return () => clearTimeout(timer);
    }

    const getNeighborIds = (nodeId: string): Set<string> => {
      const neighbors = new Set<string>();
      filteredGraphData.edges.forEach((edge) => {
        if (edge.from === nodeId) {
          neighbors.add(edge.to);
        }
        if (edge.to === nodeId) {
          neighbors.add(edge.from);
        }
      });

      return neighbors;
    };

    const neighborIds = hoveredNodeId
      ? getNeighborIds(hoveredNodeId)
      : new Set<string>();

    const enhancedNodes = filteredGraphData.nodes.map((node) => {
      const isHovered = node.id === hoveredNodeId;
      const isNeighbor = neighborIds.has(node.id);
      const isGlossary = node.type === 'glossary';
      const isIsolated = node.type === 'glossaryTermIsolated';

      const icon = isGlossary ? '📚' : isIsolated ? '◯' : '●';
      const colors = getNodeColor(node, isHovered, isNeighbor);

      return {
        ...node,
        label: `<b>${icon}</b> ${node.label}`,
        color: colors,
        font: {
          size: isHovered ? 14 : 12,
          bold: isHovered,
          color: colors.opacity < 1 ? '#bfbfbf' : '#262626',
        },
        borderWidth: isHovered ? 3 : 2,
        opacity: colors.opacity,
      };
    });

    const enhancedEdges = filteredGraphData.edges.map((edge, index) => {
      const isConnectedToHovered =
        hoveredNodeId &&
        (edge.from === hoveredNodeId || edge.to === hoveredNodeId);
      const isFaded =
        hoveredNodeId && !isConnectedToHovered && settings.highlightOnHover;
      const edgeColor = getEdgeColor(edge);

      return {
        ...edge,
        id: `edge-${index}`,
        label: getEdgeLabel(edge),
        color: {
          color: isFaded ? '#e8e8e8' : edgeColor,
          highlight: edgeColor,
          hover: edgeColor,
          opacity: isFaded ? 0.3 : 1,
        },
        width: isConnectedToHovered ? 3 : 2,
      };
    });

    nodesDataSetRef.current = new DataSet(enhancedNodes);
    edgesDataSetRef.current = new DataSet(enhancedEdges as Edge[]);

    const data = {
      nodes: nodesDataSetRef.current as unknown,
      edges: edgesDataSetRef.current,
    } as Data;

    if (networkRef.current) {
      networkRef.current.destroy();
    }

    networkRef.current = new Network(container, data, networkOptions);

    // Event handlers
    networkRef.current.on('click', (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = nodesDataSetRef.current?.get(
          nodeId
        ) as unknown as OntologyNode;
        setSelectedNode(node);
      } else {
        setSelectedNode(null);
      }
    });

    networkRef.current.on('doubleClick', (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = nodesDataSetRef.current?.get(
          nodeId
        ) as unknown as OntologyNode;
        if (node?.fullyQualifiedName) {
          const entityType =
            node.type === 'glossary'
              ? EntityType.GLOSSARY
              : EntityType.GLOSSARY_TERM;
          const path = getEntityDetailsPath(
            entityType,
            node.fullyQualifiedName
          );
          window.open(path, '_blank');
        }
      }
    });

    networkRef.current.on('hoverNode', (params) => {
      if (settings.highlightOnHover) {
        setHoveredNodeId(params.node);
      }
    });

    networkRef.current.on('blurNode', () => {
      if (settings.highlightOnHover) {
        setHoveredNodeId(null);
      }
    });

    networkRef.current.on('stabilizationIterationsDone', () => {
      networkRef.current?.setOptions({ physics: { enabled: false } });
      if (settings.animateTransitions) {
        networkRef.current?.fit({
          animation: { duration: 500, easingFunction: 'easeInOutQuad' },
        });
      } else {
        networkRef.current?.fit();
      }
    });

    return () => {
      networkRef.current?.destroy();
    };
  }, [
    filteredGraphData,
    loading,
    networkOptions,
    hoveredNodeId,
    settings,
    getNodeColor,
    getEdgeColor,
    getEdgeLabel,
  ]);

  // Focus on selected tree node
  useEffect(() => {
    if (networkRef.current && selectedTreeNode?.data?.id) {
      const nodeId = selectedTreeNode.data.id;
      try {
        const nodePositions = networkRef.current.getPositions([nodeId]);
        if (nodePositions && nodePositions[nodeId]) {
          networkRef.current.selectNodes([nodeId]);
          networkRef.current.focus(nodeId, {
            scale: 1.5,
            animation: settings.animateTransitions
              ? { duration: 500, easingFunction: 'easeInOutQuad' }
              : false,
          });
        }
      } catch {
        // Node not found
      }
    }
  }, [selectedTreeNode, settings.animateTransitions]);

  const handleZoomIn = useCallback(() => {
    const scale = networkRef.current?.getScale() || 1;
    networkRef.current?.moveTo({ scale: scale * 1.3 });
  }, []);

  const handleZoomOut = useCallback(() => {
    const scale = networkRef.current?.getScale() || 1;
    networkRef.current?.moveTo({ scale: scale * 0.7 });
  }, []);

  const handleFitToScreen = useCallback(() => {
    networkRef.current?.fit({
      animation: settings.animateTransitions
        ? { duration: 500, easingFunction: 'easeInOutQuad' }
        : false,
    });
  }, [settings.animateTransitions]);

  const handleFullscreen = useCallback(() => {
    const container = document.querySelector('.ontology-explorer');
    if (container) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        (container as HTMLElement).requestFullscreen();
      }
    }
  }, []);

  const handleRefresh = useCallback(() => {
    if (scope === 'global') {
      fetchAllGlossaryData();
    } else if (scope === 'glossary' && glossaryId) {
      fetchAllGlossaryData(glossaryId);
    }
  }, [scope, glossaryId, fetchAllGlossaryData]);

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

  const handleNodeFocus = useCallback(
    (nodeId: string) => {
      if (networkRef.current && isValidUUID(nodeId)) {
        try {
          const nodePositions = networkRef.current.getPositions([nodeId]);
          if (nodePositions && nodePositions[nodeId]) {
            networkRef.current.selectNodes([nodeId]);
            networkRef.current.focus(nodeId, {
              scale: 1.5,
              animation: settings.animateTransitions
                ? { duration: 500, easingFunction: 'easeInOutQuad' }
                : false,
            });
          }
        } catch {
          // Node not found
        }
      }
    },
    [settings.animateTransitions]
  );

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

  const statsText = useMemo(() => {
    if (!filteredGraphData) {
      return '';
    }
    const termCount = filteredGraphData.nodes.filter(
      (n) => n.type === 'glossaryTerm' || n.type === 'glossaryTermIsolated'
    ).length;
    const relationCount = filteredGraphData.edges.length;
    const isolatedCount = filteredGraphData.nodes.filter(
      (n) => n.type === 'glossaryTermIsolated'
    ).length;

    const sourceLabel = dataSource === 'rdf' ? ' (RDF)' : '';

    return `${termCount} ${t('label.term-plural')} • ${relationCount} ${t(
      'label.relation-plural'
    )} • ${isolatedCount} ${t('label.isolated')}${sourceLabel}`;
  }, [filteredGraphData, dataSource, t]);

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
          relationTypes={relationTypes}
          onFiltersChange={setFilters}
        />
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
            <div className="control-group">
              <GraphSettingsPanel
                settings={settings}
                onSettingsChange={setSettings}
              />
            </div>

            <div className="control-group">
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
                  <Button
                    icon={<AimOutlined />}
                    size="small"
                    onClick={handleFitToScreen}
                  />
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
                    onClick={handleRefresh}
                  />
                </Tooltip>
              </Space.Compact>
            </div>

            {rdfEnabled && (
              <div className="control-group">
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
              </div>
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
            <div className="ontology-explorer-canvas" ref={containerRef} />
          )}

          {selectedNode && (
            <DetailsPanel
              edges={filteredGraphData?.edges}
              node={selectedNode}
              nodes={filteredGraphData?.nodes}
              onClose={() => setSelectedNode(null)}
              onNavigate={(node) => {
                if (node.fullyQualifiedName) {
                  const entityType =
                    node.type === 'glossary'
                      ? EntityType.GLOSSARY
                      : EntityType.GLOSSARY_TERM;
                  const path = getEntityDetailsPath(
                    entityType,
                    node.fullyQualifiedName
                  );
                  navigate(path);
                }
              }}
              onNodeClick={handleDetailsPanelNodeClick}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default OntologyExplorer;
