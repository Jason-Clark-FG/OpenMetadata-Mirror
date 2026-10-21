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

import { AxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { ClientErrors } from '../../../enums/Axios.enum';
import PermissionPlaceholder from '../../common/EmptyPlaceholder/PermissionPlaceholder';
import SomethingWentWrongPlaceholder from '../../common/EmptyPlaceholder/SomethingWentWrongPlaceholder';

interface WorkflowLoadErrorPlaceholderProps {
  error: AxiosError;
  /** What failed to load, e.g. "Workflows" or "Execution History". */
  entity: string;
  onReload?: () => void;
}

/**
 * Shown in place of workflow content whose fetch failed: a permission state on 403, an error
 * with a reload action otherwise. The host container must set `position: relative`.
 */
const WorkflowLoadErrorPlaceholder = ({
  error,
  entity,
  onReload,
}: WorkflowLoadErrorPlaceholderProps) => {
  const { t } = useTranslation();

  if (error.response?.status === ClientErrors.FORBIDDEN) {
    return (
      <PermissionPlaceholder
        data-testid="workflow-permission-error"
        permissionValue={t('label.view-entity', { entity })}
      />
    );
  }

  return (
    <SomethingWentWrongPlaceholder
      data-testid="workflow-load-error"
      title={t('server.entity-fetch-error', { entity })}
      onReload={onReload}
    />
  );
};

export default WorkflowLoadErrorPlaceholder;
