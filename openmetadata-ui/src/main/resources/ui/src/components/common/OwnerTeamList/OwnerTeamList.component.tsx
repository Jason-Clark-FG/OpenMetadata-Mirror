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

import { Button, Dropdown } from '@openmetadata/ui-core-components';
import React, { ReactNode, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ReactComponent as IconTeamsGrey } from '../../../assets/svg/teams-grey.svg';
import { EntityReference } from '../../../generated/entity/type';
import { getEntityName } from '../../../utils/EntityUtils';
import { getOwnerPath } from '../../../utils/ownerUtils';

export interface OwnerTeamListProps {
  owners: EntityReference[];
  avatarSize: number;
  ownerDisplayName?: Map<string, ReactNode>;
  placement?: 'vertical' | 'horizontal';
}

export const OwnerTeamList: React.FC<OwnerTeamListProps> = ({
  owners,
  avatarSize,
  ownerDisplayName,
  placement,
}) => {
  const { visibleTeam, remainingTeam } = useMemo(() => {
    return {
      visibleTeam: owners[0],
      remainingTeam: owners.slice(1),
    };
  }, [owners]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
      }}>
      <Link
        className="no-underline"
        data-testid="owner-link"
        to={getOwnerPath(visibleTeam)}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            maxWidth: '100%',
          }}>
          <IconTeamsGrey
            className="tw:text-gray-700"
            data-testid={getEntityName(visibleTeam)}
            style={{
              width: avatarSize,
              height: avatarSize,
            }}
          />
          <span
            className="tw:text-gray-900"
            style={{
              maxWidth:
                placement === 'vertical' || owners.length < 2
                  ? '120px'
                  : '50px',
              fontSize: '12px',
              fontWeight: 500,
              lineHeight: 'initial',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
            {ownerDisplayName?.get(visibleTeam.name ?? '') ??
              getEntityName(visibleTeam)}
          </span>
        </div>
      </Link>

      {owners.length > 1 && (
        <Dropdown.Root>
          <Button
            className="tw:ml-2 tw:text-xs tw:min-w-0 tw:p-0"
            color="link-color"
            size="sm">
            {`+${owners.length - 1}`}
          </Button>
          <Dropdown.Popover>
            <Dropdown.Menu aria-label="remaining team owners">
              {remainingTeam.map((owner) => {
                const name =
                  ownerDisplayName?.get(owner.name ?? '') ??
                  getEntityName(owner);

                return (
                  <Dropdown.Item key={owner.id}>
                    <Link
                      className="tw:block tw:no-underline tw:truncate tw:w-full tw:text-gray-900"
                      data-testid="owner-link"
                      to={getOwnerPath(owner)}>
                      {name}
                    </Link>
                  </Dropdown.Item>
                );
              })}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown.Root>
      )}
    </div>
  );
};
