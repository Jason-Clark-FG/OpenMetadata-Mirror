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

import { EntityReference } from '../../generated/entity/type';

export type OntologyScope = 'global' | 'glossary' | 'term';

export interface OntologyExplorerProps {
  scope: OntologyScope;
  entityId?: string;
  glossaryId?: string;
  className?: string;
  showHeader?: boolean;
  height?: string | number;
}

export interface OntologyNode {
  id: string;
  label: string;
  type: string;
  fullyQualifiedName?: string;
  description?: string;
  group?: string;
  glossaryId?: string;
  entityRef?: EntityReference;
}

export interface OntologyEdge {
  from: string;
  to: string;
  label: string;
  relationType: string;
}

export interface OntologyGraphData {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
}

export interface ConceptsTreeNode {
  key: string;
  title: string;
  type: 'glossary' | 'term' | 'tag' | 'domain';
  icon?: React.ReactNode;
  children?: ConceptsTreeNode[];
  isLeaf?: boolean;
  data?: {
    id: string;
    fullyQualifiedName: string;
    description?: string;
    relationsCount?: number;
  };
}

export interface ConceptsTreeProps {
  scope: OntologyScope;
  entityId?: string;
  glossaryId?: string;
  selectedNodeId?: string;
  onNodeSelect: (node: ConceptsTreeNode) => void;
  onNodeFocus: (nodeId: string) => void;
}

export interface GraphCanvasProps {
  data: OntologyGraphData | null;
  loading: boolean;
  selectedNodeId?: string;
  depth: number;
  layout: 'hierarchical' | 'force';
  colorBy: 'type' | 'relationType' | 'domain';
  relationTypes: string[];
  onNodeClick: (node: OntologyNode) => void;
  onNodeDoubleClick: (node: OntologyNode) => void;
  onDepthChange: (depth: number) => void;
  onLayoutChange: (layout: 'hierarchical' | 'force') => void;
  onColorByChange: (colorBy: 'type' | 'relationType' | 'domain') => void;
  onRelationTypesChange: (types: string[]) => void;
  onRefresh: () => void;
}

export interface DetailsPanelProps {
  node: OntologyNode | null;
  onClose: () => void;
  onNavigate?: (node: OntologyNode) => void;
  onAddRelation?: (fromNode: OntologyNode) => void;
}

export interface GraphControlsProps {
  depth: number;
  layout: 'hierarchical' | 'force';
  colorBy: 'type' | 'relationType' | 'domain';
  relationTypes: string[];
  availableRelationTypes: Array<{ name: string; displayName: string }>;
  loading: boolean;
  rdfEnabled: boolean;
  useRdfSource: boolean;
  onDepthChange: (depth: number) => void;
  onLayoutChange: (layout: 'hierarchical' | 'force') => void;
  onColorByChange: (colorBy: 'type' | 'relationType' | 'domain') => void;
  onRelationTypesChange: (types: string[]) => void;
  onRdfSourceChange: (useRdf: boolean) => void;
  onRefresh: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onFullscreen: () => void;
}

export type LayoutAlgorithm = 'force' | 'hierarchical' | 'radial' | 'circular';
export type NodeColorMode =
  | 'glossary'
  | 'relationType'
  | 'hierarchyLevel'
  | 'connectionCount';
export type NodeSizeMode = 'uniform' | 'connectionCount' | 'childCount';

export interface GraphSettings {
  layout: LayoutAlgorithm;
  nodeColorMode: NodeColorMode;
  nodeSizeMode: NodeSizeMode;
  showEdgeLabels: boolean;
  showNodeDescriptions: boolean;
  highlightOnHover: boolean;
  animateTransitions: boolean;
  physicsEnabled: boolean;
}

export interface GraphFilters {
  glossaryIds: string[];
  relationTypes: string[];
  hierarchyLevels: number[];
  showIsolatedNodes: boolean;
  searchQuery: string;
}

export interface NodeContextMenuAction {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: (node: OntologyNode) => void;
  disabled?: boolean;
}

export interface EnhancedOntologyNode extends OntologyNode {
  depth?: number;
  connectionCount?: number;
  childCount?: number;
  glossaryName?: string;
  glossaryColor?: string;
  isHighlighted?: boolean;
  isFaded?: boolean;
}

export interface GraphStatistics {
  totalNodes: number;
  totalEdges: number;
  isolatedNodes: number;
  glossaryCount: number;
  relationTypeCount: number;
  maxDepth: number;
}
