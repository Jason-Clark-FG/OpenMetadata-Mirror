package org.openmetadata.service.search.opensearch.dataInsightAggregator;

import org.openmetadata.schema.dataInsight.custom.DataInsightCustomChart;
import org.openmetadata.service.search.dataInsightAggregators.DynamicChartAggregatorUtils;

public class OpenSearchDynamicChartAggregatorFactory {
  public static OpenSearchDynamicChartAggregatorInterface getAggregator(
      DataInsightCustomChart diChart) {
    if (DynamicChartAggregatorUtils.isLineChart(diChart)) {
      return new OpenSearchLineChartAggregator();
    } else if (DynamicChartAggregatorUtils.isSummaryCard(diChart)) {
      return new OpenSearchSummaryCardAggregator();
    }
    return null;
  }
}
