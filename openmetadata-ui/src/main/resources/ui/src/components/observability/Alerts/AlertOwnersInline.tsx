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
import { Box, Owner } from '@openmetadata/ui-core-components';
import { isEmpty } from 'lodash';
import { useTranslation } from 'react-i18next';
import { EntityReference } from '../../../generated/entity/type';
import { UserTeamSelectableList } from '../../common/UserTeamSelectableList/UserTeamSelectableList.component';

interface AlertOwnersInlineProps {
  owners?: EntityReference[];
  hasPermission: boolean;
  onUpdate: (owners?: EntityReference[]) => Promise<void> | void;
}

/**
 * "Owners", the owner avatar stack and the edit trigger on one row, so the
 * header keeps the event counts beside it instead of wrapping under a column.
 */
const AlertOwnersInline = ({
  owners,
  hasPermission,
  onUpdate,
}: AlertOwnersInlineProps) => {
  const { t } = useTranslation();
  const hasOwners = !isEmpty(owners);

  if (!hasOwners && !hasPermission) {
    return null;
  }

  return (
    <Box
      align="center"
      className="tw:min-w-0 tw:shrink-0"
      data-testid="alert-owners"
      gap={2}>
      <span className="tw:text-sm tw:font-medium tw:text-secondary">
        {t('label.owner-plural')}
      </span>
      {hasOwners && <Owner owners={owners} />}
      {hasPermission && (
        <UserTeamSelectableList
          hasPermission
          multiple={{ user: true, team: false }}
          owner={owners}
          onUpdate={onUpdate}
        />
      )}
    </Box>
  );
};

export default AlertOwnersInline;
