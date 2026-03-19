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
import { DownloadOutlined } from '@ant-design/icons';
import { LazyLog } from '@melloware/react-logviewer';
import { Badge, Button, Col, Empty, Row, Select, Space } from 'antd';
import { AxiosError } from 'axios';
import { isNil } from 'lodash';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppRunRecord,
  Status,
} from '../../../../generated/entity/applications/appRunRecord';
import {
  downloadAppRunTextLogs,
  getApplicationRuns,
  getAppRunTextLogs,
} from '../../../../rest/applicationAPI';
import { formatDateTimeWithTimezone } from '../../../../utils/date-time/DateTimeUtils';
import { showErrorToast } from '../../../../utils/ToastUtils';
import CopyToClipboardButton from '../../../common/CopyToClipboardButton/CopyToClipboardButton';
import Loader from '../../../common/Loader/Loader';
import { AppRunTextLogsProps } from './AppRunTextLogs.interface';

const POLL_INTERVAL_MS = 5000;

const AppRunTextLogs = ({ appData }: AppRunTextLogsProps) => {
  const { t } = useTranslation();

  const [runs, setRuns] = useState<AppRunRecord[]>([]);
  const [selectedRunTimestamp, setSelectedRunTimestamp] = useState<number>();
  const [servers, setServers] = useState<string[]>([]);
  const [selectedServer, setSelectedServer] = useState<string>();
  const [logText, setLogText] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLogLoading, setIsLogLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const prevLogLengthRef = useRef(0);

  const appName = useMemo(
    () => appData.fullyQualifiedName ?? appData.name,
    [appData]
  );

  const isRunActive = useMemo(() => {
    if (!selectedRunTimestamp || runs.length === 0) {
      return false;
    }
    const run = runs.find((r) => r.timestamp === selectedRunTimestamp);

    return run?.status === Status.Running || run?.status === Status.Started;
  }, [selectedRunTimestamp, runs]);

  const fetchRuns = useCallback(async () => {
    try {
      const response = await getApplicationRuns(appName, {
        limit: 10,
        offset: 0,
      });
      const runData = response.data ?? [];
      setRuns(runData);
      if (runData.length > 0 && !selectedRunTimestamp) {
        setSelectedRunTimestamp(runData[0].timestamp);
      } else {
        setRuns(runData);
      }
    } catch (error) {
      showErrorToast(error as AxiosError);
    } finally {
      setIsLoading(false);
    }
  }, [appName, selectedRunTimestamp]);

  const fetchLogs = useCallback(
    async (silent = false) => {
      if (!selectedRunTimestamp) {
        return;
      }
      if (!silent) {
        setIsLogLoading(true);
      }
      try {
        const response = await getAppRunTextLogs(
          appName,
          selectedRunTimestamp,
          selectedServer
        );
        setLogText(response.logs);
        setServers(response.servers);
        if (!selectedServer && response.servers.length > 0) {
          setSelectedServer(response.servers[0]);
        }
      } catch (error) {
        if (!silent) {
          showErrorToast(error as AxiosError);
        }
      } finally {
        if (!silent) {
          setIsLogLoading(false);
        }
      }
    },
    [appName, selectedRunTimestamp, selectedServer]
  );

  const scrollToBottom = useCallback(() => {
    const logsBody = document.getElementsByClassName(
      'ReactVirtualized__Grid'
    )[0];
    if (!isNil(logsBody)) {
      logsBody.scrollTop = logsBody.scrollHeight;
    }
  }, []);

  const handleRunChange = useCallback((value: number) => {
    setSelectedRunTimestamp(value);
    setSelectedServer(undefined);
    setLogText('');
    setAutoScroll(true);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!selectedRunTimestamp) {
      return;
    }
    setIsDownloading(true);
    try {
      const blob = await downloadAppRunTextLogs(
        appName,
        selectedRunTimestamp,
        selectedServer
      );
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${appData.name}-${selectedRunTimestamp}${
        selectedServer ? `-${selectedServer}` : ''
      }.log`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      showErrorToast(error as AxiosError);
    } finally {
      setIsDownloading(false);
    }
  }, [appName, appData.name, selectedRunTimestamp, selectedServer]);

  // Initial load
  useEffect(() => {
    fetchRuns();
  }, [appName]);

  // Fetch logs when run/server selection changes
  useEffect(() => {
    fetchLogs();
  }, [selectedRunTimestamp, selectedServer]);

  // Poll for new logs + updated run status while the run is active
  useEffect(() => {
    if (!isRunActive) {
      return;
    }

    const interval = setInterval(() => {
      fetchLogs(true);
      fetchRuns();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isRunActive, fetchLogs, fetchRuns]);

  // Auto-scroll to bottom when new log content arrives during an active run
  useEffect(() => {
    if (
      autoScroll &&
      isRunActive &&
      logText.length > prevLogLengthRef.current
    ) {
      setTimeout(scrollToBottom, 100);
    }
    prevLogLengthRef.current = logText.length;
  }, [logText, isRunActive, autoScroll, scrollToBottom]);

  if (isLoading) {
    return <Loader />;
  }

  if (runs.length === 0) {
    return <Empty description={t('message.no-data-available')} />;
  }

  return (
    <div data-testid="app-run-text-logs">
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Space wrap size="middle">
            <Select
              className="w-60"
              data-testid="run-selector"
              value={selectedRunTimestamp}
              onChange={handleRunChange}>
              {runs.map((run) => (
                <Select.Option key={run.timestamp} value={run.timestamp}>
                  {formatDateTimeWithTimezone(run.timestamp as number)} (
                  {run.status})
                </Select.Option>
              ))}
            </Select>

            {servers.length > 1 && (
              <Select
                className="w-48"
                data-testid="server-selector"
                value={selectedServer}
                onChange={setSelectedServer}>
                {servers.map((server) => (
                  <Select.Option key={server} value={server}>
                    {server}
                  </Select.Option>
                ))}
              </Select>
            )}

            {isRunActive && <Badge color="green" text={t('label.live')} />}

            <Space size="small">
              {isRunActive && (
                <Button
                  data-testid="auto-scroll-button"
                  ghost={!autoScroll}
                  type="primary"
                  onClick={() => {
                    setAutoScroll((prev) => !prev);
                    if (!autoScroll) {
                      scrollToBottom();
                    }
                  }}>
                  {autoScroll ? t('label.following') : t('label.jump-to-end')}
                </Button>
              )}
              {!isRunActive && (
                <Button
                  ghost
                  data-testid="jump-to-end-button"
                  type="primary"
                  onClick={scrollToBottom}>
                  {t('label.jump-to-end')}
                </Button>
              )}
              {logText && <CopyToClipboardButton copyText={logText} />}
              <Button
                data-testid="download-logs-button"
                disabled={!logText}
                icon={<DownloadOutlined />}
                loading={isDownloading}
                type="default"
                onClick={handleDownload}>
                {t('label.download')}
              </Button>
            </Space>
          </Space>
        </Col>

        <Col span={24}>
          {isLogLoading ? (
            <Loader />
          ) : logText ? (
            <div
              className="h-min-400 lazy-log-container"
              data-testid="lazy-log">
              <LazyLog
                caseInsensitive
                enableSearch
                selectableLines
                extraLines={1}
                text={logText}
              />
            </div>
          ) : (
            <Empty description={t('message.no-data-available')} />
          )}
        </Col>
      </Row>
    </div>
  );
};

export default AppRunTextLogs;
