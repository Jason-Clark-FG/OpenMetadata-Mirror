/*
 *  Copyright 2025 Collate.
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

import {
  Button as CoreButton,
  ButtonUtility,
  Card,
  Typography,
} from '@openmetadata/ui-core-components';
import { XClose } from '@untitledui/icons';
import { Modal, Progress } from 'antd';
import { AxiosError } from 'axios';
import dayjs from 'dayjs';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactComponent as ExportIcon } from '../../assets/svg/ic-download.svg';
import { AuditLogFilters, AuditLogList } from '../../components/AuditLog';
import '../../components/common/atoms/filters/FilterSelection.less';
import { useBreadcrumbs } from '../../components/common/atoms/navigation/useBreadcrumbs';
import { useSearch } from '../../components/common/atoms/navigation/useSearch';
import Banner from '../../components/common/Banner/Banner';
import DatePicker from '../../components/common/DatePicker/DatePicker';
import NextPrevious from '../../components/common/NextPrevious/NextPrevious';
import { PagingHandlerParams } from '../../components/common/NextPrevious/NextPrevious.interface';
import { CSVExportWebsocketResponse } from '../../components/Entity/EntityExportModalProvider/EntityExportModalProvider.interface';
import PageHeader from '../../components/PageHeader/PageHeader.component';
import PageLayoutV1 from '../../components/PageLayoutV1/PageLayoutV1';
import {
  PAGE_SIZE_BASE,
  PAGE_SIZE_LARGE,
  PAGE_SIZE_MEDIUM,
  SOCKET_EVENTS,
} from '../../constants/constants';
import { GlobalSettingsMenuCategory } from '../../constants/GlobalSettings.constants';
import { PAGE_HEADERS } from '../../constants/PageHeaders.constant';
import { useWebSocketConnector } from '../../context/WebSocketProvider/WebSocketProvider';
import { CursorType } from '../../enums/pagination.enum';
import { Paging } from '../../generated/type/paging';
import { exportAuditLogs, getAuditLogs } from '../../rest/auditLogAPI';
import {
  AuditLogActiveFilter,
  AuditLogEntry,
  AuditLogListParams,
  AuditLogListResponse,
} from '../../types/auditLogs.interface';
import { buildParamsFromFilters } from '../../utils/AuditLogUtils';
import { getSettingPath } from '../../utils/RouterUtils';
import { showErrorToast, showSuccessToast } from '../../utils/ToastUtils';
import './AuditLogsPage.less';

const INITIAL_PAGING: Paging = {
  total: 0,
};

interface ExportJob {
  jobId: string;
  message?: string;
  error?: string;
  status?: string;
  progress?: number;
  total?: number;
}

const AuditLogsPage = () => {
  const { t } = useTranslation();
  const { socket } = useWebSocketConnector();

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [paging, setPaging] = useState<Paging>(INITIAL_PAGING);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const searchTermRef = useRef('');
  const [activeFilters, setActiveFilters] = useState<AuditLogActiveFilter[]>(
    []
  );
  const [filterParams, setFilterParams] = useState<Partial<AuditLogListParams>>(
    {}
  );
  const filterParamsRef = useRef<Partial<AuditLogListParams>>({});
  const [pageSize, setPageSize] = useState(PAGE_SIZE_MEDIUM);

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportDateRange, setExportDateRange] = useState<
    [DateTime, DateTime] | null
  >(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const exportJobRef = useRef<ExportJob | null>(null);

  const fetchAuditLogs = useCallback(
    async (
      cursorParams?: { after?: string; before?: string },
      explicitFilterParams?: Partial<AuditLogListParams>
    ) => {
      setIsLoading(true);
      try {
        const queryParams: AuditLogListParams = {
          limit: pageSize,
          after: cursorParams?.after,
          before: cursorParams?.before,
          q: searchTermRef.current || undefined,
          ...(explicitFilterParams ?? filterParamsRef.current),
        };

        const response: AuditLogListResponse = await getAuditLogs(queryParams);
        setLogs(response.data);
        setPaging(response.paging ?? INITIAL_PAGING);
      } catch (error) {
        showErrorToast(error as AxiosError);
      } finally {
        setIsLoading(false);
      }
    },
    [pageSize]
  );

  useEffect(() => {
    setCurrentPage(1);
    fetchAuditLogs({ after: undefined, before: undefined });
  }, [fetchAuditLogs]);

  const handlePaging = useCallback(
    ({ cursorType, currentPage: requestedPage }: PagingHandlerParams) => {
      if (cursorType === CursorType.AFTER && paging?.after) {
        setCurrentPage(requestedPage);
        fetchAuditLogs({ after: paging.after });
      }

      if (cursorType === CursorType.BEFORE && paging?.before) {
        setCurrentPage(requestedPage);
        fetchAuditLogs({ before: paging.before });
      }
    },
    [fetchAuditLogs, paging]
  );

  const handlePageSizeChange = useCallback((size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  }, []);

  const handleFiltersChange = useCallback(
    (filters: AuditLogActiveFilter[], params: Partial<AuditLogListParams>) => {
      setActiveFilters(filters);
      setFilterParams(params);
      filterParamsRef.current = params;
      setCurrentPage(1);
      fetchAuditLogs({ after: undefined, before: undefined }, params);
    },
    [fetchAuditLogs]
  );

  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchTerm(query);
      searchTermRef.current = query;
      setCurrentPage(1);
      fetchAuditLogs({ after: undefined, before: undefined });
    },
    [fetchAuditLogs]
  );

  const { search: searchComponent, clearSearch } = useSearch({
    searchPlaceholder: t('label.search-audit-logs'),
    onSearchChange: handleSearchChange,
    testId: 'audit-log-search',
  });

  const handleClearFilters = useCallback(() => {
    setActiveFilters([]);
    setFilterParams({});
    filterParamsRef.current = {};
    setSearchTerm('');
    searchTermRef.current = '';
    setCurrentPage(1);
    clearSearch();
    fetchAuditLogs({ after: undefined, before: undefined }, {});
  }, [fetchAuditLogs, clearSearch]);

  const handleRemoveFilter = useCallback(
    (category: string) => {
      const remaining = activeFilters.filter((f) => f.category !== category);
      const params = buildParamsFromFilters(remaining);
      setActiveFilters(remaining);
      setFilterParams(params);
      filterParamsRef.current = params;
      setCurrentPage(1);
      fetchAuditLogs({ after: undefined, before: undefined }, params);
    },
    [activeFilters, fetchAuditLogs]
  );

  const handleExportDownload = useCallback((data: string) => {
    const element = document.createElement('a');
    const file = new Blob([data], { type: 'application/json' });

    const now = dayjs();
    const fileName = `audit_logs_${now.format('YYYYMMDD_HHmmss')}.json`;

    element.href = URL.createObjectURL(file);
    element.download = fileName;
    document.body.appendChild(element);
    element.click();

    URL.revokeObjectURL(element.href);
    document.body.removeChild(element);
  }, []);

  const handleExportWebSocketMessage = useCallback(
    (response: CSVExportWebsocketResponse) => {
      if (!exportJobRef.current) {
        return;
      }

      const updatedJob: ExportJob = {
        ...exportJobRef.current,
        status: response.status,
        error: response.error ?? undefined,
        message: response.message,
        progress: response.progress,
        total: response.total,
      };

      setExportJob(updatedJob);
      exportJobRef.current = updatedJob;

      if (response.status === 'COMPLETED' && response.data) {
        handleExportDownload(response.data);
        showSuccessToast(t('message.export-successful'));
        setIsExporting(false);
        setIsExportModalOpen(false);
        setExportJob(null);
        exportJobRef.current = null;
      } else if (response.status === 'FAILED') {
        setIsExporting(false);
      }
    },
    [handleExportDownload, t]
  );

  useEffect(() => {
    if (socket) {
      const handleExport = (exportResponse: string) => {
        if (exportResponse) {
          const exportResponseData = JSON.parse(
            exportResponse
          ) as CSVExportWebsocketResponse;

          handleExportWebSocketMessage(exportResponseData);
        }
      };

      socket.on(SOCKET_EVENTS.CSV_EXPORT_CHANNEL, handleExport);

      return () => {
        socket.off(SOCKET_EVENTS.CSV_EXPORT_CHANNEL, handleExport);
      };
    }

    return undefined;
  }, [socket, handleExportWebSocketMessage]);

  const handleExport = useCallback(async () => {
    if (!exportDateRange) {
      return;
    }

    setIsExporting(true);
    try {
      const response = await exportAuditLogs({
        startTs: exportDateRange[0].startOf('day').valueOf(),
        endTs: exportDateRange[1].endOf('day').valueOf(),
        q: searchTerm || undefined,
        ...filterParams,
      });

      const job: ExportJob = {
        jobId: response.jobId,
        message: response.message,
      };

      setExportJob(job);
      exportJobRef.current = job;
    } catch (error) {
      showErrorToast(error as AxiosError);
      setIsExporting(false);
    }
  }, [exportDateRange, searchTerm, filterParams]);

  const { breadcrumbs } = useBreadcrumbs({
    home: { show: false },
    items: [
      { name: t('label.setting-plural'), url: getSettingPath() },
      {
        name: t('label.access-control'),
        url: getSettingPath(GlobalSettingsMenuCategory.ACCESS),
      },
      { name: t('label.audit-log-plural'), isActive: true },
    ],
  });

  const handleExportModalClose = useCallback(() => {
    if (!isExporting) {
      setIsExportModalOpen(false);
      setExportDateRange(null);
      setExportJob(null);
      exportJobRef.current = null;
    }
  }, [isExporting]);

  const hasActiveFilters =
    activeFilters.length > 0 || Boolean(searchTerm.trim());

  return (
    <PageLayoutV1
      fullHeight
      mainContainerClassName="audit-logs-page-layout"
      pageTitle={t('label.audit-log-plural')}>
      <div
        className="tw:flex tw:flex-col tw:h-full tw:min-h-0 tw:overflow-hidden"
        data-testid="audit-logs-page">
        <div className="tw:shrink-0 tw:mb-3">{breadcrumbs}</div>
        {/* Header */}
        <Card
          className="tw:flex tw:justify-between tw:items-center tw:mt-2 tw:mb-4 tw:px-6 tw:py-4"
          data-testid="audit-logs-page-header">
          <PageHeader
            data={{
              header: t(PAGE_HEADERS.AUDIT_LOGS.header),
              subHeader: t(PAGE_HEADERS.AUDIT_LOGS.subHeader),
            }}
            title={t(PAGE_HEADERS.AUDIT_LOGS.header)}
          />
          <CoreButton
            color="primary"
            data-testid="export-audit-logs-button"
            iconLeading={<ExportIcon height={16} width={16} />}
            onClick={() => setIsExportModalOpen(true)}>
            {t('label.export')}
          </CoreButton>
        </Card>

        {/* Content Paper */}
        <Card className="tw:flex-1 tw:min-h-0 tw:flex tw:flex-col tw:overflow-hidden">
          {/* Filters */}
          <div className="tw:shrink-0 tw:p-3">
            <div className="tw:flex tw:items-center tw:gap-4">
              <div
                className="tw:shrink-0"
                data-testid="audit-log-search-container">
                {searchComponent}
              </div>
              <AuditLogFilters
                activeFilters={activeFilters}
                onFiltersChange={handleFiltersChange}
              />
              <div className="tw:grow" />
            </div>
            {hasActiveFilters && (
              <div
                className="filter-selection-container tw:mt-2 tw:pr-3.5"
                data-testid="filter-selection-container">
                <div className="filter-selection-chips-wrapper">
                  {activeFilters.map((filter) => (
                    <div
                      className="filter-selection-chip"
                      data-testid={`filter-chip-${filter.category}`}
                      key={filter.category}>
                      <span className="filter-selection-chip-content">
                        <span className="filter-selection-label">
                          {filter.categoryLabel}:{' '}
                        </span>
                        <span
                          className="filter-selection-value"
                          title={filter.value.label}>
                          {filter.category === 'time' &&
                          filter.value.key === 'customRange'
                            ? t('label.custom-range')
                            : filter.value.label}
                        </span>
                      </span>
                      <ButtonUtility
                        aria-label="Remove filter"
                        className="filter-selection-remove-btn"
                        color="tertiary"
                        data-testid={`remove-filter-${filter.category}`}
                        icon={<XClose size={14} />}
                        onClick={() => handleRemoveFilter(filter.category)}
                      />
                    </div>
                  ))}
                </div>
                <CoreButton
                  className="filter-selection-clear-all"
                  color="link-gray"
                  data-testid="clear-filters"
                  onPress={handleClearFilters}>
                  {t('label.clear-entity', {
                    entity: t('label.all-lowercase'),
                  })}
                </CoreButton>
              </div>
            )}
          </div>

          {/* List */}
          <div className="tw:flex-1 tw:min-h-0 tw:overflow-auto">
            <AuditLogList isLoading={isLoading} logs={logs} />
          </div>

          {/* Pagination */}
          {logs.length > 0 && (
            <div
              className="tw:shrink-0 tw:p-2 tw:flex tw:justify-center"
              style={{
                boxShadow:
                  '0 -13px 16px -4px rgba(10, 13, 18, 0.04), 0 -4px 6px -2px rgba(10, 13, 18, 0.03)',
              }}>
              <NextPrevious
                currentPage={currentPage}
                isLoading={isLoading}
                pageSize={pageSize}
                pageSizeOptions={[
                  PAGE_SIZE_BASE,
                  PAGE_SIZE_MEDIUM,
                  PAGE_SIZE_LARGE,
                ]}
                paging={paging}
                pagingHandler={handlePaging}
                onShowSizeChange={handlePageSizeChange}
              />
            </div>
          )}
        </Card>
      </div>

      <Modal
        centered
        cancelButtonProps={{ disabled: isExporting }}
        cancelText={t('label.cancel')}
        closable={!isExporting}
        data-testid="export-audit-logs-modal"
        maskClosable={!isExporting}
        okButtonProps={{
          disabled: isExporting || !exportDateRange,
          loading: isExporting,
        }}
        okText={t('label.export')}
        open={isExportModalOpen}
        title={t('label.export-entity', {
          entity: t('label.audit-log-plural'),
        })}
        onCancel={handleExportModalClose}
        onOk={handleExport}>
        <div className="tw:w-full tw:flex tw:flex-col tw:gap-4">
          <Typography as="p" className="tw:text-md">
            {t('message.export-audit-logs-description')}
          </Typography>
          <div>
            <Typography as="p" className="tw:mb-2! tw:text-gray-400 tw:text-md">
              {t('label.date-range')} <span className="tw:text-red-600">*</span>
            </Typography>
            <DatePicker.RangePicker
              allowClear
              className="w-full"
              data-testid="export-date-range-picker"
              disabled={isExporting}
              disabledDate={(current) => current > DateTime.now().endOf('day')}
              value={exportDateRange}
              onChange={(dates) => {
                if (dates?.[0] && dates?.[1]) {
                  setExportDateRange([dates[0], dates[1]]);
                } else {
                  setExportDateRange(null);
                }
              }}
            />
          </div>
          {exportJob?.status === 'IN_PROGRESS' && (
            <div className="export-progress-container">
              <Progress
                percent={
                  exportJob.total && exportJob.total > 0
                    ? Math.round(
                        ((exportJob.progress ?? 0) / exportJob.total) * 100
                      )
                    : 0
                }
                size="small"
                status="active"
              />
              <Typography as="p" className="tw:mt-2! tw:text-md">
                {exportJob.message ?? t('message.exporting')}
              </Typography>
            </div>
          )}
          {exportJob && exportJob.status !== 'IN_PROGRESS' && (
            <Banner
              className="border-radius"
              isLoading={isExporting && !exportJob.error}
              message={exportJob.error ?? exportJob.message ?? ''}
              type={exportJob.error ? 'error' : 'success'}
            />
          )}
        </div>
      </Modal>
    </PageLayoutV1>
  );
};

export default AuditLogsPage;
