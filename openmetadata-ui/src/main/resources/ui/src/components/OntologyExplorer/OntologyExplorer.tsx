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

import { DownloadOutlined } from '@ant-design/icons';
import { Button, Dropdown, Empty, MenuProps, Spin, Typography } from 'antd';
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
import { TabSpecificField } from '../../enums/entity.enum';
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
import { getGlossaryTermDetailsPath } from '../../utils/RouterUtils';
import { showErrorToast, showSuccessToast } from '../../utils/ToastUtils';
import { useGenericContext } from '../Customization/GenericProvider/GenericProvider';
import ConceptsTree from './ConceptsTree';
import CytoscapeGraph from './CytoscapeGraph';
import DetailsPanel from './DetailsPanel';
import FilterToolbar from './FilterToolbar';
import GraphSettingsPanel from './GraphSettingsPanel';
import NodeContextMenu from './NodeContextMenu';
import OntologyControlButtons from './OntologyControlButtons';
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
  const graphRef = useRef<{
    fitView: () => void;
    focusNode: (nodeId: string) => void;
  } | null>(null);

  const contextData = useGenericContext<GlossaryTerm>();
  const entityId =
    propEntityId ?? (scope === 'term' ? contextData?.data?.id : undefined);

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [graphData, setGraphData] = useState<OntologyGraphData | null>(null);
  const [selectedNode, setSelectedNode] = useState<OntologyNode | null>(null);
  const [selectedTreeNode, setSelectedTreeNode] =
    useState<ConceptsTreeNode | null>(null);
  const [rdfEnabled, setRdfEnabled] = useState<boolean | null>(null);
  const [dataSource, setDataSource] = useState<'rdf' | 'database'>('database');
  const [relationTypes, setRelationTypes] = useState<
    GlossaryTermRelationType[]
  >([]);
  const [glossaries, setGlossaries] = useState<Glossary[]>([]);
  const [settings, setSettings] = useState<GraphSettings>(DEFAULT_SETTINGS);
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_FILTERS);
  const [isMinimapVisible, setIsMinimapVisible] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    node: OntologyNode;
    position: { x: number; y: number };
  } | null>(null);

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
        const glossariesResponse = await getGlossariesList({
          fields: 'owners,tags',
          limit: 100,
        });
        const fetchedGlossaries = glossariesResponse.data;
        setGlossaries(fetchedGlossaries);

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
    graphRef.current?.fitView();
  }, []);

  const handleZoomOut = useCallback(() => {
    graphRef.current?.fitView();
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
    graphRef.current?.fitView();
  }, []);

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

  const handleContextMenuOpenInNewTab = useCallback((node: OntologyNode) => {
    if (node.fullyQualifiedName) {
      const path = getGlossaryTermDetailsPath(node.fullyQualifiedName);
      window.open(path, '_blank');
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

  const handleGraphNodeClick = useCallback((node: OntologyNode) => {
    setContextMenu(null);
    setSelectedNode(node);
  }, []);

  const handleGraphNodeDoubleClick = useCallback((node: OntologyNode) => {
    if (node.fullyQualifiedName) {
      const path = getGlossaryTermDetailsPath(node.fullyQualifiedName);
      window.open(path, '_blank');
    }
  }, []);

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
      style={{ height }}
    >
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
            <GraphSettingsPanel
              settings={settings}
              onSettingsChange={setSettings}
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
                placement="bottomRight"
              >
                <Button
                  icon={<DownloadOutlined />}
                  loading={exporting}
                  size="small"
                >
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
                nodes={filteredGraphData.nodes}
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
              onClose={() => setSelectedNode(null)}
              onFocusNode={handleFocusSelected}
              onNavigate={(node) => {
                if (node.fullyQualifiedName) {
                  const path = getGlossaryTermDetailsPath(
                    node.fullyQualifiedName
                  );
                  navigate(path);
                }
              }}
              onNodeClick={handleDetailsPanelNodeClick}
            />
          )}

          {contextMenu && (
            <NodeContextMenu
              node={contextMenu.node}
              position={contextMenu.position}
              onClose={handleContextMenuClose}
              onFocus={handleContextMenuFocus}
              onOpenInNewTab={handleContextMenuOpenInNewTab}
              onViewDetails={handleContextMenuViewDetails}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default OntologyExplorer;
