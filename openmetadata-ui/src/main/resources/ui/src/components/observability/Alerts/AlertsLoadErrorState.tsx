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

import { Box, EmptyPlaceholder } from '@openmetadata/ui-core-components';
import { AlertTriangle, Lock01 } from '@openmetadata/ui-core-components/icons';
import { AxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { ClientErrors } from '../../../enums/Axios.enum';

interface AlertsLoadErrorStateProps {
  error?: AxiosError;
  onRetry?: () => void;
}

/**
 * A failed alerts load must not read as "no alerts yet": a 403 explains the
 * missing access (retrying won't help), anything else offers a retry.
 */
function AlertsLoadErrorState({
  error,
  onRetry,
}: Readonly<AlertsLoadErrorStateProps>) {
  const { t } = useTranslation();
  const isForbidden = error?.response?.status === ClientErrors.FORBIDDEN;

  return (
    <Box
      className="tw:relative tw:min-h-[calc(100vh_-_16rem)] tw:w-full"
      data-testid={
        isForbidden ? 'alerts-permission-error' : 'alerts-load-error'
      }>
      {isForbidden ? (
        <EmptyPlaceholder
          description={t('message.no-permission-to-view')}
          icon={<Lock01 className="tw:text-fg-quaternary" />}
          title={t('label.access-denied')}
        />
      ) : (
        <EmptyPlaceholder
          actions={
            onRetry
              ? [
                  {
                    key: 'retry',
                    label: t('label.try-again'),
                    color: 'primary' as const,
                    onPress: onRetry,
                  },
                ]
              : undefined
          }
          description={t('server.unexpected-error')}
          icon={<AlertTriangle className="tw:text-fg-error-primary" />}
          title={t('message.something-went-wrong')}
        />
      )}
    </Box>
  );
}

export default AlertsLoadErrorState;
