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
import { Edge, Node } from 'reactflow'; // We will eventually replace these with G6 types or generic types
import { create } from 'zustand';
import {
  EntityLineageResponse,
  LineageData,
} from './Lineage.interface';
import { EntityReference } from '../../generated/type/entityLineage';
import { LineageLayer } from '../../generated/settings/settings';
import { SourceType } from '../SearchedData/SearchedData.interface';
import { EntityType } from '../../enums/entity.enum';

interface LineageState {
  // Graph Data
  nodes: Node[];
  edges: Edge[];
  entityLineage: EntityLineageResponse;
  lineageData?: LineageData;
  
  // Selection & Interaction
  selectedNode?: SourceType;
  selectedEdge?: Edge;
  selectedColumn?: string;
  activeLayer: LineageLayer[];
  tracedNodes: string[];
  tracedColumns: string[];
  
  // Configuration & Status
  zoomValue: number;
  isLoading: boolean;
  isEditMode: boolean;
  isDrawerOpen: boolean;
  
  // Entity Context
  entity?: SourceType;
  entityType?: EntityType;
  entityFqn?: string;
}

interface LineageActions {
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  setEntityLineage: (lineage: EntityLineageResponse) => void;
  setLineageData: (data: LineageData) => void;
  
  setSelectedNode: (node: SourceType | undefined) => void;
  setSelectedEdge: (edge: Edge | undefined) => void;
  setSelectedColumn: (column: string | undefined) => void;
  setActiveLayer: (layers: LineageLayer[]) => void;
  setTracedNodes: (nodes: string[]) => void;
  setTracedColumns: (columns: string[]) => void;
  
  setZoomValue: (value: number) => void;
  setIsLoading: (loading: boolean) => void;
  setIsEditMode: (editMode: boolean) => void;
  setIsDrawerOpen: (isOpen: boolean) => void;
  
  setEntity: (entity: SourceType | undefined) => void;
  setEntityType: (type: EntityType | undefined) => void;
  setEntityFqn: (fqn: string | undefined) => void;
  
  // Computed/Complex Actions
  resetState: () => void;
}

export const useLineageStore = create<LineageState & LineageActions>((set) => ({
  // Initial State
  nodes: [],
  edges: [],
  entityLineage: { nodes: [], edges: [], entity: {} as EntityReference },
  activeLayer: [],
  tracedNodes: [],
  tracedColumns: [],
  zoomValue: 1,
  isLoading: false,
  isEditMode: false,
  isDrawerOpen: false,

  // Actions
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setEntityLineage: (entityLineage) => set({ entityLineage }),
  setLineageData: (lineageData) => set({ lineageData }),
  
  setSelectedNode: (selectedNode) => set({ selectedNode }),
  setSelectedEdge: (selectedEdge) => set({ selectedEdge }),
  setSelectedColumn: (selectedColumn) => set({ selectedColumn }),
  setActiveLayer: (activeLayer) => set({ activeLayer }),
  setTracedNodes: (tracedNodes) => set({ tracedNodes }),
  setTracedColumns: (tracedColumns) => set({ tracedColumns }),
  
  setZoomValue: (zoomValue) => set({ zoomValue }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsEditMode: (isEditMode) => set({ isEditMode }),
  setIsDrawerOpen: (isDrawerOpen) => set({ isDrawerOpen }),
  
  setEntity: (entity) => set({ entity }),
  setEntityType: (entityType) => set({ entityType }),
  setEntityFqn: (entityFqn) => set({ entityFqn }),
  
  resetState: () => set({
    nodes: [],
    edges: [],
    entityLineage: { nodes: [], edges: [], entity: {} as EntityReference },
    lineageData: undefined,
    selectedNode: undefined,
    selectedEdge: undefined,
    selectedColumn: undefined,
    activeLayer: [],
    tracedNodes: [],
    tracedColumns: [],
    zoomValue: 1,
    isLoading: false,
    isEditMode: false,
    isDrawerOpen: false,
  }),
}));
