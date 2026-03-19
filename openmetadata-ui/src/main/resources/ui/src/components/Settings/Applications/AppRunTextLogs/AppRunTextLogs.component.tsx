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
import { Badge, Button, Col, Empty, Row, Select, Space } from 'antd';
import { AxiosError } from 'axios';
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
import APIClient from '../../../../rest/index';
import { formatDateTimeWithTimezone } from '../../../../utils/date-time/DateTimeUtils';
import { getEncodedFqn } from '../../../../utils/StringsUtils';
import { getOidcToken } from '../../../../utils/SwTokenStorageUtils';
import { showErrorToast } from '../../../../utils/ToastUtils';
import CopyToClipboardButton from '../../../common/CopyToClipboardButton/CopyToClipboardButton';
import Loader from '../../../common/Loader/Loader';
import { AppRunTextLogsProps } from './AppRunTextLogs.interface';

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
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const logContainerRef = useRef<HTMLPreElement>(null);

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
      }
    } catch (error) {
      showErrorToast(error as AxiosError);
    } finally {
      setIsLoading(false);
    }
  }, [appName, selectedRunTimestamp]);

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const startStream = useCallback(
    async (runTs: number, server?: string) => {
      stopStream();

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsStreaming(true);
      setLogText('');

      const params = new URLSearchParams();
      if (server) {
        params.set('serverId', server);
      }

      const baseUrl = APIClient.defaults.baseURL ?? '';
      const url = `${baseUrl}/apps/name/${getEncodedFqn(
        appName
      )}/runs/${runTs}/logs/stream?${params.toString()}`;

      try {
        const token = await getOidcToken();

        const response = await fetch(url, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Stream failed: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          const newLogLines: string[] = [];
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              newLogLines.push(line.slice(6));
            } else if (line.startsWith('event: done')) {
              setIsStreaming(false);
            }
          }

          if (newLogLines.length > 0) {
            setLogText((prev) => {
              if (prev) {
                return prev + '\n' + newLogLines.join('\n');
              }

              return newLogLines.join('\n');
            });
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          showErrorToast(error as AxiosError);
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [appName, stopStream]
  );

  const fetchLogsOnce = useCallback(async () => {
    if (!selectedRunTimestamp) {
      return;
    }
    setIsLogLoading(true);
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
      showErrorToast(error as AxiosError);
    } finally {
      setIsLogLoading(false);
    }
  }, [appName, selectedRunTimestamp, selectedServer]);

  const handleJumpToEnd = useCallback(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, []);

  const handleRunChange = useCallback(
    (value: number) => {
      stopStream();
      setSelectedRunTimestamp(value);
      setSelectedServer(undefined);
      setLogText('');
    },
    [stopStream]
  );

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

  // When run/server changes: use SSE stream for active runs, one-shot fetch for completed
  useEffect(() => {
    if (!selectedRunTimestamp) {
      return;
    }

    if (isRunActive) {
      startStream(selectedRunTimestamp, selectedServer);
    } else {
      fetchLogsOnce();
    }

    return () => stopStream();
  }, [selectedRunTimestamp, selectedServer, isRunActive]);

  // Also re-fetch run statuses periodically while streaming
  useEffect(() => {
    if (!isStreaming) {
      return;
    }

    const interval = setInterval(() => {
      fetchRuns();
    }, 10000);

    return () => clearInterval(interval);
  }, [isStreaming, fetchRuns]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

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

            {isStreaming && <Badge color="green" text={t('label.live')} />}

            <Space size="small">
              <Button
                ghost
                data-testid="jump-to-end-button"
                type="primary"
                onClick={handleJumpToEnd}>
                {t('label.jump-to-end')}
              </Button>
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
            <pre
              data-testid="lazy-log"
              ref={logContainerRef}
              style={{
                height: '60vh',
                overflow: 'auto',
                margin: 0,
                padding: '12px',
                backgroundColor: '#222',
                color: '#fff',
                fontSize: '12px',
                fontFamily: '"Monaco", "Menlo", "Consolas", monospace',
                lineHeight: 1.6,
                borderRadius: '4px',
                whiteSpace: 'pre',
                tabSize: 4,
              }}>
              {logText}
            </pre>
          ) : (
            <Empty description={t('message.no-data-available')} />
          )}
        </Col>
      </Row>
    </div>
  );
};

export default AppRunTextLogs;
