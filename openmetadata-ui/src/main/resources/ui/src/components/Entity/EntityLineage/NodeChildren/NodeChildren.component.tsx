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
import { Collapse, Input } from 'antd';
import classNames from 'classnames';
import { isEmpty, isUndefined } from 'lodash';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUpdateNodeInternals } from 'reactflow';
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
import {
  EntityReference,
  TestSummary,
} from '../../../../generated/tests/testCase';
import { useLineageStore } from '../../../../hooks/useLineageStore';
import { getTestCaseExecutionSummary } from '../../../../rest/testAPI';
import { getEntityChildrenAndLabel } from '../../../../utils/EntityLineageUtils';
import {
  calculateTotalPages,
  getCurrentPageItems,
} from '../../../../utils/EntityLineageUtils/ColumnPaginationUtils';
import EntityLink from '../../../../utils/EntityLink';
import { getEntityName } from '../../../../utils/EntityUtils';
import { ColumnContent } from '../CustomNode.utils';
import {
  EntityChildren,
  EntityChildrenItem,
  NodeChildrenProps,
} from './NodeChildren.interface';

interface CustomPaginatedListProps {
  columns: EntityChildren;
  nodeId?: string;
  page: number;
  renderColumn: (column: Column) => React.ReactNode;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}

const CustomPaginatedList = React.memo(
  ({
    columns,
    nodeId,
    page,
    renderColumn,
    setPage,
  }: CustomPaginatedListProps) => {
    const updateNodeInternals = useUpdateNodeInternals();
    const { t } = useTranslation();

    const totalPages = useMemo(
      () => calculateTotalPages(columns.length, LINEAGE_CHILD_ITEMS_PER_PAGE),
      [columns.length]
    );

    const currentPageColumns = useMemo(
      () => getCurrentPageItems(columns, page, LINEAGE_CHILD_ITEMS_PER_PAGE),
      [columns, page]
    );

    const renderedItems = useMemo(
      () =>
        currentPageColumns.map((col) => {
          const column = col as Column;
          const rendered = renderColumn(column);

          return rendered ? (
            <div className="current-page-item" key={column.fullyQualifiedName}>
              {rendered}
            </div>
          ) : null;
        }),
      [currentPageColumns, renderColumn]
    );

    const handlePageChange = useCallback(
      (newPage: number) => {
        setPage(newPage);
        if (nodeId) {
          updateNodeInternals(nodeId);
        }
      },
      [nodeId, setPage, updateNodeInternals]
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
      <Stack spacing={2}>
        <Stack className="current-page-items" spacing={1}>
          {renderedItems}
        </Stack>

        {totalPages > 1 && (
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
        )}
      </Stack>
    );
  }
);

const NodeChildren = ({
  node,
  isConnectable,
  isChildrenListExpanded,
  showColumnsWithLineageOnly,
}: NodeChildrenProps) => {
  const { t } = useTranslation();
  const { Panel } = Collapse;
  const { selectedColumn, isCreatingEdge } = useLineageProvider();

  const {
    isEditMode,
    columnsHavingLineage,
    tracedColumns,
    expandAllColumns,
    isColumnLevelLineage,
    isDQEnabled,
  } = useLineageStore();
  const updateNodeInternals = useUpdateNodeInternals();
  const { entityType } = node;
  const [searchValue, setSearchValue] = useState('');
  const [filteredColumns, setFilteredColumns] = useState<EntityChildren>([]);
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [summary, setSummary] = useState<TestSummary>();
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

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

  const showDataObservabilitySummary = useMemo(() => {
    return Boolean(
      isDQEnabled &&
        entityType === EntityType.TABLE &&
        (node as Table).testSuite
    );
  }, [node, isDQEnabled, entityType]);

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

  const currentNodeAllColumns = useMemo(
    () => Object.values(entityChildren ?? {}),
    [entityChildren]
  );

  const hasLineageInNestedChildren = useCallback(
    (column: EntityChildrenItem): boolean => {
      if (columnsHavingLineage.has(column.fullyQualifiedName ?? '')) {
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

  const performSearch = useCallback(
    (searchQuery: string) => {
      const currentNodeColumnsToSearch = showColumnsWithLineageOnly
        ? currentNodeColumnsWithLineage
        : currentNodeAllColumns;

      if (searchQuery.trim() === '') {
        setFilteredColumns(currentNodeColumnsToSearch);
        setShowAllColumns(false);
      } else {
        const lowerQuery = searchQuery.toLowerCase();
        const currentNodeMatchedColumns = currentNodeColumnsToSearch.filter(
          (column) => getEntityName(column).toLowerCase().includes(lowerQuery)
        );
        setFilteredColumns(currentNodeMatchedColumns);
        setShowAllColumns(true);
      }
    },
    [
      currentNodeAllColumns,
      currentNodeColumnsWithLineage,
      showColumnsWithLineageOnly,
    ]
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      const searchQuery = e.target.value;
      setSearchValue(searchQuery);
      performSearch(searchQuery);
    },
    [performSearch]
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

      return columnsHavingLineage.has(record.fullyQualifiedName ?? '');
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
      if (showColumnsWithLineageOnly) {
        setFilteredColumns(currentNodeColumnsWithLineage);
      } else {
        setFilteredColumns(currentNodeAllColumns);
      }
    }
  }, [
    currentNodeAllColumns,
    showColumnsWithLineageOnly,
    currentNodeColumnsWithLineage,
  ]);

  useEffect(() => {
    setShowAllColumns(expandAllColumns);
  }, [expandAllColumns]);

  useEffect(() => {
    if (node.id) {
      updateNodeInternals?.(node.id);
    }
  }, [updateNodeInternals, tracedColumns, node.id, showColumnsWithLineageOnly]);

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

  const renderRecord = useCallback(
    (record: Column) => {
      const isColumnTraced = tracedColumns.has(record.fullyQualifiedName ?? '');

      const columnSummary = getColumnSummary(record);

      const headerContent = (
        <ColumnContent
          column={record}
          isColumnTraced={isColumnTraced}
          isConnectable={isConnectable}
          isLoading={isLoading}
          showDataObservabilitySummary={showDataObservabilitySummary}
          summary={columnSummary}
        />
      );

      if (!record.children || record.children.length === 0) {
        if (!isColumnVisible(record)) {
          return null;
        }

        return headerContent;
      }

      const childRecords = record?.children?.map((child) => {
        const { fullyQualifiedName, dataType } = child;

        const columnSummary = getColumnSummary(child);

        if (DATATYPES_HAVING_SUBFIELDS.includes(dataType)) {
          return renderRecord(child);
        } else {
          const isColumnTraced = tracedColumns.has(fullyQualifiedName ?? '');

          if (!isColumnVisible(child)) {
            return null;
          }

          return (
            <ColumnContent
              column={child}
              isColumnTraced={isColumnTraced}
              isConnectable={isConnectable}
              isLoading={isLoading}
              key={fullyQualifiedName}
              showDataObservabilitySummary={showDataObservabilitySummary}
              summary={columnSummary}
            />
          );
        }
      });

      const result = childRecords.filter((child) => child !== null);

      if (result.length === 0) {
        return null;
      }

      return (
        <Collapse
          destroyInactivePanel
          className="lineage-collapse-column"
          defaultActiveKey={record.fullyQualifiedName}
          expandIcon={() => null}
          key={record.fullyQualifiedName}>
          <Panel header={headerContent} key={record.fullyQualifiedName ?? ''}>
            {result}
          </Panel>
        </Collapse>
      );
    },
    [
      tracedColumns,
      getColumnSummary,
      isConnectable,
      showDataObservabilitySummary,
      isLoading,
      Panel,
      isColumnVisible,
    ]
  );
  const renderColumnsData = useCallback(
    (column: Column) => {
      const { fullyQualifiedName, dataType } = column;
      const columnSummary = getColumnSummary(column);

      if (DATATYPES_HAVING_SUBFIELDS.includes(dataType)) {
        return renderRecord(column);
      } else {
        const isColumnTraced = tracedColumns.has(fullyQualifiedName ?? '');
        if (!isColumnVisible(column)) {
          return null;
        }

        return (
          <ColumnContent
            column={column}
            isColumnTraced={isColumnTraced}
            isConnectable={isConnectable}
            isLoading={isLoading}
            showDataObservabilitySummary={showDataObservabilitySummary}
            summary={columnSummary}
          />
        );
      }
    },
    [
      getColumnSummary,
      renderRecord,
      tracedColumns,
      isColumnVisible,
      isConnectable,
      showDataObservabilitySummary,
      isLoading,
    ]
  );

  if (!isChildrenListExpanded) {
    return null;
  }

  if (supportsColumns && (isColumnLevelLineage || isDQEnabled)) {
    return (
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

            {!isEmpty(filteredColumns) && (
              <section className="m-t-md" id="table-columns">
                <div className="rounded-4 overflow-hidden">
                  <CustomPaginatedList
                    columns={filteredColumns}
                    nodeId={node.id}
                    page={page}
                    renderColumn={renderColumnsData}
                    setPage={setPage}
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

export default React.memo(NodeChildren);
