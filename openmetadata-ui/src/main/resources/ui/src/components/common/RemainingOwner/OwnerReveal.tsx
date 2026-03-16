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
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getEntityName } from '../../../utils/EntityUtils';
import { getOwnerPath } from '../../../utils/ownerUtils';
import UserPopOverCard from '../PopOverCard/UserPopOverCard';
import ProfilePicture from '../ProfilePicture/ProfilePicture';
import { OwnerRevealProps } from './OwnerReveal.interface';

export const OwnerReveal: React.FC<OwnerRevealProps> = ({
  isCompactView,
  owners,
  remainingCount,
  showAllOwners,
  setShowAllOwners,
  avatarSize = 32,
}) => {
  const { t } = useTranslation();
  const remainingCountLabel = `+${remainingCount}`;
  const fontSize = Math.max(8, Math.floor(avatarSize * 0.4));

  if (isCompactView) {
    return (
      <div className="tw:relative">
        <Button
          className={`${
            showAllOwners ? '' : 'more-owners-button'
          } tw:text-sm tw:flex tw:items-center tw:justify-center`}
          color="link-color"
          style={{
            width: `${avatarSize}px`,
            height: `${avatarSize}px`,
            fontSize: `${fontSize}px`,
            minWidth: 'fit-content',
          }}
          onPress={() => setShowAllOwners((prev) => !prev)}>
          {showAllOwners ? t('label.less') : remainingCountLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="tw:relative">
      <Dropdown.Root>
        <Button
          className={`${
            showAllOwners ? '' : 'more-owners-button'
          } tw:text-sm tw:flex tw:items-center tw:justify-center`}
          color="link-color"
          style={{
            width: `${avatarSize}px`,
            height: `${avatarSize}px`,
            fontSize: `${fontSize}px`,
            minWidth: 'fit-content',
          }}>
          {showAllOwners ? t('label.less') : remainingCountLabel}
        </Button>
        <Dropdown.Popover>
          <Dropdown.Menu aria-label="remaining owners">
            {owners.map((owner) => {
              const name = getEntityName(owner);

              return (
                <Dropdown.Item key={owner.id} textValue={name}>
                  <UserPopOverCard
                    popoverZIndex={200000}
                    userName={owner.name ?? ''}>
                    <Link
                      className="tw:flex tw:no-underline tw:items-center tw:gap-2 tw:min-w-0"
                      data-testid="owner-link"
                      to={getOwnerPath(owner)}>
                      <ProfilePicture
                        displayName={name}
                        name={owner.name ?? ''}
                        type="circle"
                        width={avatarSize.toString()}
                      />
                      <div className="tw:min-w-0 tw:overflow-hidden">
                        <Typography
                          as="span"
                          className="tw:text-sm tw:truncate tw:block">
                          {name}
                        </Typography>
                      </div>
                    </Link>
                  </UserPopOverCard>
                </Dropdown.Item>
              );
            })}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown.Root>
    </div>
  );
};
