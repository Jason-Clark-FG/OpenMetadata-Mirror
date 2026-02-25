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
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  TooltipProps,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CHART_BLUE_1,
  GREY_100,
  GREY_200,
} from '../../../constants/Color.constants';
import { GRAPH_BACKGROUND_COLOR } from '../../../constants/constants';
import { ColumnProfile } from '../../../generated/entity/data/table';
import {
  axisTickFormatter,
  createHorizontalGridLineRenderer,
  tooltipFormatter,
} from '../../../utils/ChartUtils';
import { customFormatDateTime } from '../../../utils/date-time/DateTimeUtils';
import ErrorPlaceHolder from '../../common/ErrorWithPlaceholder/ErrorPlaceHolder';

export interface CardinalityDistributionChartProps {
  data: {
    firstDayData?: ColumnProfile;
    currentDayData?: ColumnProfile;
  };
  noDataPlaceholderText?: string | React.ReactNode;
}

// Hardcoded theme color constants
const COLOR_PRIMARY = '#4689FF';
const COLOR_GREY_400 = '#98A2B3';
const COLOR_GREY_700 = '#535862';
const COLOR_GREY_900 = '#101828';
const COLOR_GREY_300 = '#D0D5DD';
const COLOR_WHITE = '#FFFFFF';

const CardinalityDistributionChart = ({
  data,
  noDataPlaceholderText,
}: CardinalityDistributionChartProps) => {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const firstDayAllUnique =
    data.firstDayData?.cardinalityDistribution?.allValuesUnique ?? false;
  const currentDayAllUnique =
    data.currentDayData?.cardinalityDistribution?.allValuesUnique ?? false;

  const showSingleGraph =
    isUndefined(data.firstDayData?.cardinalityDistribution) ||
    isUndefined(data.currentDayData?.cardinalityDistribution);

  const renderHorizontalGridLine = useMemo(
    () => createHorizontalGridLineRenderer(),
    []
  );

  const renderPlaceholder = useMemo(
    () => (placeholderText: string | React.ReactNode) =>
      (
        <div className="flex items-center justify-center h-full w-full min-h-[350px]">
          <ErrorPlaceHolder placeholderText={placeholderText} />
        </div>
      ),
    []
  );

  if (
    isUndefined(data.firstDayData?.cardinalityDistribution) &&
    isUndefined(data.currentDayData?.cardinalityDistribution)
  ) {
    return renderPlaceholder(noDataPlaceholderText);
  }

  const renderTooltip: TooltipProps<string | number, string>['content'] = (
    props
  ) => {
    const { active, payload } = props;
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      return (
        <div
          className="rounded-md shadow-md p-[10px]"
          style={{ backgroundColor: COLOR_WHITE }}>
          <p className="font-medium text-xs" style={{ color: COLOR_GREY_900 }}>
            {data.name}
          </p>
          <hr
            className="my-2 border-dashed"
            style={{ borderColor: COLOR_GREY_300 }}
          />
          <div className="d-flex items-center justify-between gap-6 p-b-xss text-sm">
            <span className="text-[11px]" style={{ color: COLOR_GREY_700 }}>
              {t('label.count')}
            </span>
            <span
              className="font-medium text-[11px]"
              style={{ color: COLOR_GREY_900 }}>
              {tooltipFormatter(data.count)}
            </span>
          </div>
          <div className="d-flex items-center justify-between gap-6 p-b-xss text-sm">
            <span className="text-[11px]" style={{ color: COLOR_GREY_700 }}>
              {t('label.percentage')}
            </span>
            <span
              className="font-medium text-[11px]"
              style={{ color: COLOR_GREY_900 }}>
              {`${data.percentage}%`}
            </span>
          </div>
        </div>
      );
    }

    return null;
  };

  const dataEntries = Object.entries(data).filter(
    ([, columnProfile]) => !isUndefined(columnProfile?.cardinalityDistribution)
  );

  const bothAllUnique = firstDayAllUnique && currentDayAllUnique;
  const allValuesUniqueMessage = t(
    'message.all-values-unique-no-distribution-available'
  );

  const handleCategoryClick = (categoryName: string) => {
    setSelectedCategory((prev) =>
      prev === categoryName ? null : categoryName
    );
  };

  const CustomYAxisTick = (props: {
    x?: number;
    y?: number;
    payload?: { value: string };
  }) => {
    const { x, y, payload } = props;
    if (!payload) {
      return null;
    }

    const categoryName = payload.value;
    const isSelected = selectedCategory === categoryName;
    const isHighlighted = selectedCategory && selectedCategory !== categoryName;

    return (
      <g transform={`translate(${x},${y})`}>
        <text
          cursor="pointer"
          dy={4}
          fill={
            isSelected
              ? COLOR_PRIMARY
              : isHighlighted
              ? COLOR_GREY_400
              : COLOR_GREY_700
          }
          fontSize={12}
          fontWeight={isSelected ? 600 : 400}
          opacity={isHighlighted ? 0.5 : 1}
          textAnchor="end"
          x={-8}
          onClick={() => handleCategoryClick(categoryName)}>
          {categoryName.length > 15
            ? `${categoryName.slice(0, 15)}...`
            : categoryName}
        </text>
      </g>
    );
  };

  return (
    <div className="flex w-full" data-testid="chart-container">
      {bothAllUnique
        ? renderPlaceholder(allValuesUniqueMessage)
        : dataEntries.map(([key, columnProfile], index) => {
            if (
              isUndefined(columnProfile) ||
              isUndefined(columnProfile?.cardinalityDistribution)
            ) {
              return;
            }

            const cardinalityData = columnProfile.cardinalityDistribution;
            const isAllUnique = cardinalityData.allValuesUnique ?? false;

            const graphData =
              cardinalityData.categories?.map((category, i) => ({
                name: category,
                count: cardinalityData.counts?.[i] || 0,
                percentage: cardinalityData.percentages?.[i] || 0,
              })) || [];

            const graphDate = customFormatDateTime(
              columnProfile?.timestamp || 0,
              'MMM dd, yyyy'
            );

            const containerHeight = Math.max(350, graphData.length * 30);

            const colStyle: React.CSSProperties = {
              flex: showSingleGraph ? '1 1 100%' : '1 1 50%',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              paddingLeft: showSingleGraph ? 16 : 24,
              paddingRight: showSingleGraph ? 16 : 24,
              paddingTop: 8,
              paddingBottom: 8,
              borderRight:
                !showSingleGraph && index === 0
                  ? `1px solid ${GREY_200}`
                  : 'none',
            };

            return (
              <div key={key} style={colStyle}>
                {isAllUnique ? (
                  renderPlaceholder(allValuesUniqueMessage)
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-5">
                      <span
                        className="inline-block rounded-md px-3 py-1.5 text-sm font-semibold"
                        data-testid="date"
                        style={{
                          backgroundColor: GREY_100,
                          color: COLOR_GREY_900,
                        }}>
                        {graphDate}
                      </span>
                      <span
                        className="inline-block rounded-md px-3 py-1.5 text-sm font-semibold"
                        data-testid="cardinality-tag"
                        style={{
                          backgroundColor: GREY_100,
                          color: COLOR_GREY_900,
                        }}>
                        {`${t('label.total-entity', {
                          entity: t('label.category-plural'),
                        })}: ${cardinalityData.categories?.length || 0}`}
                      </span>
                    </div>
                    <div
                      className="overflow-x-hidden"
                      style={{ flex: 1, minHeight: 350 }}>
                      <ResponsiveContainer
                        debounce={200}
                        height={containerHeight}
                        id={`${key}-cardinality`}
                        width="100%">
                        <BarChart
                          className="w-full"
                          data={graphData}
                          layout="vertical">
                          <CartesianGrid
                            horizontal={renderHorizontalGridLine}
                            stroke={GRAPH_BACKGROUND_COLOR}
                            strokeDasharray="3 3"
                            vertical={false}
                          />
                          <XAxis
                            axisLine={false}
                            padding={{ left: 16, right: 16 }}
                            tick={{ fontSize: 12 }}
                            tickFormatter={(props) =>
                              axisTickFormatter(props, '%')
                            }
                            tickLine={false}
                            type="number"
                          />
                          <YAxis
                            allowDataOverflow
                            axisLine={false}
                            dataKey="name"
                            padding={{ top: 16, bottom: 16 }}
                            tick={<CustomYAxisTick />}
                            tickLine={false}
                            type="category"
                            width={120}
                          />
                          <Tooltip
                            content={renderTooltip}
                            cursor={{
                              fill: GREY_100,
                              stroke: GREY_200,
                              strokeDasharray: '3 3',
                            }}
                          />
                          <Bar
                            barSize={22}
                            dataKey="percentage"
                            radius={[0, 8, 8, 0]}>
                            {graphData.map((entry) => {
                              const isSelected =
                                selectedCategory === entry.name;
                              const isHighlighted =
                                selectedCategory &&
                                selectedCategory !== entry.name;

                              return (
                                <Cell
                                  cursor="pointer"
                                  fill={
                                    isSelected
                                      ? COLOR_PRIMARY
                                      : isHighlighted
                                      ? COLOR_GREY_300
                                      : CHART_BLUE_1
                                  }
                                  key={`cell-${entry.name}`}
                                  opacity={isHighlighted ? 0.3 : 1}
                                  onClick={() =>
                                    handleCategoryClick(entry.name)
                                  }
                                />
                              );
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
              </div>
            );
          })}
    </div>
  );
};

export default CardinalityDistributionChart;
