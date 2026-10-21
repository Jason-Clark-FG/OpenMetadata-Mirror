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

import { Box } from '@openmetadata/ui-core-components';
import { isUndefined } from 'lodash';
import { useTranslation } from 'react-i18next';
import NoDataPlaceholder from '../../components/common/EmptyPlaceholder/NoDataPlaceholder';
import PermissionPlaceholder from '../../components/common/EmptyPlaceholder/PermissionPlaceholder';
import SomethingWentWrongPlaceholder from '../../components/common/EmptyPlaceholder/SomethingWentWrongPlaceholder';
import ErrorPlaceHolder from '../../components/common/ErrorWithPlaceholder/ErrorPlaceHolder';
import Loader from '../../components/common/Loader/Loader';
import TitleBreadcrumb from '../../components/common/TitleBreadcrumb/TitleBreadcrumb.component';
import PageLayoutV1 from '../../components/PageLayoutV1/PageLayoutV1';
import { ClientErrors } from '../../enums/Axios.enum';
import { ERROR_PLACEHOLDER_TYPE } from '../../enums/common.enum';
import { getEntityName } from '../../utils/EntityNameUtils';
import { AlertDetailsPageProps } from './AlertDetailsPage.interface';
import AlertDetailsContent from './components/AlertDetailsContent';
import { useAlertDetailsPage } from './hooks/useAlertDetailsPage';

function AlertDetailsPage({
  afterDeleteAction,
  fqn,
  isNotificationAlert = false,
  onEditAlert,
  onTabChange,
  tab,
}: Readonly<AlertDetailsPageProps>) {
  const { t } = useTranslation();
  const detailsState = useAlertDetailsPage({
    afterDeleteAction,
    fqn,
    isNotificationAlert,
    onEditAlert,
    onTabChange,
    tab,
  });
  const {
    alertDetails,
    alertDetailsError,
    breadcrumb,
    fetchAlertDetails,
    loadingCount,
    viewPermission,
  } = detailsState;

  if (!loadingCount && !isUndefined(viewPermission) && !viewPermission) {
    return (
      <ErrorPlaceHolder
        className="border-none"
        permissionValue={t('label.view-entity', {
          entity: t('label.alert-detail-plural'),
        })}
        type={ERROR_PLACEHOLDER_TYPE.PERMISSION}
      />
    );
  }
  if (!loadingCount && isUndefined(alertDetails)) {
    const status = alertDetailsError?.response?.status;
    let loadErrorPlaceholder = (
      <SomethingWentWrongPlaceholder onReload={fetchAlertDetails} />
    );
    if (status === ClientErrors.NOT_FOUND) {
      loadErrorPlaceholder = (
        <NoDataPlaceholder
          title={t('label.no-entity', { entity: t('label.alert') })}
        />
      );
    } else if (status === ClientErrors.FORBIDDEN) {
      loadErrorPlaceholder = (
        <PermissionPlaceholder
          permissionValue={t('label.view-entity', {
            entity: t('label.alert-detail-plural'),
          })}
        />
      );
    }

    return (
      <PageLayoutV1 pageTitle={t('label.alert-detail-plural')}>
        <Box direction="col" gap={4}>
          <TitleBreadcrumb titleLinks={breadcrumb} />
          <Box className="tw:relative tw:min-h-[calc(100vh_-_16rem)] tw:w-full">
            {loadErrorPlaceholder}
          </Box>
        </Box>
      </PageLayoutV1>
    );
  }

  return (
    <PageLayoutV1 pageTitle={getEntityName(alertDetails)}>
      {loadingCount ? <Loader /> : <AlertDetailsContent {...detailsState} />}
    </PageLayoutV1>
  );
}

export default AlertDetailsPage;
