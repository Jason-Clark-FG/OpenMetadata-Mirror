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
  ClearOutlined,
  FilterOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Button, Input, Select, Space, Switch, Tag, Tooltip } from 'antd';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Glossary } from '../../generated/entity/data/glossary';
import { GlossaryTermRelationType } from '../../rest/settingConfigAPI';
import { GraphFilters } from './OntologyExplorer.interface';

interface FilterToolbarProps {
  filters: GraphFilters;
  glossaries: Glossary[];
  relationTypes: GlossaryTermRelationType[];
  onFiltersChange: (filters: GraphFilters) => void;
}

const FilterToolbar: React.FC<FilterToolbarProps> = ({
  filters,
  glossaries,
  relationTypes,
  onFiltersChange,
}) => {
  const { t } = useTranslation();

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFiltersChange({ ...filters, searchQuery: e.target.value });
    },
    [filters, onFiltersChange]
  );

  const handleGlossaryChange = useCallback(
    (glossaryIds: string[]) => {
      onFiltersChange({ ...filters, glossaryIds });
    },
    [filters, onFiltersChange]
  );

  const handleRelationTypeChange = useCallback(
    (types: string[]) => {
      onFiltersChange({ ...filters, relationTypes: types });
    },
    [filters, onFiltersChange]
  );

  const handleShowIsolatedChange = useCallback(
    (showIsolatedNodes: boolean) => {
      onFiltersChange({ ...filters, showIsolatedNodes });
    },
    [filters, onFiltersChange]
  );

  const handleClearFilters = useCallback(() => {
    onFiltersChange({
      glossaryIds: [],
      relationTypes: [],
      hierarchyLevels: [],
      showIsolatedNodes: true,
      searchQuery: '',
    });
  }, [onFiltersChange]);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.glossaryIds.length > 0 ||
      filters.relationTypes.length > 0 ||
      filters.searchQuery.length > 0 ||
      !filters.showIsolatedNodes
    );
  }, [filters]);

  const glossaryOptions = useMemo(() => {
    return glossaries.map((g) => ({
      value: g.id,
      label: g.displayName || g.name,
    }));
  }, [glossaries]);

  const relationTypeOptions = useMemo(() => {
    return relationTypes.map((rt) => ({
      value: rt.name,
      label: rt.displayName || rt.name,
    }));
  }, [relationTypes]);

  return (
    <div className="filter-toolbar">
      <Space wrap size="small">
        <Input
          allowClear
          className="filter-search"
          placeholder={t('label.search-in-graph')}
          prefix={<SearchOutlined />}
          style={{ width: 180 }}
          value={filters.searchQuery}
          onChange={handleSearchChange}
        />

        <Select
          allowClear
          maxTagCount={1}
          mode="multiple"
          options={glossaryOptions}
          placeholder={
            <Space>
              <FilterOutlined />
              {t('label.glossary')}
            </Space>
          }
          style={{ minWidth: 150 }}
          value={filters.glossaryIds}
          onChange={handleGlossaryChange}
        />

        <Select
          allowClear
          maxTagCount={1}
          mode="multiple"
          options={relationTypeOptions}
          placeholder={
            <Space>
              <FilterOutlined />
              {t('label.relation-type')}
            </Space>
          }
          style={{ minWidth: 150 }}
          value={filters.relationTypes}
          onChange={handleRelationTypeChange}
        />

        <Tooltip title={t('label.show-isolated-nodes')}>
          <Tag
            className="cursor-pointer"
            color={filters.showIsolatedNodes ? 'default' : 'blue'}>
            <Space>
              <Switch
                checked={filters.showIsolatedNodes}
                size="small"
                onChange={handleShowIsolatedChange}
              />
              {t('label.isolated')}
            </Space>
          </Tag>
        </Tooltip>

        {hasActiveFilters && (
          <Tooltip title={t('label.clear-filter-plural')}>
            <Button
              icon={<ClearOutlined />}
              size="small"
              type="text"
              onClick={handleClearFilters}
            />
          </Tooltip>
        )}
      </Space>
    </div>
  );
};

export default FilterToolbar;
