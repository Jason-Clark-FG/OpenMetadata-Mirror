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
import {
  BORDER_COLOR,
  LINEAGE_CHILD_ITEMS_PER_PAGE,
} from '../../../../constants/constants';
import { DATATYPES_HAVING_SUBFIELDS } from '../../../../constants/Lineage.constants';
import { EntityType } from '../../../../enums/entity.enum';
import { Column, Table } from '../../../../generated/entity/data/table';
import {
  EntityReference,
  TestSummary,
} from '../../../../generated/tests/testCase';
import { useLineageStore } from '../../../../hooks/useLineageStore';
import { getTestCaseExecutionSummary } from '../../../../rest/testAPI';
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
  showColumnsWithLineageOnly: boolean;
}

const CustomPaginatedList = React.memo(
  ({
    columns,
    page,
    renderColumn,
    setPage,
    showColumnsWithLineageOnly,
  }: CustomPaginatedListProps) => {
    const { t } = useTranslation();
    const { tracedColumns } = useLineageStore();

    const totalPages = useMemo(
      () =>
        showColumnsWithLineageOnly
          ? 1
          : calculateTotalPages(columns.length, LINEAGE_CHILD_ITEMS_PER_PAGE),
      [columns.length, showColumnsWithLineageOnly]
    );

    const currentPageColumns = useMemo(
      () => getCurrentPageItems(columns, page, LINEAGE_CHILD_ITEMS_PER_PAGE),
      [columns, page]
    );

    const otherPageColumns = useMemo(
      () =>
        showColumnsWithLineageOnly
          ? []
          : columns.slice(page * LINEAGE_CHILD_ITEMS_PER_PAGE, 1000),
      [columns, page]
    );

    const renderedItems = useMemo(
      () =>
        (showColumnsWithLineageOnly ? columns : currentPageColumns).map(
          (col) => {
            const column = col as Column;
            const rendered = renderColumn(column);

            return rendered ? (
              <div
                className="current-page-item"
                key={column.fullyQualifiedName}>
                {rendered}
              </div>
            ) : null;
          }
        ),
      [currentPageColumns, renderColumn]
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
      <Stack spacing={2}>
        <Stack className="current-page-items" spacing={1}>
          {renderedItems}
        </Stack>

        <Stack className="outside-current-page-items" spacing={1}>
          {otherPageColumns.map((col) => {
            const column = col as Column;
            const rendered = renderColumn(column);

            const isTraced = tracedColumns.has(column.fullyQualifiedName ?? '');

            return rendered && isTraced ? (
              <div
                className={classNames('other-page-item')}
                key={column.fullyQualifiedName}>
                {rendered}
              </div>
            ) : null;
          })}
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
  entityChildrenData,
}: NodeChildrenProps) => {
  const { t } = useTranslation();
  const { Panel } = Collapse;

  const {
    isEditMode,
    columnsHavingLineage,
    isColumnLevelLineage,
    expandAllColumns,
    isDQEnabled,
    selectedColumn,
    isCreatingEdge,
  } = useLineageStore();
  const { entityType } = node;
  const [searchValue, setSearchValue] = useState('');
  const [filteredColumns, setFilteredColumns] = useState<EntityChildren>([]);
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

  const { children: entityChildren, childrenHeading } = entityChildrenData;

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
      } else {
        const lowerQuery = searchQuery.toLowerCase();
        const currentNodeMatchedColumns = currentNodeColumnsToSearch.filter(
          (column) => getEntityName(column).toLowerCase().includes(lowerQuery)
        );
        setFilteredColumns(currentNodeMatchedColumns);
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
      if (expandAllColumns || isEditMode) {
        return true;
      }

      return columnsHavingLineage.has(record.fullyQualifiedName ?? '');
    },
    [isEditMode, columnsHavingLineage, expandAllColumns]
  );

  useEffect(() => {
    if (showColumnsWithLineageOnly) {
      setFilteredColumns(currentNodeColumnsWithLineage);
    } else {
      setFilteredColumns(currentNodeAllColumns);
    }
  }, [
    currentNodeAllColumns,
    showColumnsWithLineageOnly,
    currentNodeColumnsWithLineage,
  ]);

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
      const columnSummary = getColumnSummary(record);

      const headerContent = (
        <ColumnContent
          column={record}
          isConnectable={isConnectable}
          isLoading={isLoading}
          showDataObservabilitySummary={showDataObservabilitySummary}
          summary={columnSummary}
        />
      );

      if (!record.children || record.children.length === 0) {
        return headerContent;
      }

      const childRecords = record?.children?.map((child) => {
        const { fullyQualifiedName, dataType } = child;

        const columnSummary = getColumnSummary(child);

        if (DATATYPES_HAVING_SUBFIELDS.includes(dataType)) {
          return renderRecord(child);
        } else {
          if (!isColumnVisible(child)) {
            return null;
          }

          return (
            <ColumnContent
              column={child}
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
      const { dataType } = column;
      const columnSummary = getColumnSummary(column);

      if (DATATYPES_HAVING_SUBFIELDS.includes(dataType)) {
        return renderRecord(column);
      } else {
        return (
          <ColumnContent
            column={column}
            isConnectable={isConnectable}
            isLoading={isLoading}
            key={column.fullyQualifiedName}
            showDataObservabilitySummary={showDataObservabilitySummary}
            summary={columnSummary}
          />
        );
      }
    },
    [
      getColumnSummary,
      renderRecord,
      isColumnVisible,
      isConnectable,
      showDataObservabilitySummary,
      isLoading,
    ]
  );

  if (!isChildrenListExpanded) {
    return null;
  }

  if (isColumnLevelLineage || isDQEnabled) {
    return (
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
                  showColumnsWithLineageOnly={showColumnsWithLineageOnly}
                />
              </div>
            </section>
          )}
        </div>
      </div>
    );
  } else {
    return null;
  }
};

export default React.memo(NodeChildren);
