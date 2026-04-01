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

import type { CSSProperties, FC, ReactNode } from 'react';
import {
  Fragment,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  createElement
} from 'react';
import { Check } from '@untitledui/icons';
import type { Key } from 'react-aria-components';
import type { RegisterOptions, UseControllerReturn } from 'react-hook-form';
import { useFormContext } from 'react-hook-form';
import { normalizeHexColor } from '@/colors/colorValidation';
import { Alert } from '@/components/base/alert/alert';
import { Autocomplete } from '@/components/base/autocomplete/autocomplete';
import { Tabs } from '@/components/application/tabs/tabs';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Divider } from '@/components/base/divider/divider';
import { FileTrigger } from '@/components/base/file-upload-trigger/file-upload-trigger';
import { FormField } from '@/components/base/form/hook-form';
import { HintText } from '@/components/base/input/hint-text';
import { Input } from '@/components/base/input/input';
import { NativeSelect } from '@/components/base/select/select-native';
import { Select, type SelectItemType } from '@/components/base/select/select';
import { Slider } from '@/components/base/slider/slider';
import { TextArea } from '@/components/base/textarea/textarea';
import { Toggle } from '@/components/base/toggle/toggle';
import { cx } from '@/utils/cx';
import { isReactComponent } from '@/utils/is-react-component';
import { type FieldProp, FieldTypes, HelperTextType } from './form-field.types';
import { FormItemLabel } from './form-item-label';

type FieldPropsMap = NonNullable<FieldProp['props']>;
type Primitive = string | number | boolean;
type FormSelectItem = SelectItemType & { rawValue?: unknown };
type ControlledField = {
  name: string;
  value: unknown;
  onChange: (...event: unknown[]) => void;
  onBlur: () => void;
};

const DEFAULT_COLOR_OPTIONS = [
  '#1470EF',
  '#7D81E9',
  '#F14C75',
  '#F689A6',
  '#05C4EA',
  '#05A580',
  '#FFB01A',
  '#BF4CF1',
  '#99AADF',
  '#C0B3F2',
  '#EDB3B3',
  '#ECB892',
  '#90DAE3',
  '#82E6C4',
];

const MULTIPLE_SELECTION_FIELD_TYPES = new Set<FieldTypes>([
  FieldTypes.MULTI_SELECT,
  FieldTypes.ASYNC_SELECT,
  FieldTypes.TREE_ASYNC_SELECT,
  FieldTypes.TAG_SUGGESTION,
  FieldTypes.UT_TAG_SUGGESTION,
  FieldTypes.GLOSSARY_TAG_SUGGESTION,
  FieldTypes.USER_TEAM_SELECT,
  FieldTypes.USER_MULTI_SELECT,
  FieldTypes.USER_TEAM_SELECT_INPUT,
]);

const AUTOCOMPLETE_FIELD_TYPES = new Set<FieldTypes>([
  FieldTypes.AUTOCOMPLETE,
  FieldTypes.MULTI_SELECT,
  FieldTypes.ASYNC_SELECT,
  FieldTypes.TREE_ASYNC_SELECT,
  FieldTypes.TAG_SUGGESTION,
  FieldTypes.UT_TAG_SUGGESTION,
  FieldTypes.GLOSSARY_TAG_SUGGESTION,
  FieldTypes.USER_TEAM_SELECT,
  FieldTypes.USER_MULTI_SELECT,
  FieldTypes.USER_TEAM_SELECT_INPUT,
  FieldTypes.DOMAIN_SELECT,
]);

const isObjectLike = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPrimitive = (value: unknown): value is Primitive =>
  ['string', 'number', 'boolean'].includes(typeof value);

const isFileValue = (value: unknown): value is File =>
  typeof File !== 'undefined' && value instanceof File;

const getKeyString = (value: unknown): string | null => {
  if (isPrimitive(value)) {
    return String(value);
  }

  if (!isObjectLike(value)) {
    return null;
  }

  const candidate =
    ('id' in value && value.id) ||
    ('value' in value && isPrimitive(value.value) && value.value) ||
    ('key' in value && isPrimitive(value.key) && value.key) ||
    ('tagFQN' in value && isPrimitive(value.tagFQN) && value.tagFQN) ||
    ('fullyQualifiedName' in value &&
      isPrimitive(value.fullyQualifiedName) &&
      value.fullyQualifiedName) ||
    ('name' in value && isPrimitive(value.name) && value.name);

  return isPrimitive(candidate) ? String(candidate) : null;
};

const normalizeSelectItem = (entry: unknown): FormSelectItem | null => {
  if (isPrimitive(entry)) {
    return {
      id: String(entry),
      label: String(entry),
      rawValue: entry,
    };
  }

  if (!isObjectLike(entry)) {
    return null;
  }

  const label =
    typeof entry.label === 'string'
      ? entry.label
      : typeof entry.displayName === 'string'
        ? entry.displayName
        : typeof entry.name === 'string'
          ? entry.name
          : typeof entry.fullyQualifiedName === 'string'
            ? entry.fullyQualifiedName
            : typeof entry.tagFQN === 'string'
              ? entry.tagFQN
              : undefined;
  const explicitValue = 'value' in entry ? entry.value : undefined;
  const id =
    getKeyString(entry.id) ??
    getKeyString(explicitValue) ??
    getKeyString(entry.tagFQN) ??
    getKeyString(entry.fullyQualifiedName) ??
    (label ? label : null);

  if (!id) {
    return null;
  }

  return {
    id,
    label: label ?? id,
    avatarUrl:
      typeof entry.avatarUrl === 'string' ? entry.avatarUrl : undefined,
    supportingText:
      typeof entry.supportingText === 'string'
        ? entry.supportingText
        : typeof entry.fullyQualifiedName === 'string'
          ? entry.fullyQualifiedName
          : undefined,
    isDisabled: Boolean(
      ('isDisabled' in entry && entry.isDisabled) ||
      ('disabled' in entry && entry.disabled)
    ),
    icon: entry.icon as SelectItemType['icon'],
    rawValue: explicitValue ?? entry,
  };
};

const getSelectItems = (props: FieldPropsMap): FormSelectItem[] => {
  const source = Array.isArray(props.items)
    ? props.items
    : Array.isArray(props.options)
      ? props.options
      : [];

  return source
    .map((entry) => normalizeSelectItem(entry))
    .filter((entry): entry is FormSelectItem => entry !== null);
};

const getFallbackSelectedItems = (value: unknown): FormSelectItem[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeSelectItem(entry))
      .filter((entry): entry is FormSelectItem => entry !== null);
  }

  if (isObjectLike(value) && Array.isArray(value.items)) {
    return value.items
      .map((entry) => normalizeSelectItem(entry))
      .filter((entry): entry is FormSelectItem => entry !== null);
  }

  return [];
};

const resolveSelectedItem = (
  value: unknown,
  items: FormSelectItem[]
): FormSelectItem | null => {
  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }

  const key = getKeyString(value);

  if (key) {
    const matched = items.find((item) => item.id === key);
    if (matched) {
      return matched;
    }
  }

  if (value === null || value === undefined) {
    return null;
  }

  if (isObjectLike(value)) {
    const fallbackItem = normalizeSelectItem({
      ...value,
      id:
        key ??
        value.id ??
        value.value ??
        value.tagFQN ??
        value.fullyQualifiedName ??
        value.label ??
        value.name,
      value,
    });

    if (fallbackItem) {
      return fallbackItem;
    }
  }

  return normalizeSelectItem(value);
};

const resolveSelectedItems = (
  value: unknown,
  items: FormSelectItem[],
  props: FieldPropsMap
): FormSelectItem[] => {
  const sourceValue =
    value !== undefined &&
      value !== null &&
      (!Array.isArray(value) || value.length)
      ? value
      : props.selectedItems;

  if (Array.isArray(sourceValue)) {
    return sourceValue
      .map((entry) => resolveSelectedItem(entry, items))
      .filter((entry): entry is FormSelectItem => entry !== null);
  }

  const fallbackItems = getFallbackSelectedItems(sourceValue);

  if (fallbackItems.length) {
    return fallbackItems;
  }

  const item = resolveSelectedItem(sourceValue, items);

  return item ? [item] : [];
};

const isObjectSelection = (value: unknown) => {
  if (Array.isArray(value)) {
    const firstDefined = value.find(
      (entry) => entry !== undefined && entry !== null
    );

    return isObjectLike(firstDefined);
  }

  return isObjectLike(value);
};

const getItemOutputValue = (item: FormSelectItem, currentValue: unknown) => {
  if (isObjectSelection(currentValue)) {
    return isObjectLike(item.rawValue) ? item.rawValue : item;
  }

  return item.rawValue ?? item.id;
};

const composeArrayValue = (
  items: FormSelectItem[],
  currentValue: unknown
): unknown[] => items.map((item) => getItemOutputValue(item, currentValue));

const getMultipleSelectionValue = (
  type: FieldTypes,
  value: unknown,
  props: FieldPropsMap
) => {
  if (typeof props.multiple === 'boolean') {
    return props.multiple;
  }

  if (props.multiple !== undefined) {
    return true;
  }

  if (Array.isArray(value)) {
    return true;
  }

  return MULTIPLE_SELECTION_FIELD_TYPES.has(type);
};

const getDefaultAutocompleteItems = (items: FormSelectItem[]) =>
  items.map((item) => (
    <Autocomplete.Item
      avatarUrl={item.avatarUrl}
      icon={item.icon}
      id={item.id}
      isDisabled={item.isDisabled}
      key={item.id}
      label={item.label}
      supportingText={item.supportingText}
    />
  ));

const getInputAriaLabel = (label: ReactNode, placeholder?: string) =>
  typeof label === 'string' ? label : placeholder;

const getFieldDataTestId = (props: FieldPropsMap) =>
  typeof props['data-testid'] === 'string' ? props['data-testid'] : undefined;

const isDisabledField = (props: FieldPropsMap) =>
  props.disabled === true || props.isDisabled === true;

const getNormalizedHexValue = (value: unknown) =>
  typeof value === 'string' ? normalizeHexColor(value) : null;

const looksLikeImageSource = (value: string) => {
  if (!value) {
    return false;
  }

  if (value.startsWith('data:image/')) {
    return true;
  }

  if (value.startsWith('/')) {
    return true;
  }

  if (/\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(value)) {
    return true;
  }

  try {
    const parsedUrl = new URL(value);

    return ['http:', 'https:'].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
};

const renderSelectItemIcon = (
  icon: FormSelectItem['icon'],
  className: string,
  {
    size = 20,
    style,
  }: {
    size?: number;
    style?: CSSProperties;
  } = {}
) => {
  if (isReactComponent(icon)) {
    return createElement(icon, {
      'aria-hidden': true,
      className,
      size,
      style,
    });
  }

  return isValidElement(icon) ? icon : null;
};

const getDefaultIconPreview = (
  items: FormSelectItem[],
  props: FieldPropsMap
): ReactNode => {
  const defaultIcon = props.defaultIcon;

  if (
    isObjectLike(defaultIcon) &&
    'component' in defaultIcon &&
    isReactComponent(defaultIcon.component)
  ) {
    const Icon = defaultIcon.component;

    return (
      <Icon
        aria-hidden="true"
        className="tw:size-5 tw:text-white"
        size={20}
        style={{ color: 'white', display: 'block', strokeWidth: 1.25 }}
      />
    );
  }

  return renderSelectItemIcon(items[0]?.icon, 'tw:size-5 tw:text-white', {
    size: 20,
    style: { color: 'white', display: 'block', strokeWidth: 1.25 },
  });
};

interface ColorPickerFieldProps {
  ariaLabel?: string;
  field: ControlledField;
  id?: string;
  onBlur?: (...args: unknown[]) => void;
  onChange?: (...args: unknown[]) => void;
  props: FieldPropsMap;
}

const ColorPickerField = ({
  ariaLabel,
  field,
  id,
  onBlur,
  onChange,
  props,
}: ColorPickerFieldProps) => {
  const normalizedValue = getNormalizedHexValue(field.value);
  const colorOptions = (
    Array.isArray(props.colors) ? props.colors : DEFAULT_COLOR_OPTIONS
  )
    .map((color) =>
      typeof color === 'string' ? normalizeHexColor(color) : null
    )
    .filter((color): color is string => Boolean(color));
  const palette = [...colorOptions];
  const dataTestId = getFieldDataTestId(props);
  const isDisabled = isDisabledField(props);

  if (
    normalizedValue &&
    !palette.some(
      (color) => color.toLowerCase() === normalizedValue.toLowerCase()
    )
  ) {
    palette.push(normalizedValue);
  }

  return (
    <div
      className="tw:flex tw:flex-wrap tw:gap-1.5"
      data-testid={dataTestId}
      role="group">
      {palette.map((color, index) => {
        const isSelected =
          normalizedValue?.toLowerCase() === color.toLowerCase();

        return (
          <button
            aria-label={`Select color ${color}`}
            aria-pressed={isSelected}
            className={cx(
              'tw:flex tw:h-[34px] tw:w-[34px] tw:items-center tw:justify-center tw:rounded-[10px] tw:shadow-xs tw:outline-hidden tw:transition tw:duration-150',
              !isDisabled && 'tw:cursor-pointer tw:hover:scale-[1.02]',
              isDisabled && 'tw:cursor-not-allowed tw:opacity-50',
              isSelected && 'tw:ring-2 tw:ring-white tw:ring-offset-2',
              !isSelected && 'tw:ring-1 tw:ring-black/5',
              'tw:focus-visible:ring-2 tw:focus-visible:ring-brand tw:focus-visible:ring-offset-2'
            )}
            data-testid={dataTestId ? `${dataTestId}-${index}` : undefined}
            disabled={isDisabled}
            id={index === 0 ? id : undefined}
            key={color}
            style={{
              backgroundColor: color,
              boxShadow: isSelected
                ? '0 0 0 1px rgba(16, 24, 40, 0.08)'
                : undefined,
            }}
            type="button"
            onBlur={(event) => {
              field.onBlur();
              onBlur?.(event);
            }}
            onClick={() => {
              field.onBlur();
              field.onChange(color);
              onChange?.(color);
            }}>
            {isSelected && (
              <Check aria-hidden="true" className="tw:size-5 tw:text-white" />
            )}
          </button>
        );
      })}

      {!palette.length && (
        <span
          aria-label={ariaLabel}
          className="tw:text-sm tw:text-tertiary"
          id={id}>
          No colors available
        </span>
      )}
    </div>
  );
};

interface IconPickerFieldProps {
  ariaLabel?: string;
  field: ControlledField;
  id?: string;
  items: FormSelectItem[];
  onBlur?: (...args: unknown[]) => void;
  onChange?: (...args: unknown[]) => void;
  onSelectionChange?: (key: Key | null) => void;
  placeholder?: string;
  props: FieldPropsMap;
}

const IconPickerField = ({
  ariaLabel,
  field,
  id,
  items,
  onBlur,
  onChange,
  onSelectionChange,
  placeholder,
  props,
}: IconPickerFieldProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'icons' | 'url'>('icons');
  const allowUrl = props.allowUrl === true;
  const dataTestId = getFieldDataTestId(props);
  const isDisabled = isDisabledField(props);
  const selectedItem = resolveSelectedItem(field.value, items);
  const backgroundColor =
    getNormalizedHexValue(props.backgroundColor) ?? DEFAULT_COLOR_OPTIONS[6];
  const rawValue = typeof field.value === 'string' ? field.value : '';
  const hasCustomImage = allowUrl && rawValue !== '' && !selectedItem;
  const filteredItems = useMemo(() => {
    return items;
  }, [items]);

  useEffect(() => {
    if (!isOpen) {
      setActiveTab(allowUrl && hasCustomImage ? 'url' : 'icons');
    }
  }, [allowUrl, hasCustomImage, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        field.onBlur();
        onBlur?.(event);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        field.onBlur();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [field, isOpen, onBlur]);

  const handleIconSelection = (item: FormSelectItem) => {
    const nextValue = getItemOutputValue(item, field.value);

    field.onBlur();
    field.onChange(nextValue);
    onChange?.(nextValue);
    onSelectionChange?.(item.id);
    setIsOpen(false);
  };

  const triggerPreview = (() => {
    if (selectedItem) {
      return renderSelectItemIcon(
        selectedItem.icon,
        'tw:size-5 tw:text-white',
        {
          size: 20,
          style: { color: 'white', display: 'block', strokeWidth: 1.25 },
        }
      );
    }

    if (hasCustomImage && looksLikeImageSource(rawValue)) {
      return (
        <img
          alt=""
          className="tw:h-7 tw:w-7 tw:rounded-sm tw:object-contain"
          src={rawValue}
        />
      );
    }

    return (
      getDefaultIconPreview(items, props) ?? (
        <span className="tw:text-sm tw:font-semibold tw:text-white">?</span>
      )
    );
  })();

  const togglePicker = () => {
    if (isDisabled) {
      return;
    }

    setActiveTab(allowUrl && hasCustomImage ? 'url' : 'icons');
    setIsOpen((current) => !current);
  };

  const iconGrid = (
    <div className="tw:p-4">
      {filteredItems.length > 0 ? (
        <div className="tw:grid tw:grid-cols-6 tw:gap-3">
          {filteredItems.map((item) => {
            const isSelected = selectedItem?.id === item.id;
            const previewIcon = renderSelectItemIcon(
              item.icon,
              'tw:size-5 tw:text-primary',
              {
                size: 20,
                style: {
                  color: 'currentColor',
                  display: 'block',
                  strokeWidth: 1.25,
                },
              }
            );

            return (
              <button
                aria-label={item.label ?? item.id}
                aria-pressed={isSelected}
                className={cx(
                  'tw:flex tw:h-9 tw:w-9 tw:items-center tw:justify-center tw:rounded-lg tw:outline-hidden tw:transition tw:duration-150',
                  'tw:ring-1 tw:ring-secondary_alt',
                  isSelected
                    ? 'tw:bg-primary_hover tw:ring-brand'
                    : 'tw:bg-primary tw:hover:bg-primary_hover',
                  'tw:focus-visible:ring-2 tw:focus-visible:ring-brand'
                )}
                key={item.id}
                type="button"
                onClick={() => handleIconSelection(item)}>
                {previewIcon ?? (
                  <span className="tw:text-sm tw:font-semibold tw:text-primary">
                    {(item.label ?? item.id).slice(0, 1).toUpperCase()}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <span className="tw:text-sm tw:text-tertiary">No icons available</span>
      )}
    </div>
  );

  const urlPanel = (
    <div className="tw:flex tw:flex-col tw:gap-2 tw:p-4">
      <span className="tw:text-xs tw:font-medium tw:text-tertiary">
        Custom icon URL
      </span>
      <Input
        aria-label={placeholder ?? 'Enter icon URL'}
        autoFocus
        name={field.name}
        placeholder={placeholder ?? 'Enter icon URL'}
        value={selectedItem ? '' : rawValue}
        onBlur={(...args) => {
          field.onBlur();
          onBlur?.(...args);
        }}
        onChange={(value) => {
          field.onChange(value);
          onChange?.(value);
        }}
      />
    </div>
  );

  return (
    <div className="tw:relative tw:w-fit" ref={wrapperRef}>
      <button
        aria-label={ariaLabel ?? placeholder ?? 'Select icon'}
        className={cx(
          'tw:flex tw:h-[34px] tw:w-[34px] tw:items-center tw:justify-center tw:rounded-[10px] tw:shadow-xs tw:outline-hidden tw:transition tw:duration-150',
          !isDisabled && 'tw:cursor-pointer tw:hover:scale-[1.02]',
          isDisabled && 'tw:cursor-not-allowed tw:opacity-50',
          'tw:ring-1 tw:ring-black/5 tw:focus-visible:ring-2 tw:focus-visible:ring-brand tw:focus-visible:ring-offset-2',
          isOpen && 'tw:ring-2 tw:ring-brand tw:ring-offset-2'
        )}
        data-testid={dataTestId}
        disabled={isDisabled}
        id={id}
        style={{ backgroundColor }}
        type="button"
        onClick={togglePicker}
        onBlur={(event) => {
          field.onBlur();
          onBlur?.(event);
        }}
        onKeyDown={(event) => {
          if (!isDisabled && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            togglePicker();
          }
        }}>
        {triggerPreview}
      </button>

      {isOpen && (
        <div className="tw:absolute tw:top-[calc(100%+8px)] tw:left-0 tw:z-50 tw:w-[18rem] tw:max-w-[calc(100vw-2rem)] tw:rounded-xl tw:bg-primary tw:shadow-lg tw:ring-1 tw:ring-secondary_alt">
          {allowUrl ? (
            <Tabs
              selectedKey={activeTab}
              onSelectionChange={(key) =>
                setActiveTab(String(key) as 'icons' | 'url')
              }>
              <Tabs.List
                fullWidth
                size="sm"
                type="button-minimal"
                className="tw:border-b tw:border-secondary_alt tw:p-1">
                <Tabs.Item id="icons" label="Icons" />
                <Tabs.Item id="url" label="URL" />
              </Tabs.List>
              <Tabs.Panel id="icons">{iconGrid}</Tabs.Panel>
              <Tabs.Panel id="url">{urlPanel}</Tabs.Panel>
            </Tabs>
          ) : (
            iconGrid
          )}
        </div>
      )}
    </div>
  );
};

const renderFieldElement = (
  controller: UseControllerReturn,
  fieldConfig: FieldProp
): ReactNode => {
  const { field, fieldState } = controller;
  const { type, id, label, placeholder, props = {} } = fieldConfig;
  const {
    children,
    renderItem,
    onChange,
    onBlur,
    onSelectionChange,
    onItemInserted,
    onItemCleared,
    onSearchChange,
    onSelect,
    selectedItems: _selectedItems,
    options: _options,
    items: _items,
    multiple: _multiple,
    ...rest
  } = props as FieldPropsMap & {
    renderItem?: (item: FormSelectItem) => ReactNode;
    onChange?: (...args: unknown[]) => void;
    onBlur?: (...args: unknown[]) => void;
    onSelectionChange?: (key: Key | null) => void;
    onItemInserted?: (key: Key) => void;
    onItemCleared?: (key: Key) => void;
    onSearchChange?: (value: string) => void;
    onSelect?: (files: FileList | null) => void;
  };
  const isInvalid = fieldState.invalid;
  const ariaLabel = getInputAriaLabel(label, placeholder);
  const selectItems = getSelectItems(props);

  if (AUTOCOMPLETE_FIELD_TYPES.has(type)) {
    const multiple = getMultipleSelectionValue(type, field.value, props);
    const selectedAutocompleteItems = resolveSelectedItems(
      field.value,
      selectItems,
      props
    );

    const handleInsert = (key: Key) => {
      const selectedItem = selectItems.find((item) => item.id === String(key));

      if (!selectedItem) {
        return;
      }

      const nextItems = multiple
        ? [...selectedAutocompleteItems, selectedItem]
        : [selectedItem];

      field.onChange(
        multiple
          ? composeArrayValue(nextItems, field.value)
          : getItemOutputValue(selectedItem, field.value)
      );
      onItemInserted?.(key);
    };

    const handleClear = (key: Key) => {
      const nextItems = selectedAutocompleteItems.filter(
        (item) => item.id !== String(key)
      );

      field.onChange(
        multiple ? composeArrayValue(nextItems, field.value) : null
      );
      onItemCleared?.(key);
    };

    return (
      <Autocomplete
        aria-label={ariaLabel}
        id={id}
        isInvalid={isInvalid}
        items={selectItems}
        multiple={multiple}
        placeholder={placeholder}
        selectedItems={selectedAutocompleteItems}
        {...rest}
        onItemCleared={handleClear}
        onItemInserted={handleInsert}
        onSearchChange={onSearchChange}>
        {typeof renderItem === 'function'
          ? selectItems.map((item) => renderItem(item))
          : getDefaultAutocompleteItems(selectItems)}
      </Autocomplete>
    );
  }

  switch (type) {
    case FieldTypes.TEXT:
      return (
        <Input
          aria-label={ariaLabel}
          id={id}
          isInvalid={isInvalid}
          name={field.name}
          placeholder={placeholder}
          value={field.value ?? ''}
          {...rest}
          onBlur={(...args) => {
            field.onBlur();
            onBlur?.(...args);
          }}
          onChange={(value) => {
            field.onChange(value);
            onChange?.(value);
          }}
        />
      );

    case FieldTypes.PASSWORD:
      return (
        <Input
          aria-label={ariaLabel}
          autoComplete="off"
          id={id}
          isInvalid={isInvalid}
          name={field.name}
          placeholder={placeholder}
          type="password"
          value={field.value ?? ''}
          {...rest}
          onBlur={(...args) => {
            field.onBlur();
            onBlur?.(...args);
          }}
          onChange={(value) => {
            field.onChange(value);
            onChange?.(value);
          }}
        />
      );

    case FieldTypes.NUMBER:
      return (
        <Input
          aria-label={ariaLabel}
          id={id}
          isInvalid={isInvalid}
          name={field.name}
          placeholder={placeholder}
          type="number"
          value={field.value ?? ''}
          {...rest}
          onBlur={(...args) => {
            field.onBlur();
            onBlur?.(...args);
          }}
          onChange={(value) => {
            field.onChange(value);
            onChange?.(value);
          }}
        />
      );

    case FieldTypes.TEXTAREA:
    case FieldTypes.DESCRIPTION:
      return (
        <TextArea
          aria-label={ariaLabel}
          id={id}
          isInvalid={isInvalid}
          name={field.name}
          placeholder={placeholder}
          rows={4}
          value={field.value ?? props.initialValue ?? ''}
          {...rest}
          onBlur={(...args) => {
            field.onBlur();
            onBlur?.(...args);
          }}
          onChange={(value) => {
            field.onChange(value);
            onChange?.(value);
          }}
        />
      );

    case FieldTypes.FILTER_PATTERN:
    case FieldTypes.CRON_EDITOR:
      return (
        <TextArea
          aria-label={ariaLabel}
          id={id}
          isInvalid={isInvalid}
          name={field.name}
          placeholder={placeholder}
          rows={4}
          textAreaClassName="tw:font-mono"
          value={field.value ?? props.initialValue ?? ''}
          {...rest}
          onBlur={(...args) => {
            field.onBlur();
            onBlur?.(...args);
          }}
          onChange={(value) => {
            field.onChange(value);
            onChange?.(value);
          }}
        />
      );

    case FieldTypes.SWITCH:
      return (
        <Toggle
          aria-label={ariaLabel}
          id={id}
          isSelected={field.value ?? false}
          name={field.name}
          {...rest}
          onBlur={(...args) => {
            field.onBlur();
            onBlur?.(...args);
          }}
          onChange={(value) => {
            field.onChange(value);
            onChange?.(value);
          }}
        />
      );

    case FieldTypes.CHECKBOX:
      return (
        <Checkbox
          aria-label={ariaLabel}
          id={id}
          isInvalid={isInvalid}
          isSelected={field.value ?? false}
          name={field.name}
          {...rest}
          onBlur={(...args) => {
            field.onBlur();
            onBlur?.(...args);
          }}
          onChange={(value) => {
            field.onChange(value);
            onChange?.(value);
          }}
        />
      );

    case FieldTypes.SLIDER:
      return (
        <Slider
          id={id}
          value={field.value ?? 0}
          {...rest}
          onChange={(value) => {
            field.onChange(value);
            onChange?.(value);
          }}
        />
      );

    case FieldTypes.COLOR_PICKER: {
      return (
        <ColorPickerField
          ariaLabel={ariaLabel}
          field={field}
          id={id}
          onBlur={onBlur}
          onChange={onChange}
          props={props}
        />
      );
    }

    case FieldTypes.SELECT_NATIVE: {
      const selectedItem = resolveSelectedItem(field.value, selectItems);

      return (
        <NativeSelect
          aria-label={ariaLabel}
          id={id}
          name={field.name}
          options={selectItems.map((item) => ({
            label: item.label ?? item.id,
            value: item.id,
            disabled: item.isDisabled,
          }))}
          value={selectedItem?.id ?? ''}
          {...rest}
          onBlur={(event) => {
            field.onBlur();
            onBlur?.(event);
          }}
          onChange={(event) => {
            const nextItem = selectItems.find(
              (item) => item.id === event.target.value
            );

            field.onChange(
              nextItem ? getItemOutputValue(nextItem, field.value) : null
            );
            onChange?.(event);
          }}
        />
      );
    }

    case FieldTypes.SELECT: {
      const selectedItem = resolveSelectedItem(field.value, selectItems);

      return (
        <Select
          aria-label={ariaLabel}
          id={id}
          isInvalid={isInvalid}
          items={selectItems}
          name={field.name}
          placeholder={placeholder}
          selectedKey={selectedItem?.id ?? null}
          {...rest}
          onSelectionChange={(key) => {
            const nextItem = selectItems.find(
              (item) => item.id === String(key)
            );

            field.onChange(
              nextItem ? getItemOutputValue(nextItem, field.value) : null
            );
            onSelectionChange?.(key);
          }}>
          {(item) => (
            <Select.Item
              avatarUrl={item.avatarUrl}
              icon={item.icon}
              id={item.id}
              isDisabled={item.isDisabled}
              supportingText={item.supportingText}>
              {item.label}
            </Select.Item>
          )}
        </Select>
      );
    }

    case FieldTypes.ICON_PICKER:
      return (
        <IconPickerField
          ariaLabel={ariaLabel}
          field={field}
          id={id}
          items={selectItems}
          placeholder={placeholder}
          props={props}
          onBlur={onBlur}
          onChange={onChange}
          onSelectionChange={onSelectionChange}
        />
      );

    case FieldTypes.COVER_IMAGE_UPLOAD: {
      const allowsMultiple =
        typeof props.allowsMultiple === 'boolean'
          ? props.allowsMultiple
          : false;

      return (
        <div className="tw:flex tw:flex-col tw:gap-2">
          <FileTrigger
            acceptDirectory={Boolean(props.acceptDirectory)}
            acceptedFileTypes={
              Array.isArray(props.acceptedFileTypes)
                ? (props.acceptedFileTypes as string[])
                : undefined
            }
            allowsMultiple={allowsMultiple}
            defaultCamera={
              props.defaultCamera === 'environment' ||
                props.defaultCamera === 'user'
                ? props.defaultCamera
                : undefined
            }
            onSelect={(files) => {
              const nextValue = allowsMultiple
                ? Array.from(files ?? [])
                : files?.[0]
                  ? { file: files[0] }
                  : null;

              field.onChange(nextValue);
              onSelect?.(files);
            }}>
            {isValidElement(children) ? (
              children
            ) : (
              <Button color="secondary" type="button">
                {placeholder ?? 'Upload file'}
              </Button>
            )}
          </FileTrigger>

          {isFileValue(field.value) && <HintText>{field.value.name}</HintText>}
          {isObjectLike(field.value) &&
            'file' in field.value &&
            isFileValue(field.value.file) && (
              <HintText>{field.value.file.name}</HintText>
            )}
          {Array.isArray(field.value) &&
            field.value.length > 0 &&
            field.value.every((item) => isFileValue(item)) && (
              <HintText>
                {field.value
                  .filter((item): item is File => isFileValue(item))
                  .map((item) => item.name)
                  .join(', ')}
              </HintText>
            )}
        </div>
      );
    }

    case FieldTypes.COMPONENT:
      return children;

    default:
      return children;
  }
};

export const Field: FC<{ field: FieldProp }> = ({ field }) => {
  const { control } = useFormContext();
  const {
    name,
    label,
    required,
    rules,
    id,
    helperText,
    helperTextType = HelperTextType.ALERT,
    hasSeparator = false,
    isBeta = false,
  } = field;

  const effectiveRules: RegisterOptions = { ...rules };
  if (required && !effectiveRules.required) {
    effectiveRules.required = `${typeof label === 'string' ? label : name
      } is required`;
  }

  return (
    <FormField control={control} name={name} rules={effectiveRules}>
      {(controller) => {
        const { fieldState } = controller;

        return (
          <Fragment key={id}>
            <div className="tw:flex tw:flex-col tw:gap-[6px]">
              <FormItemLabel
                isBeta={isBeta}
                label={label}
                required={required}
                tooltip={
                  helperTextType === HelperTextType.TOOLTIP
                    ? helperText
                    : undefined
                }
              />

              {renderFieldElement(controller, field)}
            </div>

            {fieldState.error && (
              <HintText isInvalid>{fieldState.error.message}</HintText>
            )}

            {helperTextType === HelperTextType.ALERT && helperText && (
              <Alert
                data-testid="form-item-alert"
                title={typeof helperText === 'string' ? helperText : ''}
                variant="warning"
              />
            )}

            {hasSeparator && <Divider />}
          </Fragment>
        );
      }}
    </FormField>
  );
};

Field.displayName = 'Field';

export const getField = (fieldProp: FieldProp): ReactNode => (
  <Field field={fieldProp} />
);

export const FormFields: FC<{ fields: FieldProp[] }> = ({ fields }) => (
  <>
    {fields.map((f, i) => (
      <Field field={f} key={f.id ?? f.name ?? i} />
    ))}
  </>
);

FormFields.displayName = 'FormFields';
