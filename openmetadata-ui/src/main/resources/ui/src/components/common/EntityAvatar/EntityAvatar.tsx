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

import { Avatar } from '@openmetadata/ui-core-components';
import { FC } from 'react';
import {
  getDefaultIconForEntityType,
  ICON_MAP,
} from '../../../utils/IconUtils';

type AvatarSize = 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface EntityAvatarProps {
  entity: {
    name?: string;
    displayName?: string;
    entityType?: string;
    style?: {
      color?: string;
      iconURL?: string;
    };
    parent?: {
      type?: string;
    };
  };
  size?: number;
  className?: string;
  alt?: string;
}

const getSizeVariant = (size: number): AvatarSize => {
  if (size <= 16) {
    return 'xxs';
  }
  if (size <= 24) {
    return 'xs';
  }
  if (size <= 32) {
    return 'sm';
  }
  if (size <= 48) {
    return 'lg';
  }
  if (size <= 56) {
    return 'xl';
  }
  if (size >= 64) {
    return '2xl';
  }

  return 'md';
};

export const EntityAvatar: FC<EntityAvatarProps> = ({
  entity,
  size = 40,
  className,
  alt,
}) => {
  const avatarAlt = alt ?? entity.name ?? entity.displayName;
  const sizeVariant = getSizeVariant(size);

  const isUrl =
    entity.style?.iconURL &&
    (entity.style.iconURL.startsWith('http') ||
      entity.style.iconURL.startsWith('/'));

  if (isUrl) {
    return (
      <Avatar
        alt={avatarAlt}
        className={className}
        size={sizeVariant}
        src={entity.style?.iconURL}
      />
    );
  }

  const IconComponent = entity.style?.iconURL
    ? ICON_MAP[entity.style.iconURL]
    : null;

  if (IconComponent) {
    return (
      <Avatar
        alt={avatarAlt}
        className={className}
        placeholderIcon={IconComponent as FC<{ className?: string }>}
        size={sizeVariant}
      />
    );
  }

  const DefaultIcon = getDefaultIconForEntityType(entity.entityType);

  return (
    <Avatar
      alt={avatarAlt}
      className={className}
      placeholderIcon={DefaultIcon as FC<{ className?: string }>}
      size={sizeVariant}
    />
  );
};
