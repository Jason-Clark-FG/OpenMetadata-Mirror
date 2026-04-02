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
import { createElement, isValidElement, useEffect, useMemo, useRef, useState } from 'react';
import type { Key } from 'react-aria-components';
import { normalizeHexColor } from '@/colors/colorValidation';
import { Tabs } from '@/components/application/tabs/tabs';
import { Input } from '@/components/base/input/input';
import { cx } from '@/utils/cx';
import { isReactComponent } from '@/utils/is-react-component';
import type { FormSelectItem } from '../form-field.types';
import { DEFAULT_COLOR_OPTIONS } from './color-picker-field';

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

const ICON_STYLE: CSSProperties = { color: 'white', display: 'block', strokeWidth: 1.25 };

const getDefaultIconPreview = (
  items: FormSelectItem[],
  defaultIcon?: { component: FC }
): ReactNode => {
  if (defaultIcon && isReactComponent(defaultIcon.component)) {
    return renderSelectItemIcon(
      defaultIcon.component,
      'tw:size-5 tw:text-white',
      { size: 20, style: ICON_STYLE }
    );
  }

  return renderSelectItemIcon(items[0]?.icon, 'tw:size-5 tw:text-white', {
    size: 20,
    style: ICON_STYLE,
  });
};

export interface IconPickerFieldProps {
  allowUrl?: boolean;
  ariaLabel?: string;
  backgroundColor?: string;
  'data-testid'?: string;
  defaultIcon?: { component: FC };
  disabled?: boolean;
  id?: string;
  items: FormSelectItem[];
  name: string;
  onBlur?: () => void;
  onChange?: (value: string) => void;
  onSelectionChange?: (key: Key | null) => void;
  placeholder?: string;
  value: string;
}

export const IconPickerField = ({
  allowUrl = false,
  ariaLabel,
  backgroundColor: backgroundColorProp,
  'data-testid': dataTestId,
  defaultIcon,
  disabled = false,
  id,
  items,
  name,
  onBlur,
  onChange,
  onSelectionChange,
  placeholder,
  value,
}: IconPickerFieldProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'icons' | 'url'>('icons');
  const selectedItem = items.find((item) => item.id === value);
  const backgroundColor =
    (backgroundColorProp ? normalizeHexColor(backgroundColorProp) : null) ??
    DEFAULT_COLOR_OPTIONS[6];
  const hasCustomImage = allowUrl && value !== '' && !selectedItem;
  const filteredItems = useMemo(() => items, [items]);

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
      if (
        event.target instanceof Node &&
        !wrapperRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
        onBlur?.();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        onBlur?.();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onBlur]);

  const handleIconSelection = (item: FormSelectItem) => {
    onBlur?.();
    onChange?.(item.id);
    onSelectionChange?.(item.id);
    setIsOpen(false);
  };

  const triggerPreview = (() => {
    if (selectedItem) {
      return renderSelectItemIcon(
        selectedItem.icon,
        'tw:size-5 tw:text-white',
        { size: 20, style: ICON_STYLE }
      );
    }

    if (hasCustomImage && looksLikeImageSource(value)) {
      return (
        <img
          alt=""
          className="tw:h-7 tw:w-7 tw:rounded-sm tw:object-contain"
          src={value}
        />
      );
    }

    return (
      getDefaultIconPreview(items, defaultIcon) ?? (
        <span className="tw:text-sm tw:font-semibold tw:text-white">?</span>
      )
    );
  })();

  const togglePicker = () => {
    if (disabled) {
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
        autoFocus
        aria-label={placeholder ?? 'Enter icon URL'}
        name={name}
        placeholder={placeholder ?? 'Enter icon URL'}
        value={selectedItem ? '' : value}
        onBlur={() => onBlur?.()}
        onChange={(v) => onChange?.(v)}
      />
    </div>
  );

  return (
    <div className="tw:relative tw:w-fit" ref={wrapperRef}>
      <button
        aria-label={ariaLabel ?? placeholder ?? 'Select icon'}
        className={cx(
          'tw:flex tw:h-[34px] tw:w-[34px] tw:items-center tw:justify-center tw:rounded-[10px] tw:shadow-xs tw:outline-hidden tw:transition tw:duration-150',
          !disabled && 'tw:cursor-pointer tw:hover:scale-[1.02]',
          disabled && 'tw:cursor-not-allowed tw:opacity-50',
          'tw:ring-1 tw:ring-black/5 tw:focus-visible:ring-2 tw:focus-visible:ring-brand tw:focus-visible:ring-offset-2',
          isOpen && 'tw:ring-2 tw:ring-brand tw:ring-offset-2'
        )}
        data-testid={dataTestId}
        disabled={disabled}
        id={id}
        style={{ backgroundColor }}
        type="button"
        onBlur={() => onBlur?.()}
        onClick={togglePicker}
        onKeyDown={(event) => {
          if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
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
                setActiveTab(key === 'url' ? 'url' : 'icons')
              }>
              <Tabs.List
                fullWidth
                className="tw:border-b tw:border-secondary_alt tw:p-1"
                size="sm"
                type="button-minimal">
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
