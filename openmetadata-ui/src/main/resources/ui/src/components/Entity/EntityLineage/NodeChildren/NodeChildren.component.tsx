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
import { SearchOutlined } from '@ant-design/icons';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { IconButton, Stack, Typography } from '@mui/material';
import { Input } from 'antd';
import classNames from 'classnames';
import { isEmpty, isUndefined } from 'lodash';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BORDER_COLOR,
  LINEAGE_CHILD_ITEMS_PER_PAGE,
} from '../../../../constants/constants';
import {
  DATATYPES_HAVING_SUBFIELDS,
  LINEAGE_COLUMN_NODE_SUPPORTED,
} from '../../../../constants/Lineage.constants';
import { useLineageProvider } from '../../../../context/LineageProvider/LineageProvider';
import { EntityType } from '../../../../enums/entity.enum';
import { Column, Table } from '../../../../generated/entity/data/table';
import { LineageLayer } from '../../../../generated/settings/settings';
import {
  EntityReference,
  TestSummary,
} from '../../../../generated/tests/testCase';
import { getTestCaseExecutionSummary } from '../../../../rest/testAPI';
import { getEntityChildrenAndLabel } from '../../../../utils/EntityLineageUtils';
import EntityLink from '../../../../utils/EntityLink';
import { getEntityName } from '../../../../utils/EntityUtils';
import { ColumnContent } from '../CustomNode.utils';
import {
  EntityChildren,
  EntityChildrenItem,
  FlatColumnItem,
  NodeChildrenProps,
} from './NodeChildren.interface';

interface CustomPaginatedListProps {
  flatItems: FlatColumnItem[];
  isConnectable: boolean;
  isLoading: boolean;
  nodeId?: string;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  showDataObservabilitySummary: boolean;
  summary?: TestSummary;
}

const DEPTH_INDENT_PX = 16;

const CustomPaginatedList = ({
  flatItems,
  isConnectable,
  isLoading,
  nodeId,
  page,
  setPage,
  showDataObservabilitySummary,
  summary,
}: CustomPaginatedListProps) => {
  const { t } = useTranslation();
  const { setColumnsInCurrentPages, tracedColumns, selectedColumn } =
    useLineageProvider();

  const totalPages = Math.ceil(flatItems.length / LINEAGE_CHILD_ITEMS_PER_PAGE);
  const startIdx = (page - 1) * LINEAGE_CHILD_ITEMS_PER_PAGE;
  const endIdx = startIdx + LINEAGE_CHILD_ITEMS_PER_PAGE;

  const currentPageFlatItems = useMemo(
    () => flatItems.slice(startIdx, endIdx),
    [flatItems, startIdx, endIdx]
  );

  const outsidePageFlatItems = useMemo(
    () => [...flatItems.slice(0, startIdx), ...flatItems.slice(endIdx)],
    [flatItems, startIdx, endIdx]
  );

  //   const currentNodeCurrentPageItems = useMemo(
  //     () =>
  //       currentPageFlatItems
  //         .map((fi) => fi.column.fullyQualifiedName)
  //         .filter((fqn): fqn is string => Boolean(fqn)),
  //     [currentPageFlatItems]
  //   );

  /**
   * This updates `columnsInCurrentPages` object for current node
   *
   * When page or filter is changed, this effect is called
   * When filter is activated
   *  - entry for nodeid is updated with `currentNodeAllPagesItems`
   *  - `currentNodeAllPagesItems` is updated using `filteredColumns`
   *  - `filteredColumns` is updated to only include columns having lineage
   * When filter is deactivated
   *  - entry is updated with `currentNodeCurrentPageItems`.
   *  - `currentNodeCurrentPageItems` is updated using `filteredColumns`
   *  - `filteredColumns` is updated to include all columns of current node
   */
  useEffect(() => {
    setColumnsInCurrentPages((prev) => {
      const updated = { ...prev };
      if (nodeId) {
        updated[nodeId] = currentPageFlatItems.map(
          (fi) => fi.column.fullyQualifiedName ?? ''
        );
      }

      return updated;
    });
  }, [currentPageFlatItems, page]);

  const getColumnSummary = useCallback(
    (column: Column) => {
      const { fullyQualifiedName } = column;

      return summary?.columnTestSummary?.find(
        (data) =>
          EntityLink.getEntityColumnFqn(data.entityLink ?? '') ===
          fullyQualifiedName
      );
    },
    [summary]
  );

  const renderFlatItem = useCallback(
    (flatItem: FlatColumnItem, className: string) => {
      const { column, depth } = flatItem;
      const isColumnTraced = tracedColumns.includes(
        column.fullyQualifiedName ?? ''
      );
      const columnSummary = getColumnSummary(column);

      return (
        <div
          className={className}
          key={column.fullyQualifiedName}
          style={{
            paddingLeft: depth * DEPTH_INDENT_PX,
          }}>
          <ColumnContent
            column={column}
            isColumnTraced={isColumnTraced}
            isConnectable={isConnectable}
            isLoading={isLoading}
            showDataObservabilitySummary={showDataObservabilitySummary}
            summary={columnSummary}
          />
        </div>
      );
    },
    [
      tracedColumns,
      getColumnSummary,
      isConnectable,
      isLoading,
      showDataObservabilitySummary,
      selectedColumn,
    ]
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      setPage(newPage);
    },
    [setPage]
  );

  const handlePrev = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      handlePageChange(Math.max(page - 1, 1));
    },
    [page, handlePageChange]
  );

  const handleNext = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      handlePageChange(Math.min(page + 1, totalPages));
    },
    [page, totalPages, handlePageChange]
  );

  return (
    <>
      <Stack className="inside-current-page-items" spacing={1}>
        {currentPageFlatItems.map((fi) =>
          renderFlatItem(fi, 'inside-current-page-item')
        )}
      </Stack>
      <Stack className="outside-current-page-items" spacing={1}>
        {outsidePageFlatItems.map((fi) =>
          renderFlatItem(fi, 'outside-current-page-item')
        )}
      </Stack>

      <Stack
        alignItems="center"
        direction="row"
        justifyContent="center"
        mt={2}
        spacing={1}>
        <IconButton
          data-testid="prev-btn"
          disabled={page === 1}
          size="small"
          onClick={handlePrev}>
          <ChevronLeftIcon />
        </IconButton>

        <Typography variant="body2">
          {page} {t('label.slash-symbol')} {totalPages}
        </Typography>

        <IconButton
          data-testid="next-btn"
          disabled={page === totalPages}
          size="small"
          onClick={handleNext}>
          <ChevronRightIcon />
        </IconButton>
      </Stack>
    </>
  );
};

const NodeChildren = ({
  node,
  isConnectable,
  isChildrenListExpanded,
  isOnlyShowColumnsWithLineageFilterActive,
}: NodeChildrenProps) => {
  const { t } = useTranslation();
  const {
    activeLayer,
    columnsHavingLineage,
    isEditMode,
    expandAllColumns,
    selectedColumn,
    isCreatingEdge,
  } = useLineageProvider();
  const { entityType } = node;
  const [searchValue, setSearchValue] = useState('');
  const [filteredColumns, setFilteredColumns] = useState<EntityChildren>([]);
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [summary, setSummary] = useState<TestSummary>();
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  const { isColumnLayerEnabled, showDataObservability } = useMemo(() => {
    return {
      isColumnLayerEnabled: activeLayer.includes(
        LineageLayer.ColumnLevelLineage
      ),
      showDataObservability: activeLayer.includes(
        LineageLayer.DataObservability
      ),
    };
  }, [activeLayer]);

  const showDataObservabilitySummary = useMemo(() => {
    return Boolean(
      showDataObservability &&
        entityType === EntityType.TABLE &&
        (node as Table).testSuite
    );
  }, [node, showDataObservability, entityType]);

  const supportsColumns = useMemo(() => {
    return (
      node &&
      LINEAGE_COLUMN_NODE_SUPPORTED.includes(node.entityType as EntityType)
    );
  }, [node]);

  const { children: entityChildren, childrenHeading } = useMemo(
    () => getEntityChildrenAndLabel(node),
    [node]
  );

  const currentNodeAllColumns = useMemo(() => entityChildren, [entityChildren]);

  const hasLineageInNestedChildren = useCallback(
    (column: EntityChildrenItem): boolean => {
      if (columnsHavingLineage.includes(column.fullyQualifiedName ?? '')) {
        return true;
      }

      if (
        'children' in column &&
        Array.isArray(column.children) &&
        column.children.length > 0
      ) {
        return column.children.some((child) =>
          hasLineageInNestedChildren(child)
        );
      }

      return false;
    },
    [columnsHavingLineage]
  );

  const currentNodeColumnsWithLineage = useMemo(
    () =>
      currentNodeAllColumns.filter((column) =>
        hasLineageInNestedChildren(column)
      ),
    [currentNodeAllColumns, hasLineageInNestedChildren]
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      const searchQuery = e.target.value;
      setSearchValue(searchQuery);
      const currentNodeColumnsToSearch =
        isOnlyShowColumnsWithLineageFilterActive
          ? currentNodeColumnsWithLineage
          : currentNodeAllColumns;

      if (searchQuery.trim() === '') {
        setFilteredColumns(currentNodeColumnsToSearch);
        setShowAllColumns(false);
      } else {
        const currentNodeMatchedColumns = currentNodeColumnsToSearch.filter(
          (column) =>
            getEntityName(column)
              .toLowerCase()
              .includes(searchQuery.toLowerCase())
        );
        setFilteredColumns(currentNodeMatchedColumns);
        setShowAllColumns(true);
      }
    },
    [
      currentNodeAllColumns,
      currentNodeColumnsWithLineage,
      isOnlyShowColumnsWithLineageFilterActive,
    ]
  );

  const isColumnVisible = useCallback(
    (record: Column) => {
      if (
        expandAllColumns ||
        isEditMode ||
        showAllColumns ||
        isChildrenListExpanded
      ) {
        return true;
      }

      return columnsHavingLineage.includes(record.fullyQualifiedName ?? '');
    },
    [
      isEditMode,
      columnsHavingLineage,
      expandAllColumns,
      showAllColumns,
      isChildrenListExpanded,
    ]
  );

  useEffect(() => {
    if (!isEmpty(entityChildren)) {
      if (isOnlyShowColumnsWithLineageFilterActive) {
        setFilteredColumns(currentNodeColumnsWithLineage);
      } else {
        setFilteredColumns(currentNodeAllColumns);
      }
    }
  }, [
    currentNodeAllColumns,
    currentNodeColumnsWithLineage,
    isOnlyShowColumnsWithLineageFilterActive,
  ]);

  useEffect(() => {
    setShowAllColumns(expandAllColumns);
  }, [expandAllColumns]);

  const fetchTestSuiteSummary = async (testSuite: EntityReference) => {
    setIsLoading(true);
    try {
      const response = await getTestCaseExecutionSummary(testSuite.id);
      setSummary(response);
    } catch {
      setSummary(undefined);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const testSuite = (node as Table)?.testSuite;
    if (showDataObservabilitySummary && testSuite && isUndefined(summary)) {
      fetchTestSuiteSummary(testSuite);
    } else {
      setIsLoading(false);
    }
  }, [node, showDataObservabilitySummary, summary]);

  const flattenColumn = useCallback(
    (column: Column, depth: number): FlatColumnItem[] => {
      if (!isColumnVisible(column)) {
        return [];
      }

      const result: FlatColumnItem[] = [{ column, depth }];

      if (
        DATATYPES_HAVING_SUBFIELDS.includes(column.dataType) &&
        column.children &&
        column.children.length > 0
      ) {
        for (const child of column.children) {
          result.push(...flattenColumn(child, depth + 1));
        }
      }

      return result;
    },
    [isColumnVisible]
  );

  const flatItems = useMemo(
    () =>
      filteredColumns.flatMap((column) => flattenColumn(column as Column, 0)),
    [filteredColumns, flattenColumn]
  );

  if (
    supportsColumns &&
    (isColumnLayerEnabled || showDataObservability || isChildrenListExpanded)
  ) {
    return (
      isChildrenListExpanded &&
      !isEmpty(entityChildren) && (
        <div
          className={classNames(
            'column-container',
            selectedColumn && 'any-column-selected',
            isCreatingEdge && 'creating-edge'
          )}
          data-testid="column-container">
          <div className="search-box">
            <Input
              data-testid="search-column-input"
              placeholder={t('label.search-entity', {
                entity: childrenHeading,
              })}
              suffix={<SearchOutlined color={BORDER_COLOR} />}
              value={searchValue}
              onChange={handleSearchChange}
              onClick={(e) => e.stopPropagation()}
            />

            {!isEmpty(flatItems) && (
              <section className="m-t-md" id="table-columns">
                <div className="rounded-4 overflow-hidden">
                  <CustomPaginatedList
                    flatItems={flatItems}
                    isConnectable={isConnectable}
                    isLoading={isLoading}
                    nodeId={node.id}
                    page={page}
                    setPage={setPage}
                    showDataObservabilitySummary={showDataObservabilitySummary}
                    summary={summary}
                  />
                </div>
              </section>
            )}
          </div>
        </div>
      )
    );
  } else {
    return null;
  }
};

export default NodeChildren;
