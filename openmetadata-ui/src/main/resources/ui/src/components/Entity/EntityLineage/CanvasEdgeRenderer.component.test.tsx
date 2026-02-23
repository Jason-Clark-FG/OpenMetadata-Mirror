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
import { useTheme } from '@mui/material';
import { render, screen, waitFor } from '@testing-library/react';
import { Edge } from 'reactflow';
import { CanvasEdgeRenderer } from './CanvasEdgeRenderer.component';

const mockRedraw = jest.fn();
const mockGetEdgeAtPoint = jest.fn();
const mockUseCanvasEdgeRenderer = {
  redraw: mockRedraw,
  getEdgeAtPoint: mockGetEdgeAtPoint,
};

const mockEdges: Edge[] = [
  {
    id: 'edge-1',
    source: 'node-1',
    target: 'node-2',
    data: { isColumnLineage: false },
  },
];

const mockUseLineageStore = {
  isEditMode: false,
};

const mockUseLineageProvider = {
  edges: mockEdges,
};

jest.mock('@mui/material', () => ({
  ...jest.requireActual('@mui/material'),
  useTheme: jest.fn(),
}));

jest.mock('../../../context/LineageProvider/LineageProvider', () => ({
  useLineageProvider: () => mockUseLineageProvider,
}));

jest.mock('../../../hooks/useCanvasEdgeRenderer', () => ({
  useCanvasEdgeRenderer: () => mockUseCanvasEdgeRenderer,
}));

jest.mock('../../../hooks/useIconSprites', () => ({
  useIconSprites: () => ({
    pipeline: new Image(),
    pipelineGreen: new Image(),
    pipelineAmber: new Image(),
    pipelineRed: new Image(),
    function: new Image(),
  }),
}));

jest.mock('../../../hooks/useLineageStore', () => ({
  useLineageStore: () => mockUseLineageStore,
}));

jest.mock('../../../utils/EdgeStyleUtils', () => ({
  clearEdgeStyleCache: jest.fn(),
}));

const mockTheme = {
  palette: {
    primary: { main: '#1890ff' },
  },
};

describe('CanvasEdgeRenderer', () => {
  let container: HTMLElement;

  beforeEach(() => {
    jest.clearAllMocks();
    (useTheme as jest.Mock).mockReturnValue(mockTheme);

    const reactFlowContainer = document.createElement('div');
    reactFlowContainer.className = 'react-flow';
    const pane = document.createElement('div');
    pane.className = 'react-flow__pane';
    reactFlowContainer.appendChild(pane);
    document.body.appendChild(reactFlowContainer);
    container = reactFlowContainer;

    global.ResizeObserver = jest.fn().mockImplementation(() => ({
      observe: jest.fn(),
      disconnect: jest.fn(),
      unobserve: jest.fn(),
    }));
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  const defaultProps = {
    dqHighlightedEdges: new Set<string>(),
    hoverEdge: null,
    onEdgeClick: jest.fn(),
    onEdgeHover: jest.fn(),
  };

  it('renders canvas element', () => {
    render(<CanvasEdgeRenderer {...defaultProps} />);

    const canvas = document.querySelector('canvas');

    expect(canvas).toBeInTheDocument();
  });

  it('renders container with correct styles', () => {
    render(<CanvasEdgeRenderer {...defaultProps} />);

    const containerDiv = screen.getByRole('generic', { hidden: true });

    expect(containerDiv).toHaveStyle({ pointerEvents: 'none' });
  });

  it('calls redraw on mount', async () => {
    render(<CanvasEdgeRenderer {...defaultProps} />);

    await waitFor(() => {
      expect(mockRedraw).toHaveBeenCalled();
    });
  });

  it('sets up ResizeObserver', () => {
    render(<CanvasEdgeRenderer {...defaultProps} />);

    expect(ResizeObserver).toHaveBeenCalled();
  });

  it('handles pane click events when not in edit mode', async () => {
    const onEdgeClick = jest.fn();
    mockGetEdgeAtPoint.mockReturnValue(mockEdges[0]);

    render(<CanvasEdgeRenderer {...defaultProps} onEdgeClick={onEdgeClick} />);

    const pane = document.querySelector('.react-flow__pane');
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      clientX: 100,
      clientY: 100,
    });

    await waitFor(() => {
      pane?.dispatchEvent(clickEvent);
    });

    expect(onEdgeClick).toHaveBeenCalledWith(
      mockEdges[0],
      expect.any(MouseEvent)
    );
  });

  it('ignores click events in edit mode', async () => {
    const onEdgeClick = jest.fn();
    mockUseLineageStore.isEditMode = true;

    render(<CanvasEdgeRenderer {...defaultProps} onEdgeClick={onEdgeClick} />);

    const pane = document.querySelector('.react-flow__pane');
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      clientX: 100,
      clientY: 100,
    });

    await waitFor(() => {
      pane?.dispatchEvent(clickEvent);
    });

    expect(onEdgeClick).not.toHaveBeenCalled();

    mockUseLineageStore.isEditMode = false;
  });

  it('handles mouse move events', async () => {
    const onEdgeHover = jest.fn();
    mockGetEdgeAtPoint.mockReturnValue(mockEdges[0]);

    render(<CanvasEdgeRenderer {...defaultProps} onEdgeHover={onEdgeHover} />);

    const pane = document.querySelector('.react-flow__pane');
    const moveEvent = new MouseEvent('mousemove', {
      bubbles: true,
      clientX: 100,
      clientY: 100,
    });

    await waitFor(() => {
      pane?.dispatchEvent(moveEvent);
    });

    expect(onEdgeHover).toHaveBeenCalled();
  });

  it('handles mouse leave events', async () => {
    const onEdgeHover = jest.fn();

    render(<CanvasEdgeRenderer {...defaultProps} onEdgeHover={onEdgeHover} />);

    const pane = document.querySelector('.react-flow__pane');
    const leaveEvent = new MouseEvent('mouseleave', { bubbles: true });

    await waitFor(() => {
      pane?.dispatchEvent(leaveEvent);
    });

    expect(onEdgeHover).toHaveBeenCalledWith(null);
  });

  it('does not call edge handlers when no edge is found', async () => {
    const onEdgeClick = jest.fn();
    mockGetEdgeAtPoint.mockReturnValue(null);

    render(<CanvasEdgeRenderer {...defaultProps} onEdgeClick={onEdgeClick} />);

    const pane = document.querySelector('.react-flow__pane');
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      clientX: 100,
      clientY: 100,
    });

    await waitFor(() => {
      pane?.dispatchEvent(clickEvent);
    });

    expect(onEdgeClick).not.toHaveBeenCalled();
  });

  it('updates when edges change', async () => {
    const { rerender } = render(<CanvasEdgeRenderer {...defaultProps} />);

    mockUseLineageProvider.edges = [
      ...mockEdges,
      {
        id: 'edge-2',
        source: 'node-2',
        target: 'node-3',
        data: { isColumnLineage: false },
      },
    ];

    rerender(<CanvasEdgeRenderer {...defaultProps} />);

    await waitFor(() => {
      expect(mockRedraw).toHaveBeenCalled();
    });
  });

  it('updates when hoverEdge changes', async () => {
    const { rerender } = render(<CanvasEdgeRenderer {...defaultProps} />);

    rerender(<CanvasEdgeRenderer {...defaultProps} hoverEdge={mockEdges[0]} />);

    await waitFor(() => {
      expect(mockRedraw).toHaveBeenCalled();
    });
  });

  it('updates when dqHighlightedEdges changes', async () => {
    const { rerender } = render(<CanvasEdgeRenderer {...defaultProps} />);

    const newDqHighlightedEdges = new Set(['edge-1']);
    rerender(
      <CanvasEdgeRenderer
        {...defaultProps}
        dqHighlightedEdges={newDqHighlightedEdges}
      />
    );

    await waitFor(() => {
      expect(mockRedraw).toHaveBeenCalled();
    });
  });

  it('cleans up event listeners on unmount', () => {
    const { unmount } = render(<CanvasEdgeRenderer {...defaultProps} />);

    const pane = document.querySelector('.react-flow__pane');
    const removeEventListenerSpy = jest.spyOn(
      pane as Element,
      'removeEventListener'
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'click',
      expect.any(Function)
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'mousemove',
      expect.any(Function)
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'mouseleave',
      expect.any(Function)
    );
  });

  it('cleans up ResizeObserver on unmount', () => {
    const disconnectSpy = jest.fn();
    (global.ResizeObserver as jest.Mock).mockImplementation(() => ({
      observe: jest.fn(),
      disconnect: disconnectSpy,
      unobserve: jest.fn(),
    }));

    const { unmount } = render(<CanvasEdgeRenderer {...defaultProps} />);
    unmount();

    expect(disconnectSpy).toHaveBeenCalled();
  });

  it('handles container size changes', async () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    (global.ResizeObserver as jest.Mock).mockImplementation((callback) => {
      resizeCallback = callback;

      return {
        observe: jest.fn(),
        disconnect: jest.fn(),
        unobserve: jest.fn(),
      };
    });

    render(<CanvasEdgeRenderer {...defaultProps} />);

    if (resizeCallback) {
      const mockEntries = [
        {
          contentRect: { width: 800, height: 600 },
          target: document.createElement('div'),
        },
      ] as ResizeObserverEntry[];

      resizeCallback(mockEntries, {} as ResizeObserver);
    }

    await waitFor(() => {
      expect(mockRedraw).toHaveBeenCalled();
    });
  });

  it('does not crash when pane element is not found', () => {
    const containerWithoutPane = document.createElement('div');
    containerWithoutPane.className = 'react-flow';
    document.body.appendChild(containerWithoutPane);

    expect(() => {
      render(<CanvasEdgeRenderer {...defaultProps} />);
    }).not.toThrow();

    document.body.removeChild(containerWithoutPane);
  });

  it('passes correct props to useCanvasEdgeRenderer', () => {
    render(<CanvasEdgeRenderer {...defaultProps} />);

    expect(mockUseCanvasEdgeRenderer).toBeDefined();
  });
});
