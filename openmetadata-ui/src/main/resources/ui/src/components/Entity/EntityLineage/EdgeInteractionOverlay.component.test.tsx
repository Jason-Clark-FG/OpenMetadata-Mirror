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
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { Edge } from 'reactflow';
import { StatusType } from '../../../generated/entity/data/pipeline';
import { EdgeInteractionOverlay } from './EdgeInteractionOverlay.component';

const mockUseViewport = jest.fn().mockReturnValue({ x: 0, y: 0, zoom: 1 });
const mockUseLineageStore = {
  isEditMode: false,
  selectedEdge: undefined,
};

jest.mock('reactflow', () => ({
  ...jest.requireActual('reactflow'),
  useViewport: () => mockUseViewport(),
}));

jest.mock('../../../hooks/useLineageStore', () => ({
  useLineageStore: () => mockUseLineageStore,
}));

jest.mock('../../common/PopOverCard/EntityPopOverCard', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const createEdge = (overrides: Partial<Edge> = {}): Edge => ({
  id: 'edge-1',
  source: 'node-1',
  target: 'node-2',
  data: {
    edge: {
      fromEntity: { fullyQualifiedName: 'table1', id: 'id1' },
      toEntity: { fullyQualifiedName: 'table2', id: 'id2' },
    },
    computedPath: {
      edgePath: 'M 0,0 C 100,0 100,100 200,100',
      edgeCenterX: 100,
      edgeCenterY: 50,
    },
    isColumnLineage: false,
  },
  ...overrides,
});

describe('EdgeInteractionOverlay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLineageStore.isEditMode = false;
    mockUseLineageStore.selectedEdge = undefined;
  });

  it('renders nothing when no hovered or selected edge', () => {
    const { container } = render(<EdgeInteractionOverlay />);

    expect(
      container.querySelector('.edge-interaction-overlay')
    ).toBeEmptyDOMElement();
  });

  it('renders pipeline button when edge has pipeline data', () => {
    const edge = createEdge({
      data: {
        edge: {
          fromEntity: { fullyQualifiedName: 'table1', id: 'id1' },
          toEntity: { fullyQualifiedName: 'table2', id: 'id2' },
          pipeline: {
            fullyQualifiedName: 'pipeline1',
            name: 'Pipeline 1',
          },
        },
        computedPath: {
          edgePath: 'M 0,0 C 100,0 100,100 200,100',
          edgeCenterX: 100,
          edgeCenterY: 50,
        },
        isColumnLineage: false,
      },
    });

    render(<EdgeInteractionOverlay hoveredEdge={edge} />);

    const pipelineButton = screen.getByTestId('pipeline-label-table1-table2');

    expect(pipelineButton).toBeInTheDocument();
  });

  it('does not render pipeline button for column lineage', () => {
    const edge = createEdge({
      data: {
        edge: {
          fromEntity: { fullyQualifiedName: 'table1', id: 'id1' },
          toEntity: { fullyQualifiedName: 'table2', id: 'id2' },
          pipeline: {
            fullyQualifiedName: 'pipeline1',
            name: 'Pipeline 1',
          },
        },
        computedPath: {
          edgePath: 'M 0,0 C 100,0 100,100 200,100',
          edgeCenterX: 100,
          edgeCenterY: 50,
        },
        isColumnLineage: true,
      },
    });

    render(<EdgeInteractionOverlay hoveredEdge={edge} />);

    expect(
      screen.queryByTestId('pipeline-label-table1-table2')
    ).not.toBeInTheDocument();
  });

  it('renders function icon when edge has column function', () => {
    const edge = createEdge({
      data: {
        edge: {
          fromEntity: { fullyQualifiedName: 'table1', id: 'id1' },
          toEntity: { fullyQualifiedName: 'table2', id: 'id2' },
        },
        computedPath: {
          edgePath: 'M 0,0 C 100,0 100,100 200,100',
          edgeCenterX: 100,
          edgeCenterY: 50,
        },
        isColumnLineage: false,
        columnFunctionValue: 'CONCAT(col1, col2)',
        isExpanded: true,
      },
    });

    render(<EdgeInteractionOverlay hoveredEdge={edge} />);

    const functionButton = screen.getByTestId('function-icon-table1-table2');

    expect(functionButton).toBeInTheDocument();
  });

  it('does not render function icon when not expanded', () => {
    const edge = createEdge({
      data: {
        edge: {
          fromEntity: { fullyQualifiedName: 'table1', id: 'id1' },
          toEntity: { fullyQualifiedName: 'table2', id: 'id2' },
        },
        computedPath: {
          edgePath: 'M 0,0 C 100,0 100,100 200,100',
          edgeCenterX: 100,
          edgeCenterY: 50,
        },
        isColumnLineage: false,
        columnFunctionValue: 'CONCAT(col1, col2)',
        isExpanded: false,
      },
    });

    render(<EdgeInteractionOverlay hoveredEdge={edge} />);

    expect(
      screen.queryByTestId('function-icon-table1-table2')
    ).not.toBeInTheDocument();
  });

  it('applies correct status class to pipeline button', () => {
    const edge = createEdge({
      data: {
        edge: {
          fromEntity: { fullyQualifiedName: 'table1', id: 'id1' },
          toEntity: { fullyQualifiedName: 'table2', id: 'id2' },
          pipeline: {
            fullyQualifiedName: 'pipeline1',
            name: 'Pipeline 1',
            pipelineStatus: {
              executionStatus: StatusType.Successful,
            },
          },
        },
        computedPath: {
          edgePath: 'M 0,0 C 100,0 100,100 200,100',
          edgeCenterX: 100,
          edgeCenterY: 50,
        },
        isColumnLineage: false,
      },
    });

    render(<EdgeInteractionOverlay hoveredEdge={edge} />);

    const pipelineButton = screen.getByTestId('pipeline-label-table1-table2');

    expect(pipelineButton).toHaveClass('green');
  });

  it('applies blinking class for pipeline root node', () => {
    const edge = createEdge({
      data: {
        edge: {
          fromEntity: { fullyQualifiedName: 'table1', id: 'id1' },
          toEntity: { fullyQualifiedName: 'table2', id: 'id2' },
          pipeline: {
            fullyQualifiedName: 'pipeline1',
            name: 'Pipeline 1',
            pipelineStatus: {
              executionStatus: StatusType.Failed,
            },
          },
        },
        computedPath: {
          edgePath: 'M 0,0 C 100,0 100,100 200,100',
          edgeCenterX: 100,
          edgeCenterY: 50,
        },
        isColumnLineage: false,
        isPipelineRootNode: true,
      },
    });

    render(<EdgeInteractionOverlay hoveredEdge={edge} />);

    const pipelineButton = screen.getByTestId('pipeline-label-table1-table2');

    expect(pipelineButton).toHaveClass('blinking-red-border');
  });

  it('renders edit button when edge is selected in edit mode', () => {
    const edge = createEdge();
    mockUseLineageStore.isEditMode = true;
    mockUseLineageStore.selectedEdge = edge;

    render(<EdgeInteractionOverlay />);

    const editButton = screen.getByTestId('add-pipeline');

    expect(editButton).toBeInTheDocument();
  });

  it('does not render edit button for column lineage', () => {
    const edge = createEdge({
      data: {
        ...createEdge().data,
        isColumnLineage: true,
      },
    });
    mockUseLineageStore.isEditMode = true;
    mockUseLineageStore.selectedEdge = edge;

    render(<EdgeInteractionOverlay />);

    expect(screen.queryByTestId('add-pipeline')).not.toBeInTheDocument();
  });

  it('renders delete button for column lineage in edit mode', () => {
    const edge = createEdge({
      data: {
        ...createEdge().data,
        isColumnLineage: true,
      },
    });
    mockUseLineageStore.isEditMode = true;
    mockUseLineageStore.selectedEdge = edge;

    render(<EdgeInteractionOverlay />);

    const deleteButton = screen.getByTestId('delete-button');

    expect(deleteButton).toBeInTheDocument();
  });

  it('does not render delete button for non-column lineage', () => {
    const edge = createEdge();
    mockUseLineageStore.isEditMode = true;
    mockUseLineageStore.selectedEdge = edge;

    render(<EdgeInteractionOverlay />);

    expect(screen.queryByTestId('delete-button')).not.toBeInTheDocument();
  });

  it('calls onPipelineClick when pipeline button is clicked in edit mode', () => {
    const onPipelineClick = jest.fn();
    const edge = createEdge({
      data: {
        edge: {
          fromEntity: { fullyQualifiedName: 'table1', id: 'id1' },
          toEntity: { fullyQualifiedName: 'table2', id: 'id2' },
          pipeline: {
            fullyQualifiedName: 'pipeline1',
            name: 'Pipeline 1',
          },
        },
        computedPath: {
          edgePath: 'M 0,0 C 100,0 100,100 200,100',
          edgeCenterX: 100,
          edgeCenterY: 50,
        },
        isColumnLineage: false,
      },
    });

    mockUseLineageStore.isEditMode = true;

    render(
      <EdgeInteractionOverlay
        hoveredEdge={edge}
        onPipelineClick={onPipelineClick}
      />
    );

    const pipelineButton = screen.getByTestId('pipeline-label-table1-table2');
    fireEvent.click(pipelineButton);

    expect(onPipelineClick).toHaveBeenCalled();
  });

  it('does not call onPipelineClick when not in edit mode', () => {
    const onPipelineClick = jest.fn();
    const edge = createEdge({
      data: {
        edge: {
          fromEntity: { fullyQualifiedName: 'table1', id: 'id1' },
          toEntity: { fullyQualifiedName: 'table2', id: 'id2' },
          pipeline: {
            fullyQualifiedName: 'pipeline1',
            name: 'Pipeline 1',
          },
        },
        computedPath: {
          edgePath: 'M 0,0 C 100,0 100,100 200,100',
          edgeCenterX: 100,
          edgeCenterY: 50,
        },
        isColumnLineage: false,
      },
    });

    render(
      <EdgeInteractionOverlay
        hoveredEdge={edge}
        onPipelineClick={onPipelineClick}
      />
    );

    const pipelineButton = screen.getByTestId('pipeline-label-table1-table2');
    fireEvent.click(pipelineButton);

    expect(onPipelineClick).not.toHaveBeenCalled();
  });

  it('calls onEdgeRemove when delete button is clicked', () => {
    const onEdgeRemove = jest.fn();
    const edge = createEdge({
      data: {
        ...createEdge().data,
        isColumnLineage: true,
      },
    });
    mockUseLineageStore.isEditMode = true;
    mockUseLineageStore.selectedEdge = edge;

    render(<EdgeInteractionOverlay onEdgeRemove={onEdgeRemove} />);

    const deleteButton = screen.getByTestId('delete-button');
    fireEvent.click(deleteButton);

    expect(onEdgeRemove).toHaveBeenCalled();
  });

  it('does not render when computedPath is missing', () => {
    const edge = createEdge({
      data: {
        edge: {
          fromEntity: { fullyQualifiedName: 'table1', id: 'id1' },
          toEntity: { fullyQualifiedName: 'table2', id: 'id2' },
          pipeline: {
            fullyQualifiedName: 'pipeline1',
            name: 'Pipeline 1',
          },
        },
        isColumnLineage: false,
      },
    });

    render(<EdgeInteractionOverlay hoveredEdge={edge} />);

    expect(
      screen.queryByTestId('pipeline-label-table1-table2')
    ).not.toBeInTheDocument();
  });

  it('positions elements using viewport transformation', () => {
    mockUseViewport.mockReturnValue({ x: 50, y: 50, zoom: 2 });

    const edge = createEdge({
      data: {
        edge: {
          fromEntity: { fullyQualifiedName: 'table1', id: 'id1' },
          toEntity: { fullyQualifiedName: 'table2', id: 'id2' },
          pipeline: {
            fullyQualifiedName: 'pipeline1',
            name: 'Pipeline 1',
          },
        },
        computedPath: {
          edgePath: 'M 0,0 C 100,0 100,100 200,100',
          edgeCenterX: 100,
          edgeCenterY: 50,
        },
        isColumnLineage: false,
      },
    });

    render(<EdgeInteractionOverlay hoveredEdge={edge} />);

    const pipelineButton = screen.getByTestId('pipeline-label-table1-table2');
    const parent = pipelineButton.parentElement;

    expect(parent).toHaveStyle({
      position: 'absolute',
      left: '250px',
      top: '150px',
    });
  });

  it('handles all pipeline status types', () => {
    const statusTypes = [
      { status: StatusType.Successful, class: 'green' },
      { status: StatusType.Failed, class: 'red' },
      { status: StatusType.Pending, class: 'amber' },
      { status: StatusType.Skipped, class: 'amber' },
    ];

    statusTypes.forEach(({ status, class: expectedClass }) => {
      const edge = createEdge({
        data: {
          edge: {
            fromEntity: { fullyQualifiedName: 'table1', id: 'id1' },
            toEntity: { fullyQualifiedName: 'table2', id: 'id2' },
            pipeline: {
              fullyQualifiedName: 'pipeline1',
              name: 'Pipeline 1',
              pipelineStatus: { executionStatus: status },
            },
          },
          computedPath: {
            edgePath: 'M 0,0 C 100,0 100,100 200,100',
            edgeCenterX: 100,
            edgeCenterY: 50,
          },
          isColumnLineage: false,
        },
      });

      const { unmount } = render(<EdgeInteractionOverlay hoveredEdge={edge} />);

      const pipelineButton = screen.getByTestId('pipeline-label-table1-table2');

      expect(pipelineButton).toHaveClass(expectedClass);

      unmount();
    });
  });
});
