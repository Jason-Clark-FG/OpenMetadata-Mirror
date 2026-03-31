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

import { Table } from '@openmetadata/ui-core-components';
import { isEmpty } from 'lodash';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Selection } from 'react-aria-components';
import Loader from '../../Loader/Loader';
import { TableViewConfig } from '../shared/types';
import { useCellRenderer } from './useCellRenderer';

export const useDataTable = <T extends { id: string; name?: string }>(
  config: TableViewConfig<T>
) => {
  const { t } = useTranslation();
  const { listing, enableSelection = true, entityLabelKey = 'Items' } = config;

  const { renderCell } = useCellRenderer({
    columns: listing.columns,
    renderers: listing.renderers,
    chipSize: 'large',
  });

  const hasActiveSearch = listing.urlState?.searchQuery?.trim();
  const hasActiveFilters =
    listing.urlState?.filters &&
    Object.values(listing.urlState.filters).some(
      (filterValues: unknown) =>
        Array.isArray(filterValues) && filterValues.length > 0
    );
  const hasActiveFiltersOrSearch = hasActiveSearch || hasActiveFilters;

  const selectedKeys: Selection = useMemo(
    () => new Set(listing.selectedEntities),
    [listing.selectedEntities]
  );

  const dataTable = useMemo(() => {
    const handleSelectionChange = (keys: Selection) => {
      if (keys === 'all') {
        listing.handleSelectAll(true);
      } else {
        const newKeys = new Set(keys as Set<string>);
        const prevKeys = new Set(listing.selectedEntities);

        for (const key of newKeys) {
          if (!prevKeys.has(key as string)) {
            listing.handleSelect(key as string, true);
          }
        }
        for (const key of prevKeys) {
          if (!newKeys.has(key)) {
            listing.handleSelect(key, false);
          }
        }
      }
    };

    if (listing.loading) {
      return (
        <div data-testid="table-view-container">
          <Loader />
        </div>
      );
    }

    return (
      <Table
        aria-label={t(entityLabelKey)}
        data-testid="table-view-container"
        selectedKeys={selectedKeys}
        selectionBehavior={enableSelection ? 'toggle' : undefined}
        selectionMode={enableSelection ? 'multiple' : 'none'}
        onSelectionChange={handleSelectionChange}>
        <Table.Header columns={listing.columns}>
          {(column) => (
            <Table.Head id={column.key} key={column.key} label={t(column.labelKey)} />
          )}
        </Table.Header>
        <Table.Body
          items={listing.entities}
          renderEmptyState={() =>
            hasActiveFiltersOrSearch ? (
              <span>{t('server.no-records-found')}</span>
            ) : null
          }>
          {(entity) => (
            <Table.Row
              columns={listing.columns}
              id={entity.id}
              key={entity.id}
              onAction={() =>
                listing.actionHandlers.onEntityClick?.(entity)
              }>
              {(column) => (
                <Table.Cell key={column.key}>
                  {renderCell(entity, column)}
                </Table.Cell>
              )}
            </Table.Row>
          )}
        </Table.Body>
      </Table>
    );
  }, [
    listing,
    enableSelection,
    hasActiveFiltersOrSearch,
    selectedKeys,
    renderCell,
    entityLabelKey,
    t,
  ]);

  return {
    dataTable,
    isEmpty: isEmpty(listing.entities),
    hasActiveFiltersOrSearch,
    selectedCount: listing.selectedEntities.length,
    entityLabelKey,
  };
};
