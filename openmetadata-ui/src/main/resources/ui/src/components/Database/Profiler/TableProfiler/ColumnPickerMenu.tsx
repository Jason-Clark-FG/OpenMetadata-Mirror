/*
 *  Copyright 2023 Collate.
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
import { ChevronDown } from '@untitledui/icons';
import classNames from 'classnames';
import { find } from 'lodash';
import { FC, useMemo, useState } from 'react';
import { Column } from '../../../../generated/entity/data/container';
import { getEntityName } from '../../../../utils/EntityUtils';

interface ColumnPickerMenuProps {
  activeColumnFqn: string;
  columns: Column[];
  handleChange: (key: string) => void;
}

const ColumnPickerMenu: FC<ColumnPickerMenuProps> = ({
  activeColumnFqn,
  columns,
  handleChange,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const selectedItem = useMemo(() => {
    return find(
      columns,
      (column: Column) => column.fullyQualifiedName === activeColumnFqn
    );
  }, [activeColumnFqn, columns]);

  const handleOptionClick = (key: string) => {
    handleChange(key);
    setIsMenuOpen(false);
  };

  return (
    <div data-testid="column-picker-menu">
      <Dropdown.Root isOpen={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <Button
          color="secondary"
          data-testid="column-picker-menu-button"
          iconTrailing={<ChevronDown className="tw:size-4" />}
          size="sm">
          {getEntityName(selectedItem)}
        </Button>
        <Dropdown.Popover className="tw:max-h-87 tw:min-w-50 tw:w-max">
          <div className="tw:py-1">
            {columns.map((column) => {
              const isSelected = column.fullyQualifiedName === activeColumnFqn;

              const itemClassName = classNames(
                'tw:block tw:w-full tw:cursor-pointer tw:px-4 tw:py-2',
                'tw:text-left tw:text-sm tw:font-normal tw:outline-hidden',
                'tw:transition tw:duration-100 tw:ease-linear',
                {
                  'tw:bg-brand-solid tw:text-white tw:font-semibold tw:hover:bg-brand-solid_hover':
                    isSelected,
                  'tw:text-secondary tw:hover:bg-primary_hover tw:hover:text-secondary_hover':
                    !isSelected,
                }
              );

              return (
                <button
                  className={itemClassName}
                  data-testid={`column-picker-menu-item-${column.fullyQualifiedName}`}
                  key={column.fullyQualifiedName}
                  onClick={() =>
                    handleOptionClick(column.fullyQualifiedName || '')
                  }>
                  <span className="tw:flex tw:items-center tw:gap-1">
                    <span className="tw:text-sm tw:text-inherit">
                      {getEntityName(column)}
                    </span>
                    <span
                      className={classNames('tw:text-xs', {
                        'tw:opacity-90': isSelected,
                        'tw:text-tertiary': !isSelected,
                      })}>
                      {`(${column.dataType})`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Dropdown.Popover>
      </Dropdown.Root>
    </div>
  );
};

export default ColumnPickerMenu;
