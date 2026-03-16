package org.openmetadata.service.search.elasticsearch.dataInsightAggregators;

import org.openmetadata.schema.dataInsight.custom.DataInsightCustomChart;
import org.openmetadata.service.search.dataInsightAggregators.DynamicChartAggregatorUtils;

public class ElasticSearchDynamicChartAggregatorFactory {
  public static ElasticSearchDynamicChartAggregatorInterface getAggregator(
      DataInsightCustomChart diChart) {
    if (DynamicChartAggregatorUtils.isLineChart(diChart)) {
      return new ElasticSearchLineChartAggregator();
    } else if (DynamicChartAggregatorUtils.isSummaryCard(diChart)) {
      return new ElasticSearchSummaryCardAggregator();
    }
    return null;
  }
}
