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

import {
  Avatar,
  BadgeWithIcon,
  Box,
  Table,
  Typography,
} from '@openmetadata/ui-core-components';
import { Tag01 } from '@untitledui/icons';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Selection } from 'react-aria-components';
import { EntityReference } from '../../../generated/entity/type';
import { TagLabel } from '../../../generated/type/tagLabel';
import { getEntityName } from '../../../utils/EntityUtils';
import { getEntityAvatarProps } from '../../../utils/IconUtils';
import { getClassificationTags, getGlossaryTags } from '../../../utils/TagsUtils';
import { DomainTypeChip } from '../../DomainListing/components/DomainTypeChip';
import Loader from '../Loader/Loader';
import { OwnerLabel } from '../OwnerLabel/OwnerLabel.component';

interface EntityListingTableProps<
  T extends {
    id: string;
    name?: string;
    owners?: EntityReference[];
    tags?: TagLabel[];
    domainType?: string;
  }
> {
  entities: T[];
  loading: boolean;
  selectedEntities: string[];
  onSelectAll: (checked: boolean) => void;
  onSelect: (id: string, checked: boolean) => void;
  onEntityClick?: (entity: T) => void;
  ariaLabel: string;
}

const COLUMN_DEFS = [
  { id: 'name', labelKey: 'label.domain' },
  { id: 'owners', labelKey: 'label.owner-plural' },
  { id: 'glossaryTerms', labelKey: 'label.glossary-term-plural' },
  { id: 'domainType', labelKey: 'label.domain-type' },
  { id: 'tags', labelKey: 'label.tag-plural' },
];

const renderTagList = (tags: TagLabel[]) => {
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
        size="md"
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

const EntityListingTable = <
  T extends {
    id: string;
    name?: string;
    owners?: EntityReference[];
    tags?: TagLabel[];
    domainType?: string;
  }
>({
  entities,
  loading,
  selectedEntities,
  onSelectAll,
  onSelect,
  onEntityClick,
  ariaLabel,
}: EntityListingTableProps<T>) => {
  const { t } = useTranslation();

  const columns = useMemo(
    () => COLUMN_DEFS.map((col) => ({ ...col, label: t(col.labelKey) })),
    [t]
  );

  const selectedKeys: Selection = useMemo(
    () => new Set(selectedEntities),
    [selectedEntities]
  );

  const handleSelectionChange = useCallback(
    (keys: Selection) => {
      if (keys === 'all') {
        onSelectAll(true);
      } else {
        const newKeys = new Set(keys as Set<string>);
        const prevKeys = new Set(selectedEntities);
        for (const key of newKeys) {
          if (!prevKeys.has(key as string)) {
            onSelect(key as string, true);
          }
        }
        for (const key of prevKeys) {
          if (!newKeys.has(key)) {
            onSelect(key, false);
          }
        }
      }
    },
    [onSelectAll, onSelect, selectedEntities]
  );

  const renderCell = useCallback(
    (entity: T, columnId: string) => {
      switch (columnId) {
        case 'name':
          return (
            <Box align="center" direction="row" gap={3}>
              <Avatar
                size="md"
                {...getEntityAvatarProps(
                  entity as Parameters<typeof getEntityAvatarProps>[0]
                )}
              />
              <Typography size="text-sm" weight="medium">
                {getEntityName(entity)}
              </Typography>
            </Box>
          );
        case 'domainType':
          return entity.domainType ? (
            <DomainTypeChip domainType={entity.domainType} />
          ) : (
            <Typography size="text-sm">-</Typography>
          );
        case 'owners':
          return (
            <OwnerLabel
              isCompactView={false}
              maxVisibleOwners={4}
              owners={entity.owners}
              showLabel={false}
            />
          );
        case 'glossaryTerms':
          return renderTagList(getGlossaryTags(entity.tags));
        case 'tags':
          return renderTagList(getClassificationTags(entity.tags));
        default:
          return null;
      }
    },
    []
  );

  if (loading) {
    return <Loader />;
  }

  return (
    <Table
      aria-label={ariaLabel}
      data-testid="entity-listing-table"
      selectedKeys={selectedKeys}
      selectionBehavior="toggle"
      selectionMode="multiple"
      onSelectionChange={handleSelectionChange}>
      <Table.Header
        className="tw:border-t tw:border-x tw:border-secondary"
        columns={columns}>
        {(col) => (
          <Table.Head
            className={col.id === 'name' ? 'tw:pl-6' : undefined}
            id={col.id}
            key={col.id}
            label={col.label}
          />
        )}
      </Table.Header>
      <Table.Body items={entities}>
        {(entity) => (
          <Table.Row
            className="tw:border-x tw:border-secondary tw:cursor-pointer"
            columns={columns}
            id={entity.id}
            key={entity.id}
            onAction={() => onEntityClick?.(entity)}>
            {(col) => (
              <Table.Cell
                className={col.id === 'name' ? 'tw:pl-6' : undefined}
                key={col.id}>
                {renderCell(entity, col.id)}
              </Table.Cell>
            )}
          </Table.Row>
        )}
      </Table.Body>
    </Table>
  );
};

export default EntityListingTable;
