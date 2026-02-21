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
import { MultiSelect } from '@openmetadata/ui-core-components';
import { FC, KeyboardEvent, memo, useEffect } from 'react';
import { Key } from 'react-aria-components';
import { useListData } from 'react-stately';
import { AutocompleteProps } from './Autocomplete.interface';

const toItem = (str: string) => ({ id: str, label: str });

const Autocomplete: FC<AutocompleteProps> = ({
  value = [],
  onChange,
  label,
  placeholder,
  required = false,
  options = [],
  dataTestId,
}) => {
  const selectedItems = useListData({ initialItems: value.map(toItem) });

  useEffect(() => {
    const currentIds = selectedItems.items.map((i) => i.id);

    value.forEach((v) => {
      if (!currentIds.includes(v)) {
        selectedItems.append(toItem(v));
      }
    });

    currentIds.forEach((id) => {
      if (!value.includes(id)) {
        selectedItems.remove(id);
      }
    });
  }, [value]);

  const handleItemInserted = (key: Key) => {
    const updated = [...selectedItems.items.map((i) => i.id), key as string];
    onChange?.(updated);
  };

  const handleItemCleared = (key: Key) => {
    const updated = selectedItems.items
      .map((i) => i.id)
      .filter((id) => id !== key);
    onChange?.(updated);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') {
      return;
    }

    const inputEl = e.currentTarget.querySelector('input');
    const inputValue = inputEl?.value?.trim();

    if (!inputValue || selectedItems.items.some((i) => i.id === inputValue)) {
      return;
    }

    selectedItems.append(toItem(inputValue));
    onChange?.([...selectedItems.items.map((i) => i.id), inputValue]);

    if (inputEl) {
      inputEl.value = '';
    }
  };

  return (
    <div data-testid={dataTestId} onKeyDown={handleKeyDown}>
      <MultiSelect
        allowsCustomValue
        isRequired={required}
        items={options.map(toItem)}
        label={label}
        placeholder={placeholder}
        selectedItems={selectedItems}
        onItemCleared={handleItemCleared}
        onItemInserted={handleItemInserted}>
        {(item) => (
          <MultiSelect.Item id={item.id}>{item.label}</MultiSelect.Item>
        )}
      </MultiSelect>
    </div>
  );
};

export default memo(Autocomplete);
