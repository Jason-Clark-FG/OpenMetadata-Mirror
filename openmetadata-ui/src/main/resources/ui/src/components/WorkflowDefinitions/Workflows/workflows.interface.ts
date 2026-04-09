import { StartEvent } from '../../../generated/governance/workflows/elements/nodes/startEvent/startEvent';
import { WorkflowDefinition } from '../../../generated/governance/workflows/workflowDefinition';
import { Edge, Node } from 'reactflow';

export interface WorkflowState {
  workflowDefinition: WorkflowDefinition | undefined;
  initialised: boolean;
  defaultNodes: Node[];
  defaultEdges: Edge[];
  drawerVisible: boolean;
  isEditMode: boolean;
  selectedNode: StartEvent | undefined;
  setWorkflowDefinition: (
    workflowDefinition: WorkflowDefinition | undefined
  ) => void;
  setInitialised: (initialised: boolean) => void;
  setDefaultNodes: (nodes: Node[]) => void;
  setDefaultEdges: (edges: Edge[]) => void;
  setDrawerVisible: (visible: boolean) => void;
  setSelectedNode: (node: StartEvent | undefined) => void;
  setNodesEdgesData: (data: {
    nodes: Node[];
    edges: Edge[];
    init: boolean;
  }) => void;
}

export interface WorkflowNodeData {
  /**
   * Description of the Node.
   */
  description?: string;
  /**
   * Display Name that identifies this Node.
   */
  displayName?: string;
  /**
   * Name that identifies this Node.
   */
  name?: string;
  subType?: string;
  type?: string;
}
