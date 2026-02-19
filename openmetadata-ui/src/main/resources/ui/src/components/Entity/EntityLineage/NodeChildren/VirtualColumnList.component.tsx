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
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { IconButton, Stack } from '@mui/material';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LINEAGE_CHILD_ITEMS_PER_PAGE } from '../../../../constants/constants';
import { Column } from '../../../../generated/entity/data/table';
import { TestSummary } from '../../../../generated/tests/testCase';
import { useLineageStore } from '../../../../hooks/useLineageStore';
import EntityLink from '../../../../utils/EntityLink';
import { ColumnContent } from '../CustomNode.utils';
import { Flatten } from './NodeChildren.interface';

export interface VirtualColumnListProps {
  flatItems: Flatten<Column>[];
  isConnectable: boolean;
  isLoading: boolean;
  nodeId?: string;
  showDataObservabilitySummary: boolean;
  summary?: TestSummary;
}

const VirtualColumnList = ({
  flatItems,
  isConnectable,
  isLoading,
  nodeId,
  showDataObservabilitySummary,
  summary,
}: VirtualColumnListProps) => {
  const { updateColumnsInCurrentPages, selectedColumn, tracedColumns } =
    useLineageStore();
  const [offset, setOffset] = useState(0);

  // Reset window to top when flatItems changes (filter/search)
  useEffect(() => {
    setOffset(0);
  }, [flatItems]);

  const endIndex = Math.min(
    flatItems.length - 1,
    offset + LINEAGE_CHILD_ITEMS_PER_PAGE - 1
  );

  const visibleFlatItems = useMemo(
    () => flatItems.slice(offset, endIndex + 1),
    [flatItems, offset, endIndex]
  );

  const outsideFlatItems = useMemo(() => {
    if (tracedColumns.size === 0) {
      return [];
    }

    return [
      ...flatItems.slice(0, offset),
      ...flatItems.slice(endIndex + 1),
    ].filter((fi) => tracedColumns.has(fi.fullyQualifiedName ?? ''));
  }, [flatItems, offset, endIndex, tracedColumns]);

  // Keep edge renderer in sync with the visible window
  useEffect(() => {
    updateColumnsInCurrentPages(
      nodeId ?? '',
      [...visibleFlatItems, ...outsideFlatItems].map(
        (fi) => fi.fullyQualifiedName ?? ''
      )
    );
  }, [visibleFlatItems, nodeId, outsideFlatItems]);
  const canScrollUp = offset > 0;
  const canScrollDown = endIndex < flatItems.length - 1;

  const handleUp = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setOffset((prev) => Math.max(0, prev - LINEAGE_CHILD_ITEMS_PER_PAGE));
  }, []);

  const handleDown = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      setOffset((prev) =>
        Math.min(
          flatItems.length - LINEAGE_CHILD_ITEMS_PER_PAGE,
          prev + LINEAGE_CHILD_ITEMS_PER_PAGE
        )
      );
    },
    [flatItems.length]
  );

  const getColumnSummary = useCallback(
    (column: Column) =>
      summary?.columnTestSummary?.find(
        (data) =>
          EntityLink.getEntityColumnFqn(data.entityLink ?? '') ===
          column.fullyQualifiedName
      ),
    [summary]
  );

  const renderFlatItem = useCallback(
    (column: Flatten<Column>, _className: string) => {
      const { depth = 0 } = column;
      const columnSummary = getColumnSummary(column);

      return (
        <ColumnContent
          column={column}
          depth={depth}
          isConnectable={isConnectable}
          isLoading={isLoading}
          key={column.fullyQualifiedName}
          showDataObservabilitySummary={showDataObservabilitySummary}
          summary={columnSummary}
        />
      );
    },
    // selectedColumn triggers re-render when column selection changes
    [
      getColumnSummary,
      isConnectable,
      isLoading,
      showDataObservabilitySummary,
      selectedColumn,
    ]
  );

  const needsNavigation = flatItems.length > LINEAGE_CHILD_ITEMS_PER_PAGE;

  return (
    <>
      <Stack alignItems="center" justifyContent="center">
        <IconButton
          data-testid="column-scroll-up"
          disabled={!canScrollUp}
          size="small"
          onClick={handleUp}>
          <KeyboardArrowUpIcon fontSize="small" />
        </IconButton>
      </Stack>

      <div className="inside-current-page-items">
        {visibleFlatItems.map((fi) =>
          renderFlatItem(fi, 'inside-current-page-item')
        )}
      </div>

      <div className="outside-current-page-items">
        {outsideFlatItems.map((fi) =>
          renderFlatItem(fi, 'outside-current-page-item')
        )}
      </div>

      {needsNavigation && (
        <Stack alignItems="center" justifyContent="center">
          <IconButton
            data-testid="column-scroll-down"
            disabled={!canScrollDown}
            size="small"
            onClick={handleDown}>
            <KeyboardArrowDownIcon fontSize="small" />
          </IconButton>
        </Stack>
      )}
    </>
  );
};

export default VirtualColumnList;
