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

import { PlusOutlined } from '@ant-design/icons';
import type { SxProps, Theme } from '@mui/material';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from '@mui/material';
import { Trash01 } from '@untitledui/icons';
import { Button, Space, Tag, Tooltip } from 'antd';
import { isEmpty } from 'lodash';
import { DateTime } from 'luxon';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactComponent as IconEdit } from '../../assets/svg/edit-new.svg';
import { ReactComponent as ArticleIcon } from '../../assets/svg/ic_article.svg';
import { ReactComponent as StoryLaneIcon } from '../../assets/svg/ic_storylane.svg';
import { ReactComponent as VideoIcon } from '../../assets/svg/ic_video.svg';
import { useSearch } from '../../components/common/atoms/navigation/useSearch';
import { useViewToggle } from '../../components/common/atoms/navigation/useViewToggle';
import Loader from '../../components/common/Loader/Loader';
import NextPrevious from '../../components/common/NextPrevious/NextPrevious';
import TitleBreadcrumb from '../../components/common/TitleBreadcrumb/TitleBreadcrumb.component';
import { LEARNING_CATEGORIES } from '../../components/Learning/Learning.interface';
import { LearningResourceCard } from '../../components/Learning/LearningResourceCard/LearningResourceCard.component';
import { ResourcePlayerModal } from '../../components/Learning/ResourcePlayer/ResourcePlayerModal.component';
import PageLayoutV1 from '../../components/PageLayoutV1/PageLayoutV1';
import {
  PAGE_SIZE_BASE,
  PAGE_SIZE_LARGE,
  PAGE_SIZE_MEDIUM,
} from '../../constants/constants';
import { GlobalSettingsMenuCategory } from '../../constants/GlobalSettings.constants';
import {
  MAX_VISIBLE_CONTEXTS,
  MAX_VISIBLE_TAGS,
  PAGE_IDS,
} from '../../constants/Learning.constants';
import { LearningResource } from '../../rest/learningResourceAPI';
import { getSettingPath } from '../../utils/RouterUtils';
import { useLearningResourceActions } from './hooks/useLearningResourceActions';
import {
  LearningResourceFilterState,
  useLearningResourceFilters,
} from './hooks/useLearningResourceFilters';
import { useLearningResources } from './hooks/useLearningResources';
import { LearningResourceForm } from './LearningResourceForm.component';
import './LearningResourcesPage.less';

export const LearningResourcesPage: React.FC = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [searchText, setSearchText] = useState('');
  const [filterState, setFilterState] = useState<LearningResourceFilterState>(
    {}
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_BASE);

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  const { resources, paging, isLoading, refetch } = useLearningResources({
    searchText,
    filterState,
    pageSize,
    currentPage,
  });

  const {
    isFormOpen,
    isPlayerOpen,
    selectedResource,
    editingResource,
    handleCreate,
    handleEdit,
    handleDelete,
    handlePreview,
    handleFormClose,
    handlePlayerClose,
  } = useLearningResourceActions({ onRefetch: refetch });

  const { view, viewToggle } = useViewToggle({ defaultView: 'table' });

  const { search } = useSearch({
    searchPlaceholder: t('label.search-entity', {
      entity: t('label.resource'),
    }),
    onSearchChange: setSearchText,
    initialSearchQuery: searchText,
  });
  const { quickFilters, filterSelectionDisplay } = useLearningResourceFilters({
    filterState,
    onFilterChange: setFilterState,
  });

  const getResourceTypeIcon = useCallback((type: string) => {
    const icons: Record<
      string,
      React.ComponentType<React.SVGProps<SVGSVGElement>>
    > = {
      Video: VideoIcon,
      Storylane: StoryLaneIcon,
      Article: ArticleIcon,
    };
    const Icon = icons[type] ?? ArticleIcon;

    return (
      <div className={`type-icon-wrapper ${type.toLowerCase()}-icon`}>
        <Icon height={24} width={24} />
      </div>
    );
  }, []);

  const getCategoryColors = useCallback((category: string) => {
    const info =
      LEARNING_CATEGORIES[category as keyof typeof LEARNING_CATEGORIES];

    return {
      bgColor: info?.bgColor ?? '#f8f9fc',
      borderColor: info?.borderColor ?? '#d5d9eb',
      color: info?.color ?? '#363f72',
    };
  }, []);

  type ColumnConfig = {
    key: string;
    labelKey: string;
    render: (resource: LearningResource) => React.ReactNode;
    cellSx?: SxProps<Theme>;
  };

  const tableColumns: ColumnConfig[] = useMemo(
    () => [
      {
        key: 'displayName',
        labelKey: 'label.content-name',
        cellSx: { maxWidth: 280, overflow: 'hidden' },
        render: (record) => (
          <div
            className="content-name-cell"
            role="button"
            tabIndex={0}
            onClick={() => handlePreview(record)}
            onKeyDown={(e) => e.key === 'Enter' && handlePreview(record)}>
            {getResourceTypeIcon(record.resourceType)}
            <span
              className="content-name"
              title={record.displayName || record.name}>
              {record.displayName || record.name}
            </span>
          </div>
        ),
      },
      {
        key: 'categories',
        labelKey: 'label.category-plural',
        render: (record) => {
          const categories = record.categories;
          if (!categories?.length) {
            return null;
          }
          const visible = categories.slice(0, MAX_VISIBLE_TAGS);
          const remaining = categories.length - MAX_VISIBLE_TAGS;

          return (
            <div className="category-tags">
              {visible.map((cat) => {
                const colors = getCategoryColors(cat);

                return (
                  <Tag
                    className="category-tag"
                    key={cat}
                    style={{
                      backgroundColor: colors.bgColor,
                      borderColor: colors.borderColor,
                      color: colors.color,
                    }}>
                    {LEARNING_CATEGORIES[
                      cat as keyof typeof LEARNING_CATEGORIES
                    ]?.label ?? cat}
                  </Tag>
                );
              })}
              {remaining > 0 && (
                <Tag
                  className="category-tag more-tag"
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePreview(record);
                  }}>
                  +{remaining}
                </Tag>
              )}
            </div>
          );
        },
      },
      {
        key: 'contexts',
        labelKey: 'label.context',
        render: (record) => {
          const contexts = record.contexts;
          if (!contexts?.length) {
            return null;
          }
          const visible = contexts.slice(0, MAX_VISIBLE_CONTEXTS);
          const remaining = contexts.length - MAX_VISIBLE_CONTEXTS;
          const getContextLabel = (pageId: string) =>
            PAGE_IDS.find((c) => c.value === pageId)?.label ?? pageId;

          return (
            <div className="context-tags">
              {visible.map((ctx, idx) => (
                <Tag className="context-tag" key={`${ctx.pageId}-${idx}`}>
                  {getContextLabel(ctx.pageId)}
                </Tag>
              ))}
              {remaining > 0 && (
                <Tag
                  className="context-tag more-tag"
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePreview(record);
                  }}>
                  +{remaining}
                </Tag>
              )}
            </div>
          );
        },
      },
      {
        key: 'updatedAt',
        labelKey: 'label.updated-at',
        render: (record) => (
          <Typography
            component="span"
            sx={{
              color: theme.palette.allShades?.gray?.[600],
              fontSize: 14,
            }}>
            {record.updatedAt
              ? DateTime.fromMillis(record.updatedAt).toFormat('LLL d, yyyy')
              : '-'}
          </Typography>
        ),
      },
      {
        key: 'actions',
        labelKey: 'label.action-plural',
        render: (record) => (
          <Space align="center" size={8}>
            <Tooltip placement="topRight" title={t('label.edit')}>
              <Button
                className="learning-resource-action-btn"
                data-testid={`edit-${record.name}`}
                type="text"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(record);
                }}>
                <IconEdit height={14} name={t('label.edit')} width={14} />
              </Button>
            </Tooltip>
            <Tooltip placement="topRight" title={t('label.delete')}>
              <Button
                className="learning-resource-action-btn"
                data-testid={`delete-${record.name}`}
                type="text"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(record);
                }}>
                <Trash01 size={14} />
              </Button>
            </Tooltip>
          </Space>
        ),
      },
    ],
    [
      t,
      theme,
      getResourceTypeIcon,
      getCategoryColors,
      handlePreview,
      handleEdit,
      handleDelete,
    ]
  );

  const totalFiltered = paging.total;

  const paginationData = useMemo(
    () => ({
      paging: { total: totalFiltered },
      pagingHandler: ({ currentPage: page }: { currentPage: number }) =>
        setCurrentPage(page),
      pageSize,
      currentPage,
      isNumberBased: true,
      isLoading,
      pageSizeOptions: [PAGE_SIZE_BASE, PAGE_SIZE_MEDIUM, PAGE_SIZE_LARGE],
      onShowSizeChange: handlePageSizeChange,
    }),
    [totalFiltered, pageSize, currentPage, isLoading, handlePageSizeChange]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchText, filterState]);

  const breadcrumbs = useMemo(
    () => [
      { name: t('label.setting-plural'), url: getSettingPath() },
      {
        name: t('label.preference-plural'),
        url: getSettingPath(GlobalSettingsMenuCategory.PREFERENCES),
      },
      { name: t('label.learning-resource'), url: '' },
    ],
    [t]
  );

  const tableContainerSx = useMemo(
    () => ({
      mb: 5,
      backgroundColor: 'background.paper',
      borderRadius: 0,
      boxShadow: 1,
    }),
    []
  );

  const headerBoxSx = useMemo(
    () => ({
      display: 'flex',
      flexDirection: 'column' as const,
      gap: 4,
      px: 6,
      py: 4,
      flexShrink: 0,
      borderBottom: '1px solid',
      borderColor: theme.palette.allShades?.gray?.[200],
    }),
    [theme]
  );

  const renderCardView = useCallback(
    () => (
      <>
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            px: 6,
            py: 4,
          }}>
          {isLoading ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                py: 8,
              }}>
              <Loader />
            </Box>
          ) : isEmpty(resources) ? (
            <Box
              sx={{
                textAlign: 'center',
                margin: '16px 24px',
                padding: '9px 0',
              }}>
              {t('server.no-records-found')}
            </Box>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '20px',
              }}>
              {resources.map((resource) => (
                <LearningResourceCard
                  key={resource.id}
                  resource={resource}
                  onClick={handlePreview}
                />
              ))}
            </Box>
          )}
        </Box>
        <Box className="learning-resources-pagination">
          <NextPrevious {...paginationData} />
        </Box>
      </>
    ),
    [isLoading, resources, handlePreview, paginationData, t]
  );

  const renderTableView = useCallback(
    () => (
      <>
        <TableContainer
          className="learning-resources-table-scroll"
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            borderRadius: 0,
          }}>
          <Table
            stickyHeader
            className="learning-resources-table"
            size="medium">
            <TableHead>
              <TableRow>
                {tableColumns.map((col) => (
                  <TableCell key={col.key} sx={col.cellSx}>
                    {t(col.labelKey)}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody data-testid="learning-resources-table-body">
              {isLoading ? (
                <TableRow>
                  <TableCell
                    align="center"
                    colSpan={tableColumns.length}
                    sx={{ py: 8 }}>
                    <Loader />
                  </TableCell>
                </TableRow>
              ) : isEmpty(resources) ? (
                <TableRow>
                  <TableCell
                    align="center"
                    colSpan={tableColumns.length}
                    sx={{ py: 4 }}>
                    {t('server.no-records-found')}
                  </TableCell>
                </TableRow>
              ) : (
                resources.map((resource) => (
                  <TableRow
                    hover
                    key={resource.id}
                    sx={{ cursor: 'pointer' }}
                    onClick={() => handlePreview(resource)}>
                    {tableColumns.map((col) => (
                      <TableCell
                        key={col.key}
                        sx={col.cellSx}
                        onClick={
                          col.key === 'actions'
                            ? (e) => e.stopPropagation()
                            : undefined
                        }>
                        {col.render(resource)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <Box className="learning-resources-pagination">
          <NextPrevious {...paginationData} />
        </Box>
      </>
    ),
    [tableColumns, resources, isLoading, paginationData, t, handlePreview]
  );

  return (
    <PageLayoutV1
      mainContainerClassName="learning-resources-page-layout"
      pageContainerStyle={{
        height: 'calc(100vh - var(--ant-navbar-height, 64px))',
        overflow: 'hidden',
      }}
      pageTitle={t('label.learning-resource')}>
      <div
        className="learning-resources-page"
        data-testid="learning-resources-page">
        <TitleBreadcrumb titleLinks={breadcrumbs} />

        <div className="page-header">
          <div className="page-header-title">
            <h4 className="page-title" data-testid="page-title">
              {t('label.learning-resource')}
            </h4>
            <p className="page-description">
              {t('message.learning-resources-management-description')}
            </p>
          </div>
          <Button
            data-testid="create-resource"
            icon={<PlusOutlined />}
            type="primary"
            onClick={handleCreate}>
            {t('label.add-entity', { entity: t('label.resource') })}
          </Button>
        </div>

        <TableContainer
          className="learning-resources-table-container"
          component={Paper}
          elevation={0}
          sx={tableContainerSx}>
          <Box sx={headerBoxSx}>
            <Box
              sx={{
                display: 'flex',
                gap: 5,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}>
              {search}
              {quickFilters}
              <Box ml="auto" />
              {viewToggle}
            </Box>
            {filterSelectionDisplay}
          </Box>
          {view === 'table' ? (
            <Box
              data-testid="table-view-container"
              sx={{
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}>
              {renderTableView()}
            </Box>
          ) : (
            <Box
              data-testid="card-view-container"
              sx={{
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}>
              {renderCardView()}
            </Box>
          )}
        </TableContainer>

        {isFormOpen && (
          <LearningResourceForm
            open={isFormOpen}
            resource={editingResource}
            onClose={handleFormClose}
          />
        )}

        {selectedResource && (
          <ResourcePlayerModal
            open={isPlayerOpen}
            resource={selectedResource}
            onClose={handlePlayerClose}
          />
        )}
      </div>
    </PageLayoutV1>
  );
};
