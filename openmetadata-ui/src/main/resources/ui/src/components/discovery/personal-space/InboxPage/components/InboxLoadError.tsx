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

import { EmptyPlaceholder } from '@openmetadata/ui-core-components';
import { AlertCircle, Lock01 } from '@openmetadata/ui-core-components/icons';
import { AxiosError } from 'axios';
import { useTranslation } from 'react-i18next';

export interface InboxLoadErrorProps {
  error: unknown;
  // The plural noun that failed to load, e.g. t('label.task-plural').
  entity: string;
  onRetry?: () => void;
  'data-testid'?: string;
}

export const isForbiddenError = (error: unknown) =>
  (error as AxiosError | undefined)?.response?.status === 403;

/**
 * Stands in for a list or panel whose fetch failed, so a failure never reads
 * as an empty queue. A 403 will not change on retry, so it offers none.
 */
const InboxLoadError = ({
  error,
  entity,
  onRetry,
  'data-testid': testId = 'inbox-load-error',
}: InboxLoadErrorProps) => {
  const { t } = useTranslation();

  if (isForbiddenError(error)) {
    return (
      <EmptyPlaceholder
        data-testid={`${testId}-forbidden`}
        description={t('message.no-permission-to-view')}
        icon={<Lock01 className="tw:size-7 tw:text-fg-quaternary" />}
        title={t('label.access-denied')}
        variant="blank"
      />
    );
  }

  return (
    <EmptyPlaceholder
      actions={
        onRetry
          ? [{ key: 'retry', label: t('label.retry'), onPress: onRetry }]
          : undefined
      }
      data-testid={testId}
      description={t('server.entity-fetch-error', { entity })}
      icon={<AlertCircle className="tw:size-7 tw:text-fg-error-secondary" />}
      title={t('message.something-went-wrong')}
      variant="blank"
    />
  );
};

export default InboxLoadError;
