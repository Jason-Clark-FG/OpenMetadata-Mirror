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

import { Typography } from '@openmetadata/ui-core-components';
import { isUndefined } from 'lodash';
import { FC, ReactNode, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import StatusBadge from '../../../../common/StatusBadge/StatusBadge.component';
import { StatusType } from '../../../../common/StatusBadge/StatusBadge.interface';
import { TOOLTIP_STYLES } from './DimensionalityHeatmap.constants';
import { HeatmapCellData } from './DimensionalityHeatmap.interface';
import { getStatusLabel } from './DimensionalityHeatmap.utils';

interface TooltipRowProps {
  label: string;
  value: ReactNode;
}

const TooltipRow: FC<TooltipRowProps> = ({ label, value }) => {
  return (
    <div
      className="tw:flex tw:items-center tw:justify-between tw:gap-5"
      style={{ fontSize: TOOLTIP_STYLES.CONTENT_FONT_SIZE }}>
      <Typography as="span" className="tw:whitespace-nowrap tw:text-gray-700">
        {label}
      </Typography>
      <Typography as="span" className="tw:font-medium tw:text-gray-900">
        {value}
      </Typography>
    </div>
  );
};

interface HeatmapCellTooltipProps {
  cell: HeatmapCellData;
}

export const HeatmapCellTooltip: FC<HeatmapCellTooltipProps> = ({ cell }) => {
  const { t } = useTranslation();

  const rows = useMemo(
    () => [
      {
        key: 'dimensionValue',
        label: t('label.dimension-value'),
        value: cell.dimensionValue,
      },
      {
        key: 'status',
        label: t('label.status'),
        value: (
          <StatusBadge
            dataTestId="status-badge"
            label={getStatusLabel(cell.status, t)}
            status={cell.status as StatusType}
          />
        ),
      },
      {
        key: 'passedRows',
        label: t('label.passed-rows'),
        value: cell.result?.passedRows,
      },
      {
        key: 'failedRows',
        label: t('label.failed-rows'),
        value: cell.result?.failedRows,
      },
      {
        key: 'impactScore',
        label: t('label.impact-score'),
        value: cell.result?.impactScore?.toFixed(2),
      },
    ],
    [cell, t]
  );

  return (
    <div
      className="tw:rounded-lg tw:bg-white tw:shadow-sm"
      style={{ padding: TOOLTIP_STYLES.CARD_PADDING }}>
      <Typography
        as="span"
        className="tw:block tw:text-gray-900 tw:font-medium"
        style={{ fontSize: TOOLTIP_STYLES.HEADER_FONT_SIZE }}>
        {cell.date}
      </Typography>
      <div
        aria-hidden
        className="tw:my-2 tw:border-b tw:border-dashed tw:border-gray-300"
        role="separator"
        style={{
          marginTop: TOOLTIP_STYLES.DIVIDER_MARGIN,
          marginBottom: TOOLTIP_STYLES.DIVIDER_MARGIN,
        }}
      />
      <div
        className="tw:flex tw:flex-col tw:gap-2"
        style={{ gap: TOOLTIP_STYLES.STACK_SPACING }}>
        {rows.map(
          (row) =>
            !isUndefined(row.value) && (
              <TooltipRow key={row.key} label={row.label} value={row.value} />
            )
        )}
        {cell.result?.testResultValue &&
          cell.result.testResultValue.length > 0 &&
          cell.result.testResultValue.map((resultValue, index) => (
            <TooltipRow
              key={`result-value-${index}`}
              label={resultValue.name || t('label.value')}
              value={resultValue.value || '-'}
            />
          ))}
      </div>
    </div>
  );
};
