import { fireEvent, render, screen } from '@testing-library/react';
import { useWorkflowStore } from '../../useWorkflowStore';
import { ReactFlowProvider } from 'reactflow';
import GatewayNode from './GatewayNode';

jest.mock('../../useWorkflowStore');
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockData = {
  id: '1',
  position: { x: 0, y: 0 },
  data: { name: 'Test Gateway' },
};

jest.mock('../../../../../utils/EntityUtils', () => ({
  getEntityName: jest.fn().mockImplementation((entity) => entity.name),
}));

describe('GatewayNode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useWorkflowStore as unknown as jest.Mock).mockReturnValue({
      setDrawerVisible: jest.fn(),
      setSelectedNode: jest.fn(),
      selectedNode: null,
    });
  });

  it('renders gateway node with correct content', () => {
    render(
      <ReactFlowProvider>
        <GatewayNode {...mockData} />
      </ReactFlowProvider>
    );

    expect(screen.getByText('label.gateway')).toBeInTheDocument();
    expect(screen.getByText('Test Gateway')).toBeInTheDocument();
  });

  it('handles node click correctly', () => {
    const mockSetDrawerVisible = jest.fn();
    const mockSetSelectedNode = jest.fn();

    (useWorkflowStore as unknown as jest.Mock).mockReturnValue({
      setDrawerVisible: mockSetDrawerVisible,
      setSelectedNode: mockSetSelectedNode,
      selectedNode: null,
    });

    render(
      <ReactFlowProvider>
        <GatewayNode {...mockData} />
      </ReactFlowProvider>
    );

    fireEvent.click(
      screen.getByText('Test Gateway').parentElement!.parentElement!
    );

    expect(mockSetSelectedNode).toHaveBeenCalled();
    expect(mockSetDrawerVisible).toHaveBeenCalled();
  });
});
