/*
 *  Copyright 2022 Collate.
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

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Handle, NodeProps, Position } from 'reactflow';
import { useLineageProvider } from '../../../context/LineageProvider/LineageProvider';
import { EntityLineageNodeType } from '../../../enums/entity.enum';
import { LineageDirection } from '../../../generated/api/lineage/lineageDirection';
import { useLineageStore } from '../../../hooks/useLineageStore';
import LineageNodeRemoveButton from '../../Lineage/LineageNodeRemoveButton';
import './custom-node.less';
import {
  getCollapseHandle,
  getExpandHandle,
  getNodeClassNames,
} from './CustomNode.utils';
import './entity-lineage.style.less';
import {
  ExpandCollapseHandlesProps,
  NodeHandlesProps,
} from './EntityLineage.interface';
import LineageNodeLabelV1 from './LineageNodeLabelV1';
import NodeChildren from './NodeChildren/NodeChildren.component';

const NodeHandles = memo(
  ({
    nodeType,
    id,
    isConnectable,
    expandCollapseHandles,
  }: NodeHandlesProps) => {
    switch (nodeType) {
      case EntityLineageNodeType.OUTPUT:
        return (
          <>
            <Handle
              className="lineage-node-handle"
              id={id}
              isConnectable={isConnectable}
              position={Position.Left}
              type="target"
            />
            {expandCollapseHandles}
          </>
        );

      case EntityLineageNodeType.INPUT:
        return (
          <>
            <Handle
              className="lineage-node-handle"
              id={id}
              isConnectable={isConnectable}
              position={Position.Right}
              type="source"
            />
            {expandCollapseHandles}
          </>
        );

      case EntityLineageNodeType.NOT_CONNECTED:
        return null;

      default:
        return (
          <>
            <Handle
              className="lineage-node-handle"
              id={id}
              isConnectable={isConnectable}
              position={Position.Left}
              type="target"
            />
            <Handle
              className="lineage-node-handle"
              id={id}
              isConnectable={isConnectable}
              position={Position.Right}
              type="source"
            />
            {expandCollapseHandles}
          </>
        );
    }
  }
);

const ExpandCollapseHandles = memo(
  ({
    isEditMode,
    hasOutgoers,
    hasIncomers,
    isDownstreamNode,
    isUpstreamNode,
    isRootNode,
    upstreamExpandPerformed,
    downstreamExpandPerformed,
    upstreamLineageLength,
    onCollapse,
    onExpand,
  }: ExpandCollapseHandlesProps) => {
    if (isEditMode) {
      return null;
    }

    return (
      <>
        {hasOutgoers &&
          (isDownstreamNode || isRootNode) &&
          getCollapseHandle(LineageDirection.Downstream, onCollapse)}

        {!hasOutgoers &&
          !downstreamExpandPerformed &&
          getExpandHandle(LineageDirection.Downstream, (depth = 1) =>
            onExpand(LineageDirection.Downstream, depth)
          )}

        {hasIncomers &&
          (isUpstreamNode || isRootNode) &&
          getCollapseHandle(LineageDirection.Upstream, () =>
            onCollapse(LineageDirection.Upstream)
          )}

        {!hasIncomers &&
          !upstreamExpandPerformed &&
          upstreamLineageLength > 0 &&
          getExpandHandle(LineageDirection.Upstream, (depth = 1) =>
            onExpand(LineageDirection.Upstream, depth)
          )}
      </>
    );
  }
);

const CustomNodeV1 = (props: NodeProps) => {
  const { data, type, isConnectable } = props;

  const {
    onNodeCollapse,
    removeNodeHandler,
    loadChildNodesHandler,
    dataQualityLineage,
  } = useLineageProvider();

  const {
    isEditMode,
    tracedNodes,
    selectedNode,
    isColumnLevelLineage,
    isDQEnabled,
    expandAllColumns,
  } = useLineageStore();

  // by default it will be enabled
  const [showColumnsWithLineageOnly, setShowColumnsWithLineageOnly] =
    useState(true);

  const [columnsExpanded, setColumnsExpanded] = useState<boolean>(false);

  const {
    label,
    isNewNode,
    node = {},
    isRootNode,
    hasOutgoers = false,
    hasIncomers = false,
    isUpstreamNode = false,
    isDownstreamNode = false,
  } = data;

  // Expand column on ColumnLevelLineage change
  useEffect(() => {
    if (isEditMode) {
      setShowColumnsWithLineageOnly(false);
    } else if (isColumnLevelLineage) {
      setShowColumnsWithLineageOnly(true);
    } else {
      setShowColumnsWithLineageOnly(false);
    }

    setColumnsExpanded(isColumnLevelLineage);
  }, [isColumnLevelLineage, isEditMode]);

  useEffect(() => {
    setColumnsExpanded(isEditMode);
  }, [isEditMode]);

  const toggleColumnsExpanded = useCallback(() => {
    setColumnsExpanded((prev) => !prev);
  }, []);

  const nodeType = isEditMode ? EntityLineageNodeType.DEFAULT : type;
  const isSelected = selectedNode === node;
  const {
    id,
    fullyQualifiedName,
    upstreamLineage = [],
    upstreamExpandPerformed = false,
    downstreamExpandPerformed = false,
  } = node;

  const showDqTracing = useMemo(
    () =>
      isDQEnabled &&
      dataQualityLineage?.nodes?.some((dqNode) => dqNode.id === id),
    [isDQEnabled, dataQualityLineage, id]
  );

  const containerClass = getNodeClassNames({
    isSelected,
    showDqTracing: showDqTracing ?? false,
    isTraced: tracedNodes.has(id),
    isBaseNode: isRootNode,
    isChildrenListExpanded: columnsExpanded,
  });

  const onExpand = useCallback(
    (direction: LineageDirection, depth = 1) => {
      loadChildNodesHandler(node, direction, depth);
    },
    [loadChildNodesHandler, node]
  );

  const onCollapse = useCallback(
    (direction = LineageDirection.Downstream) => {
      onNodeCollapse(props, direction);
    },
    [onNodeCollapse, props]
  );

  const toggleShowColumnsWithLineageOnly = useCallback(() => {
    setShowColumnsWithLineageOnly((prev) => !prev);
  }, []);

  const handleNodeRemove = useCallback(() => {
    removeNodeHandler(props);
  }, [removeNodeHandler, props]);

  const nodeLabel = useMemo(() => {
    if (isNewNode) {
      return label;
    }

    return (
      <>
        <LineageNodeLabelV1
          isChildrenListExpanded={columnsExpanded || expandAllColumns}
          isOnlyShowColumnsWithLineageFilterActive={showColumnsWithLineageOnly}
          node={node}
          toggleColumnsList={toggleColumnsExpanded}
          toggleOnlyShowColumnsWithLineageFilterActive={
            toggleShowColumnsWithLineageOnly
          }
        />
        {isSelected && isEditMode && !isRootNode && (
          <LineageNodeRemoveButton onRemove={handleNodeRemove} />
        )}
      </>
    );
  }, [
    node.id,
    isNewNode,
    label,
    isSelected,
    isEditMode,
    isRootNode,
    showColumnsWithLineageOnly,
    toggleColumnsExpanded,
    toggleShowColumnsWithLineageOnly,
    removeNodeHandler,
    props,
    handleNodeRemove,
    toggleColumnsExpanded,
    isEditMode,
  ]);

  const expandCollapseProps = useMemo<ExpandCollapseHandlesProps>(
    () => ({
      upstreamExpandPerformed,
      downstreamExpandPerformed,
      hasIncomers,
      hasOutgoers,
      isDownstreamNode,
      isEditMode,
      isRootNode,
      isUpstreamNode,
      upstreamLineageLength: upstreamLineage.length,
      onCollapse,
      onExpand,
    }),
    [
      upstreamExpandPerformed,
      downstreamExpandPerformed,
      hasIncomers,
      hasOutgoers,
      isDownstreamNode,
      isEditMode,
      isRootNode,
      isUpstreamNode,
      upstreamLineage.length,
      onCollapse,
      onExpand,
    ]
  );

  const handlesElement = useMemo(
    () => <ExpandCollapseHandles {...expandCollapseProps} />,
    [expandCollapseProps]
  );

  return (
    <div
      className={containerClass}
      data-testid={`lineage-node-${fullyQualifiedName}`}>
      {isRootNode && (
        <div className="lineage-node-badge-container">
          <div className="lineage-node-badge" />
        </div>
      )}
      <div className="lineage-node-content">
        <div className="label-container bg-white">{nodeLabel}</div>
        <NodeHandles
          expandCollapseHandles={handlesElement}
          id={id}
          isConnectable={isConnectable}
          nodeType={nodeType}
        />
        <NodeChildren
          isChildrenListExpanded={columnsExpanded || expandAllColumns}
          isConnectable={isConnectable}
          isOnlyShowColumnsWithLineageFilterActive={showColumnsWithLineageOnly}
          node={node}
        />
      </div>
    </div>
  );
};

export default memo(CustomNodeV1);
