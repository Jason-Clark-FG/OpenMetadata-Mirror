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
import {
  Bell01,
  MarkerPin01,
  Plus,
  ZapFast,
} from '@openmetadata/ui-core-components/icons';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface AlertsEmptyStateProps {
  hasCreatePermission: boolean;
  onAddAlert: () => void;
}

function AlertsEmptyState({
  hasCreatePermission,
  onAddAlert,
}: Readonly<AlertsEmptyStateProps>) {
  const { t } = useTranslation();

  const features = useMemo(
    () => [
      {
        key: 'trigger',
        icon: <ZapFast className="tw:text-fg-brand-primary" />,
        title: t('label.pick-a-trigger'),
        description: t('message.alert-pick-a-trigger-description'),
      },
      {
        key: 'destination',
        icon: <MarkerPin01 className="tw:text-fg-warning-primary" />,
        title: t('label.choose-the-destination'),
        description: t('message.alert-choose-destination-description'),
      },
      {
        key: 'stay-ahead',
        icon: <Bell01 className="tw:text-fg-success-primary" />,
        title: t('label.stay-ahead'),
        description: t('message.alert-stay-ahead-description'),
      },
    ],
    [t]
  );

  return (
    <Box className="tw:relative tw:min-h-[calc(100vh_-_16rem)] tw:w-full">
      <EmptyPlaceholder
        actions={
          hasCreatePermission
            ? [
                {
                  key: 'new-alert',
                  label: t('label.new-entity', {
                    entity: t('label.alert'),
                  }),
                  color: 'primary' as const,
                  iconLeading: Plus,
                  onPress: onAddAlert,
                },
              ]
            : undefined
        }
        description={t('message.observability-alert-empty-description')}
        features={features}
        title={t('message.observability-alert-empty-heading')}
        variant="features"
      />
    </Box>
  );
}

export default AlertsEmptyState;
