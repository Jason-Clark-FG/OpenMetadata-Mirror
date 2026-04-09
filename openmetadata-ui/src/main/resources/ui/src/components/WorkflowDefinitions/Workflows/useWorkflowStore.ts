import { create } from 'zustand';
import { WorkflowState } from './workflows.interface';

export const useWorkflowStore = create<WorkflowState>((set) => ({
  workflowDefinition: undefined,
  initialised: false,
  defaultNodes: [],
  defaultEdges: [],
  drawerVisible: false,
  selectedNode: undefined,
  isEditMode: false,
  setWorkflowDefinition: (workflowDefinition) => {
    set({ workflowDefinition });
  },
  setInitialised: (initialised) => set({ initialised }),
  setDefaultNodes: (nodes) => set({ defaultNodes: nodes }),
  setDefaultEdges: (edges) => set({ defaultEdges: edges }),
  setDrawerVisible: (visible) => set({ drawerVisible: visible }),
  setSelectedNode: (node) => set({ selectedNode: node }),
  setNodesEdgesData: ({ nodes, edges, init }) =>
    set({ defaultNodes: nodes, defaultEdges: edges, initialised: init }),
}));
