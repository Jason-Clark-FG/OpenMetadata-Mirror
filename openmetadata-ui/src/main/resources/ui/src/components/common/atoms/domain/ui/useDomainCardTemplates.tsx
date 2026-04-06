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

import {
  Avatar,
  BadgeWithIcon,
  Box,
  Grid,
  Typography,
} from '@openmetadata/ui-core-components';
import { Tag01 } from '@untitledui/icons';
import { ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { DataProduct } from '../../../../../generated/entity/domains/dataProduct';
import { Domain } from '../../../../../generated/entity/domains/domain';
import { TagLabel } from '../../../../../generated/type/tagLabel';
import { getEntityName } from '../../../../../utils/EntityUtils';
import { getEntityAvatarProps } from '../../../../../utils/IconUtils';
import {
  getClassificationTags,
  getGlossaryTags,
} from '../../../../../utils/TagsUtils';
import { DomainTypeChip } from '../../../../DomainListing/components/DomainTypeChip';
import { OwnerLabel } from '../../../OwnerLabel/OwnerLabel.component';

const CardTagList = ({ tags }: { tags: TagLabel[] }) => {
  if (!tags.length) {
    return <Typography size="text-sm">-</Typography>;
  }

  const firstTag = tags[0];
  const remaining = tags.length - 1;

  return (
    <Box align="center" direction="row" gap={1}>
      <BadgeWithIcon
        color="gray"
        iconLeading={Tag01}
        key={firstTag.tagFQN}
        size="sm"
        type="color">
        {firstTag.displayName || firstTag.tagFQN}
      </BadgeWithIcon>
      {remaining > 0 && (
        <Typography size="text-xs" weight="medium">
          +{remaining}
        </Typography>
      )}
    </Box>
  );
};

export const useDomainCardTemplates = () => {
  const { t } = useTranslation();

  const renderDomainCard = useCallback(
    (entity: Domain): ReactNode => (
      <Box direction="col" gap={4}>
        <Box align="center" direction="row" gap={3}>
          <Avatar size="md" {...getEntityAvatarProps(entity)} />
          <Typography size="text-sm" weight="medium">
            {getEntityName(entity)}
          </Typography>
        </Box>

        <Grid gap="4">
          <Grid.Item span={12}>
            <Box direction="col" gap={1}>
              <Typography size="text-xs">
                {t('label.owner')}
              </Typography>
              <OwnerLabel
                isCompactView={false}
                maxVisibleOwners={4}
                owners={entity.owners}
                showLabel={false}
              />
            </Box>
          </Grid.Item>
          <Grid.Item span={12}>
            <Box direction="col" gap={1}>
              <Typography size="text-xs">
                {t('label.domain-type')}
              </Typography>
              {entity.domainType ? (
                <DomainTypeChip domainType={entity.domainType} />
              ) : (
                <Typography size="text-sm">-</Typography>
              )}
            </Box>
          </Grid.Item>
        </Grid>

        <Grid gap="4">
          <Grid.Item span={12}>
            <Box direction="col" gap={1}>
              <Typography size="text-xs">
                {t('label.glossary-term-plural')}
              </Typography>
              <CardTagList tags={getGlossaryTags(entity.tags)} />
            </Box>
          </Grid.Item>
          <Grid.Item span={12}>
            <Box direction="col" gap={1}>
              <Typography size="text-xs">
                {t('label.tag-plural')}
              </Typography>
              <CardTagList tags={getClassificationTags(entity.tags)} />
            </Box>
          </Grid.Item>
        </Grid>
      </Box>
    ),
    [t]
  );

  const renderDataProductCard = useCallback(
    (entity: DataProduct): ReactNode => {
      const entityName = getEntityName(entity);
      const showName =
        entity.displayName &&
        entity.name &&
        entity.displayName !== entity.name;

      return (
        <Box direction="col" gap={4}>
          <Box align="center" direction="row" gap={3}>
            <Avatar size="md" {...getEntityAvatarProps(entity)} />
            <Box direction="col">
              <Typography size="text-sm" weight="medium">
                {entityName}
              </Typography>
              {showName && (
                <Typography size="text-xs">{entity.name}</Typography>
              )}
            </Box>
          </Box>

          <Grid gap="4">
            <Grid.Item span={12}>
              <Box direction="col" gap={1}>
                <Typography size="text-xs">
                  {t('label.owner-plural')}
                </Typography>
                <OwnerLabel
                  isCompactView={false}
                  maxVisibleOwners={4}
                  owners={entity.owners}
                  showLabel={false}
                />
              </Box>
            </Grid.Item>
            <Grid.Item span={12}>
              <Box direction="col" gap={1}>
                <Typography size="text-xs">
                  {t('label.expert-plural')}
                </Typography>
                <OwnerLabel
                  isCompactView={false}
                  maxVisibleOwners={4}
                  owners={entity.experts}
                  showLabel={false}
                />
              </Box>
            </Grid.Item>
          </Grid>

          <Grid gap="4">
            <Grid.Item span={12}>
              <Box direction="col" gap={1}>
                <Typography size="text-xs">
                  {t('label.glossary-term-plural')}
                </Typography>
                <CardTagList tags={getGlossaryTags(entity.tags)} />
              </Box>
            </Grid.Item>
            <Grid.Item span={12}>
              <Box direction="col" gap={1}>
                <Typography size="text-xs">
                  {t('label.tag-plural')}
                </Typography>
                <CardTagList tags={getClassificationTags(entity.tags)} />
              </Box>
            </Grid.Item>
          </Grid>
        </Box>
      );
    },
    [t]
  );

  return {
    renderDomainCard,
    renderDataProductCard,
  };
};
