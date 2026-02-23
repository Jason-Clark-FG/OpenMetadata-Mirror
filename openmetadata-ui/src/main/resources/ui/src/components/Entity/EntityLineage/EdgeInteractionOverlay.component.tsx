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
import Icon from '@ant-design/icons/lib/components/Icon';
import { Button, Tag } from 'antd';
import classNames from 'classnames';
import React from 'react';
import { Edge, Position, useReactFlow, useViewport, Viewport } from 'reactflow';
import { ReactComponent as IconEditCircle } from '../../../assets/svg/ic-edit-circle.svg';
import { ReactComponent as FunctionIcon } from '../../../assets/svg/ic-function.svg';
import { ReactComponent as IconTimesCircle } from '../../../assets/svg/ic-times-circle.svg';
import { ReactComponent as PipelineIcon } from '../../../assets/svg/pipeline-grey.svg';
import { StatusType } from '../../../generated/entity/data/pipeline';
import { useLineageStore } from '../../../hooks/useLineageStore';
import { getEdgeCoordinates, transformPoint } from '../../../utils/CanvasUtils';
import { getEdgePathData } from '../../../utils/EntityLineageUtils';
import { getEntityName } from '../../../utils/EntityUtils';
import EntityPopOverCard from '../../common/PopOverCard/EntityPopOverCard';

export interface EdgeInteractionOverlayProps {
  hoveredEdge?: Edge | null;
  onPipelineClick?: () => void;
  onEdgeRemove?: () => void;
}

function getAbsolutePosition(
  canvasX: number,
  canvasY: number,
  viewport: Viewport
): React.CSSProperties {
  const transformed = transformPoint(canvasX, canvasY, viewport);

  return {
    position: 'absolute',
    left: `${transformed.x}px`,
    top: `${transformed.y}px`,
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'all',
  };
}

function getPipelineStatusClass(executionStatus?: StatusType): string {
  if (!executionStatus) {
    return '';
  }

  switch (executionStatus) {
    case StatusType.Successful:
      return 'green';
    case StatusType.Failed:
      return 'red';
    case StatusType.Pending:
    case StatusType.Skipped:
      return 'amber';
    default:
      return '';
  }
}

function getBlinkingClass(
  isPipelineRootNode: boolean,
  executionStatus?: StatusType
): string {
  if (!isPipelineRootNode) {
    return '';
  }

  const statusClass = getPipelineStatusClass(executionStatus);

  return statusClass ? `blinking-${statusClass}-border` : 'blinking-border';
}

export const EdgeInteractionOverlay: React.FC<EdgeInteractionOverlayProps> = ({
  hoveredEdge,
  onPipelineClick,
  onEdgeRemove,
}) => {
  const { isEditMode, selectedEdge, columnsInCurrentPages } = useLineageStore();
  const { getNode } = useReactFlow();
  const viewport = useViewport();

  const computePathData = (edge: Edge) => {
    if (edge.data?.computedPath) {
      return edge.data.computedPath;
    }

    const coords = getEdgeCoordinates(
      edge,
      getNode(edge.source),
      getNode(edge.target),
      columnsInCurrentPages
    );

    if (!coords) {
      return null;
    }

    return getEdgePathData(edge.source, edge.target, {
      sourceX: coords.sourceX,
      sourceY: coords.sourceY,
      targetX: coords.targetX,
      targetY: coords.targetY,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
  };
  const renderPipelinePopover = (edge: Edge) => {
    const {
      edge: edgeDetails,
      isColumnLineage,
      isPipelineRootNode,
    } = edge.data || {};

    if (isColumnLineage || !edgeDetails?.pipeline) {
      return null;
    }

    const hasLabel = getEntityName(edgeDetails.pipeline);
    if (!hasLabel) {
      return null;
    }

    const pathData = computePathData(edge);
    if (!pathData) {
      return null;
    }

    const pipelineData = edgeDetails.pipeline.pipelineStatus;
    const currentPipelineStatus = getPipelineStatusClass(
      pipelineData?.executionStatus
    );
    const blinkingClass = getBlinkingClass(
      isPipelineRootNode,
      pipelineData?.executionStatus
    );

    const dataTestId = `pipeline-label-${edgeDetails.fromEntity.fullyQualifiedName}-${edgeDetails.toEntity.fullyQualifiedName}`;

    const buttonElement = (
      <Button
        className={classNames(
          'flex-center custom-edge-pipeline-button',
          currentPipelineStatus,
          blinkingClass
        )}
        data-testid={dataTestId}
        icon={<PipelineIcon />}
        onClick={() => isEditMode && onPipelineClick?.()}
      />
    );

    if (isEditMode) {
      return (
        <div
          key={`pipeline-${edge.id}`}
          style={getAbsolutePosition(
            pathData.edgeCenterX,
            pathData.edgeCenterY,
            viewport
          )}>
          {buttonElement}
        </div>
      );
    }

    return (
      <div
        key={`pipeline-${edge.id}`}
        style={getAbsolutePosition(
          pathData.edgeCenterX,
          pathData.edgeCenterY,
          viewport
        )}>
        <EntityPopOverCard
          entityFQN={edgeDetails.pipeline.fullyQualifiedName}
          entityType={edge.data.pipelineEntityType}
          extraInfo={
            pipelineData && (
              <Tag className={currentPipelineStatus}>
                {pipelineData.executionStatus}
              </Tag>
            )
          }>
          {buttonElement}
        </EntityPopOverCard>
      </div>
    );
  };

  const renderFunctionPopover = (edge: Edge) => {
    const {
      edge: edgeDetails,
      isColumnLineage,
      columnFunctionValue,
      isExpanded,
      isPipelineRootNode,
    } = edge.data || {};

    if (isColumnLineage || !columnFunctionValue || !isExpanded) {
      return null;
    }

    const pathData = computePathData(edge);
    if (!pathData) {
      return null;
    }

    const pipelineStatus = edgeDetails?.pipeline?.pipelineStatus;
    const blinkingClass = getBlinkingClass(
      isPipelineRootNode,
      pipelineStatus?.executionStatus
    );
    const currentPipelineStatus = getPipelineStatusClass(
      pipelineStatus?.executionStatus
    );

    const dataTestId = `function-icon-${edgeDetails?.fromEntity.fullyQualifiedName}-${edgeDetails?.toEntity.fullyQualifiedName}`;

    const buttonElement = (
      <Button
        className={classNames(
          'flex-center custom-edge-pipeline-button',
          blinkingClass
        )}
        data-testid={dataTestId}
        icon={<FunctionIcon />}
        onClick={() => isEditMode && onPipelineClick?.()}
      />
    );

    if (isEditMode) {
      return (
        <div
          key={`function-${edge.id}`}
          style={getAbsolutePosition(
            pathData.edgeCenterX,
            pathData.edgeCenterY,
            viewport
          )}>
          {buttonElement}
        </div>
      );
    }

    return (
      <div
        key={`function-${edge.id}`}
        style={getAbsolutePosition(
          pathData.edgeCenterX,
          pathData.edgeCenterY,
          viewport
        )}>
        <EntityPopOverCard
          entityFQN={edgeDetails?.pipeline?.fullyQualifiedName}
          entityType={edge.data.pipelineEntityType}
          extraInfo={
            pipelineStatus && (
              <Tag className={currentPipelineStatus}>
                {pipelineStatus.executionStatus}
              </Tag>
            )
          }>
          {buttonElement}
        </EntityPopOverCard>
      </div>
    );
  };

  const renderEditButton = (edge: Edge) => {
    const { isColumnLineage } = edge.data || {};
    const pathData = computePathData(edge);

    if (isColumnLineage || !pathData) {
      return null;
    }

    return (
      <div
        key={`edit-${edge.id}`}
        style={getAbsolutePosition(
          pathData.edgeCenterX,
          pathData.edgeCenterY,
          viewport
        )}>
        <Button
          className="cursor-pointer d-flex"
          data-testid="add-pipeline"
          icon={
            <Icon
              alt="edit-circle"
              className="align-middle"
              component={IconEditCircle}
              style={{ fontSize: '16px' }}
            />
          }
          type="link"
          onClick={() => onPipelineClick?.()}
        />
      </div>
    );
  };

  const renderDeleteButton = (edge: Edge) => {
    const { isColumnLineage } = edge.data || {};
    const pathData = computePathData(edge);

    if (!isColumnLineage || !pathData) {
      return null;
    }

    return (
      <div
        key={`delete-${edge.id}`}
        style={getAbsolutePosition(
          pathData.edgeCenterX,
          pathData.edgeCenterY,
          viewport
        )}>
        <Button
          className="cursor-pointer d-flex"
          data-testid="delete-button"
          icon={
            <Icon
              alt="times-circle"
              className="align-middle"
              component={IconTimesCircle}
              style={{ fontSize: '16px' }}
            />
          }
          type="link"
          onClick={() => onEdgeRemove?.()}
        />
      </div>
    );
  };

  return (
    <div className="edge-interaction-overlay">
      {hoveredEdge && renderPipelinePopover(hoveredEdge)}
      {hoveredEdge && renderFunctionPopover(hoveredEdge)}

      {selectedEdge && isEditMode && renderEditButton(selectedEdge)}
      {selectedEdge && isEditMode && renderDeleteButton(selectedEdge)}
    </div>
  );
};
