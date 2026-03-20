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

import { Button, Dropdown, Typography } from '@openmetadata/ui-core-components';
import classNames from 'classnames';
import React, { ReactNode, useMemo } from 'react';
import { ReactComponent as IconTeamsGrey } from '../../../assets/svg/teams-grey.svg';
import { EntityReference } from '../../../generated/entity/type';
import { getEntityName } from '../../../utils/EntityUtils';
import { getOwnerPath } from '../../../utils/ownerUtils';
import { AVATAR_SIZE_CLASS_MAP } from '../OwnerUserTeamList/OwnerUserTeamList.constants';

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
    <div className="tw:flex tw:items-center tw:relative">
      <Button
        color="link-gray"
        data-testid="owner-link"
        href={getOwnerPath(visibleTeam)}
        iconLeading={
          <IconTeamsGrey
            className={classNames(
              'tw:text-gray-700',
              AVATAR_SIZE_CLASS_MAP[avatarSize]
            )}
          />
        }>
        <div className="tw:flex tw:items-center tw:gap-2 tw:max-w-full">
          <div
            className={classNames('tw:overflow-hidden', {
              'tw:max-w-30': placement === 'vertical' || owners.length < 2,
              'tw:max-w-12.5': placement !== 'vertical' && owners.length >= 2,
            })}>
            <Typography
              as="p"
              className="tw:leading-none tw:truncate tw:m-0"
              size="text-xs"
              weight="medium">
              {ownerDisplayName?.get(visibleTeam.name ?? '') ??
                getEntityName(visibleTeam)}
            </Typography>
          </div>
        </div>
      </Button>

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
                  <Dropdown.Item
                    key={owner.id}
                    textValue={getEntityName(owner)}>
                    <Button
                      color="link-gray"
                      data-testid="owner-link"
                      href={getOwnerPath(owner)}>
                      {' '}
                      {name}
                    </Button>
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
