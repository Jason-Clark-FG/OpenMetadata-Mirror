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
import {
  colGapClassMapping,
  gapClassMapping,
  rowGapClassMapping,
} from '@/constants/tailwindClasses.constants';
import { cx } from '@/utils/cx';
import type { HTMLAttributes, ReactNode } from 'react';

type Direction = 'row' | 'col' | 'row-reverse' | 'col-reverse';
type Align = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
type Justify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
type Wrap = 'wrap' | 'nowrap' | 'wrap-reverse';

const DIRECTION_CLASS: Record<Direction, string> = {
  row: 'tw:flex-row',
  col: 'tw:flex-col',
  'row-reverse': 'tw:flex-row-reverse',
  'col-reverse': 'tw:flex-col-reverse',
};

const ALIGN_CLASS: Record<Align, string> = {
  start: 'tw:items-start',
  center: 'tw:items-center',
  end: 'tw:items-end',
  stretch: 'tw:items-stretch',
  baseline: 'tw:items-baseline',
};

const JUSTIFY_CLASS: Record<Justify, string> = {
  start: 'tw:justify-start',
  center: 'tw:justify-center',
  end: 'tw:justify-end',
  between: 'tw:justify-between',
  around: 'tw:justify-around',
  evenly: 'tw:justify-evenly',
};

const WRAP_CLASS: Record<Wrap, string> = {
  wrap: 'tw:flex-wrap',
  nowrap: 'tw:flex-nowrap',
  'wrap-reverse': 'tw:flex-wrap-reverse',
};

export interface BoxProps extends HTMLAttributes<HTMLDivElement> {
  direction?: Direction;
  align?: Align;
  justify?: Justify;
  wrap?: Wrap;
  gap?: number | string;
  rowGap?: number | string;
  colGap?: number | string;
  inline?: boolean;
  children?: ReactNode;
}

export const Box = ({
  direction,
  align,
  justify,
  wrap,
  gap,
  rowGap,
  colGap,
  inline,
  className,
  children,
  ...props
}: BoxProps) => {
  let gapValue;
  let rowGapValue;
  let colGapValue;

  if (typeof gap === 'number') {
    gapValue = gapClassMapping[gap];
  } else if (typeof gap === 'string') {
    gapValue = `tw:gap-[${gap}]`;
  }

  if (typeof rowGap === 'number') {
    rowGapValue = rowGapClassMapping[rowGap];
  } else if (typeof rowGap === 'string') {
    rowGapValue = `tw:gap-y-[${rowGap}]`;
  }

  if (typeof colGap === 'number') {
    colGapValue = colGapClassMapping[colGap];
  } else if (typeof colGap === 'string') {
    colGapValue = `tw:gap-x-[${colGap}]`;
  }

  return (
    <div
      {...props}
      className={cx(
        inline ? 'tw:inline-flex' : 'tw:flex',
        direction ? DIRECTION_CLASS[direction] : undefined,
        align ? ALIGN_CLASS[align] : undefined,
        justify ? JUSTIFY_CLASS[justify] : undefined,
        wrap ? WRAP_CLASS[wrap] : undefined,
        gapValue,
        rowGapValue,
        colGapValue,
        className,
      )}>
      {children}
    </div>
  );
};

Box.displayName = 'Box';
