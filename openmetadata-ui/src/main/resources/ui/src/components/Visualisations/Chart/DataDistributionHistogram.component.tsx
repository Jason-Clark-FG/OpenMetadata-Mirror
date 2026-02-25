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

import { isUndefined } from 'lodash';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CHART_BLUE_1,
  GREY_100,
  GREY_200,
} from '../../../constants/Color.constants';
import { GRAPH_BACKGROUND_COLOR } from '../../../constants/constants';
import { DEFAULT_HISTOGRAM_DATA } from '../../../constants/profiler.constant';
import { HistogramClass } from '../../../generated/entity/data/table';
import {
  axisTickFormatter,
  createHorizontalGridLineRenderer,
  tooltipFormatter,
} from '../../../utils/ChartUtils';
import { CustomDQTooltip } from '../../../utils/DataQuality/DataQualityUtils';
import { customFormatDateTime } from '../../../utils/date-time/DateTimeUtils';
import ErrorPlaceHolder from '../../common/ErrorWithPlaceholder/ErrorPlaceHolder';
import { DataDistributionHistogramProps } from './Chart.interface';

// Skew color theme constants (replaces theme.palette.allShades.success/error/info)
const SKEW_THEME = {
  success: { bg: '#DCFAE6', text: '#067647' },
  error: { bg: '#FEE4E2', text: '#912018' },
  info: { bg: '#EFF8FF', text: '#1849A9' },
};

const DataDistributionHistogram = ({
  data,
  noDataPlaceholderText,
}: DataDistributionHistogramProps) => {
  const { t } = useTranslation();

  const renderHorizontalGridLine = useMemo(
    () => createHorizontalGridLineRenderer(),
    []
  );

  const showSingleGraph =
    isUndefined(data.firstDayData?.histogram) ||
    isUndefined(data.currentDayData?.histogram);

  if (
    isUndefined(data.firstDayData?.histogram) &&
    isUndefined(data.currentDayData?.histogram)
  ) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <ErrorPlaceHolder placeholderText={noDataPlaceholderText} />
      </div>
    );
  }

  const dataEntries = Object.entries(data).filter(
    ([, columnProfile]) => !isUndefined(columnProfile?.histogram)
  );

  return (
    <div className="flex w-full" data-testid="chart-container">
      {dataEntries.map(([key, columnProfile], index) => {
        const histogramData =
          (columnProfile?.histogram as HistogramClass) ||
          DEFAULT_HISTOGRAM_DATA;

        const graphData = histogramData.frequencies?.map((frequency, i) => ({
          name: histogramData?.boundaries?.[i],
          frequency,
        }));

        const graphDate = customFormatDateTime(
          columnProfile?.timestamp || 0,
          'MMM dd, yyyy'
        );

        const skewTheme = columnProfile?.nonParametricSkew
          ? columnProfile?.nonParametricSkew > 0
            ? SKEW_THEME.success
            : SKEW_THEME.error
          : SKEW_THEME.info;

        const colStyle: React.CSSProperties = {
          flex: showSingleGraph ? '1 1 100%' : '1 1 50%',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: showSingleGraph ? 16 : 12,
          paddingRight: showSingleGraph ? 16 : 12,
          paddingTop: 8,
          paddingBottom: 8,
          borderRight:
            !showSingleGraph && index === 0 ? `1px solid ${GREY_200}` : 'none',
        };

        return (
          <div key={key} style={colStyle}>
            <div className="flex items-center justify-between mb-5">
              <span
                className="inline-block rounded-md px-3 py-1.5 text-sm font-semibold"
                style={{ backgroundColor: GREY_100, color: '#101828' }}>
                {graphDate}
              </span>
              <span
                className="inline-block rounded-md px-3 py-1.5 text-sm font-semibold"
                style={{
                  backgroundColor: skewTheme.bg,
                  color: skewTheme.text,
                }}>
                {`${t('label.skew')}: ${
                  columnProfile?.nonParametricSkew || '--'
                }`}
              </span>
            </div>
            <div style={{ flex: 1, minHeight: 350 }}>
              <ResponsiveContainer
                debounce={200}
                height="100%"
                id={`${key}-histogram`}
                width="100%">
                <BarChart
                  data={graphData}
                  margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <CartesianGrid
                    horizontal={renderHorizontalGridLine}
                    stroke={GRAPH_BACKGROUND_COLOR}
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    axisLine={false}
                    dataKey="name"
                    padding={{ left: 16, right: 16 }}
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDataOverflow
                    axisLine={false}
                    padding={{ top: 16, bottom: 16 }}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(props) => axisTickFormatter(props)}
                    tickLine={false}
                  />
                  <Legend />
                  <Tooltip
                    content={
                      <CustomDQTooltip
                        displayDateInHeader={false}
                        timeStampKey="name"
                        valueFormatter={(value) => tooltipFormatter(value)}
                      />
                    }
                    cursor={{
                      fill: GREY_100,
                      stroke: GREY_200,
                      strokeDasharray: '3 3',
                    }}
                  />
                  <Bar
                    barSize={22}
                    dataKey="frequency"
                    fill={CHART_BLUE_1}
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DataDistributionHistogram;
