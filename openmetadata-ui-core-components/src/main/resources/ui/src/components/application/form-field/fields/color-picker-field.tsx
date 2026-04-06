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

import { Check } from '@untitledui/icons';
import { normalizeHexColor } from '@/colors/colorValidation';
import { cx } from '@/utils/cx';

export const DEFAULT_COLOR_OPTIONS = [
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

export interface ColorPickerFieldProps {
  ariaLabel?: string;
  colors?: string[];
  'data-testid'?: string;
  disabled?: boolean;
  emptyStateLabel?: string;
  id?: string;
  onBlur?: () => void;
  onChange?: (value: string) => void;
  value: string;
}

export const ColorPickerField = ({
  ariaLabel,
  colors,
  'data-testid': dataTestId,
  disabled = false,
  emptyStateLabel,
  id,
  onBlur,
  onChange,
  value,
}: ColorPickerFieldProps) => {
  const normalizedValue = normalizeHexColor(value);
  const colorOptions = (
    Array.isArray(colors) ? colors : DEFAULT_COLOR_OPTIONS
  )
    .map((color) => normalizeHexColor(color))
    .filter((color): color is string => Boolean(color));
  const palette = [...colorOptions];

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
              !disabled && 'tw:cursor-pointer tw:hover:scale-[1.02]',
              disabled && 'tw:cursor-not-allowed tw:opacity-50',
              isSelected && 'tw:ring-2 tw:ring-white tw:ring-offset-2',
              !isSelected && 'tw:ring-1 tw:ring-black/5',
              'tw:focus-visible:ring-2 tw:focus-visible:ring-brand tw:focus-visible:ring-offset-2'
            )}
            data-testid={dataTestId ? `${dataTestId}-${index}` : undefined}
            disabled={disabled}
            id={index === 0 ? id : undefined}
            key={color}
            style={{
              backgroundColor: color,
              boxShadow: isSelected
                ? '0 0 0 1px rgba(16, 24, 40, 0.08)'
                : undefined,
            }}
            type="button"
            onBlur={() => onBlur?.()}
            onClick={() => onChange?.(color)}>
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
          {emptyStateLabel ?? 'No colors available'}
        </span>
      )}
    </div>
  );
};
