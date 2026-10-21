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

import { Box, Card, Typography } from '@openmetadata/ui-core-components';
import classNames from 'classnames';
import { isEmpty } from 'lodash';
import { useTranslation } from 'react-i18next';
import NoDataPlaceholder from '../../components/common/EmptyPlaceholder/NoDataPlaceholder';
import PermissionPlaceholder from '../../components/common/EmptyPlaceholder/PermissionPlaceholder';
import SomethingWentWrongPlaceholder from '../../components/common/EmptyPlaceholder/SomethingWentWrongPlaceholder';
import ErrorPlaceHolder from '../../components/common/ErrorWithPlaceholder/ErrorPlaceHolder';
import Loader from '../../components/common/Loader/Loader';
import ResizablePanels from '../../components/common/ResizablePanels/ResizablePanels';
import TitleBreadcrumb from '../../components/common/TitleBreadcrumb/TitleBreadcrumb.component';
import { usePermissionProvider } from '../../context/PermissionProvider/PermissionProvider';
import { ClientErrors } from '../../enums/Axios.enum';
import { ERROR_PLACEHOLDER_TYPE } from '../../enums/common.enum';
import { ResourceEntity } from '../../enums/permissions.enum';
import { ProviderType } from '../../generated/entity/events/notificationTemplate';
import { Operation } from '../../generated/entity/policies/policy';
import { AlertType } from '../../generated/events/eventSubscription';
import { withPageLayout } from '../../hoc/withPageLayout';
import { useIsAiMode } from '../../hooks/useAppMode';
import { useEntityPermissions } from '../../hooks/useEntityPermissions/useEntityPermissions';
import { useFqn } from '../../hooks/useFqn';
import { checkPermission } from '../../utils/PermissionsUtils';
import { AddObservabilityPageProps } from './AddObservabilityPage.interface';
import ObservabilityAlertForm from './components/ObservabilityAlertForm';
import { useObservabilityAlertForm } from './hooks/useObservabilityAlertForm';

// Create gates the add form, EditAll on the alert gates the edit form.
const useAlertFormAccess = (isEditMode: boolean) => {
  const { fqn } = useFqn();
  const { permissions } = usePermissionProvider();
  const { canEditAll, isLoading, error, refresh } = useEntityPermissions(
    ResourceEntity.EVENT_SUBSCRIPTION,
    fqn,
    { enabled: isEditMode }
  );

  return {
    hasAccess: isEditMode
      ? canEditAll
      : checkPermission(
          Operation.Create,
          ResourceEntity.EVENT_SUBSCRIPTION,
          permissions
        ),
    isPermissionLoading: isEditMode && isLoading,
    // A failed permission fetch is not a denial; it gets a reload instead.
    permissionError: isEditMode ? error : null,
    refreshPermission: refresh,
  };
};

function AddObservabilityPage({
  alertType = AlertType.Observability,
}: Readonly<AddObservabilityPageProps>) {
  const { t } = useTranslation();
  const formState = useObservabilityAlertForm({ alertType });
  const { alert, alertError, breadcrumb, fetchAlert, isEditMode, isLoading } =
    formState;
  const isNotification = alertType === AlertType.Notification;
  const isAiMode = useIsAiMode();
  const { hasAccess, isPermissionLoading, permissionError, refreshPermission } =
    useAlertFormAccess(isEditMode);

  const getAlertLoadErrorPlaceholder = (status?: number) => {
    if (status === ClientErrors.NOT_FOUND) {
      return (
        <NoDataPlaceholder
          title={t('label.no-entity', { entity: t('label.alert') })}
        />
      );
    }

    if (status === ClientErrors.FORBIDDEN) {
      return (
        <PermissionPlaceholder
          permissionValue={t('label.edit-entity', {
            entity: t('label.alert'),
          })}
        />
      );
    }

    return <SomethingWentWrongPlaceholder onReload={fetchAlert} />;
  };

  const getAccessPlaceholder = () => {
    if (isPermissionLoading) {
      return <Loader />;
    }

    if (permissionError) {
      return (
        <Box className="tw:relative tw:min-h-[calc(100vh_-_16rem)] tw:w-full">
          <SomethingWentWrongPlaceholder onReload={refreshPermission} />
        </Box>
      );
    }

    if (!hasAccess) {
      return (
        <Box className="tw:relative tw:min-h-[calc(100vh_-_16rem)] tw:w-full">
          <PermissionPlaceholder
            permissionValue={t(
              isEditMode ? 'label.edit-entity' : 'label.create-entity',
              { entity: t('label.alert') }
            )}
          />
        </Box>
      );
    }

    return null;
  };

  const accessPlaceholder = getAccessPlaceholder();

  if (accessPlaceholder) {
    return accessPlaceholder;
  }

  // Only the edit route fetches an alert, and a retry clears the error first.
  if (alertError) {
    return (
      <Box className="tw:py-4" direction="col" gap={4}>
        <TitleBreadcrumb titleLinks={breadcrumb} />
        <Box className="tw:relative tw:min-h-[calc(100vh_-_16rem)] tw:w-full">
          {getAlertLoadErrorPlaceholder(alertError.response?.status)}
        </Box>
      </Box>
    );
  }

  if (isLoading || (isEditMode && isEmpty(alert))) {
    return <Loader />;
  }

  if (alert?.provider === ProviderType.System) {
    return (
      <ErrorPlaceHolder type={ERROR_PLACEHOLDER_TYPE.CUSTOM}>
        <Typography as="p" className="tw:max-w-md">
          {t('message.system-alert-edit-message')}
        </Typography>
      </ErrorPlaceHolder>
    );
  }

  return (
    <ResizablePanels
      hideSecondPanel
      className="content-height-with-resizable-panel"
      firstPanel={{
        className: 'content-resizable-panel-container ',
        allowScroll: true,
        children: (
          <Card
            className={classNames('steps-form-container', {
              'tw:my-4': isAiMode,
            })}>
            <Card.Content>
              <ObservabilityAlertForm
                {...formState}
                shouldShowActionsSection={
                  !isNotification && formState.shouldShowActionsSection
                }
              />
            </Card.Content>
          </Card>
        ),
        minWidth: 700,
        flex: 0.7,
        wrapInCard: false,
      }}
      pageTitle={t('label.add-entity', {
        entity: t(
          isNotification ? 'label.notification-alert' : 'label.observability'
        ),
      })}
      secondPanel={{
        children: <></>,
        minWidth: 0,
        className: 'content-resizable-panel-container',
      }}
    />
  );
}

export default withPageLayout(AddObservabilityPage);
