package org.openmetadata.service.search.dataInsightAggregators;

import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.dataInsight.custom.DataInsightCustomChart;
import org.openmetadata.schema.dataInsight.custom.FormulaHolder;
import org.openmetadata.schema.dataInsight.custom.LineChart;
import org.openmetadata.schema.dataInsight.custom.LineChartMetric;
import org.openmetadata.schema.dataInsight.custom.SummaryCard;
import org.openmetadata.schema.dataInsight.custom.SummaryChartMetric;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.jdbi3.DataInsightSystemChartRepository;

/**
 * Determines whether a chart query can be served from the compact rollup index (di-rollup-daily) or
 * must fall back to the raw data streams (di-data-assets-*). A chart can use the rollup when all
 * its dimensions are in the rollup's group-by and all its measures can be derived from the rollup's
 * pre-aggregated fields.
 */
@Slf4j
public class RollupQueryRouter {

  private static final Set<String> ROLLUP_DIMENSIONS =
      Set.of(
          "entityType",
          "entityType.keyword",
          "tier.tagFQN",
          "tier",
          "team",
          "hasOwner",
          "hasDescription");

  private static final Set<String> ROLLUP_METRIC_FIELDS =
      Set.of(
          "id",
          "id.keyword",
          "numberOfColumns",
          "numberOfColumnsWithDescription",
          "owners.id.keyword");

  private static final Set<String> ROLLUP_FILTER_FIELDS =
      Set.of(
          "entityType",
          "entityType.keyword",
          "tier.tagFQN",
          "tier",
          "team",
          "hasOwner",
          "hasDescription",
          "hasColumnDescription");

  private RollupQueryRouter() {}

  public static boolean canUseRollup(DataInsightCustomChart chart) {
    Object details = chart.getChartDetails();
    if (details == null) {
      return false;
    }

    try {
      String type =
          details instanceof java.util.LinkedHashMap
              ? (String) ((java.util.LinkedHashMap<?, ?>) details).get("type")
              : null;

      if (LineChart.Type.LINE_CHART.value().equals(type)) {
        return canUseRollupForLineChart(JsonUtils.convertValue(details, LineChart.class));
      } else if (SummaryCard.Type.SUMMARY_CARD.value().equals(type)) {
        return canUseRollupForSummaryCard(JsonUtils.convertValue(details, SummaryCard.class));
      }
    } catch (Exception e) {
      LOG.debug("[RollupQueryRouter] Failed to analyze chart for rollup routing", e);
    }
    return false;
  }

  public static String getTargetIndex(DataInsightCustomChart chart) {
    if (canUseRollup(chart)) {
      String rollupIndex = DataInsightSystemChartRepository.getDataInsightsRollupIndex();
      LOG.debug("[RollupQueryRouter] Routing chart '{}' to rollup index", chart.getName());
      return rollupIndex;
    }
    String rawIndex = DataInsightSystemChartRepository.getDataInsightsSearchIndex();
    LOG.debug("[RollupQueryRouter] Routing chart '{}' to raw data index", chart.getName());
    return rawIndex;
  }

  private static boolean canUseRollupForLineChart(LineChart lineChart) {
    if (lineChart.getGroupBy() != null && !ROLLUP_DIMENSIONS.contains(lineChart.getGroupBy())) {
      return false;
    }

    if (lineChart.getxAxisField() != null
        && !DataInsightSystemChartRepository.TIMESTAMP_FIELD.equals(
            lineChart.getxAxisField())) {
      return false;
    }

    for (LineChartMetric metric : lineChart.getMetrics()) {
      if (!isMetricRollupCompatible(metric.getField(), metric.getFormula(), metric.getFilter())) {
        return false;
      }
    }
    return true;
  }

  private static boolean canUseRollupForSummaryCard(SummaryCard summaryCard) {
    SummaryChartMetric metric = summaryCard.getMetrics().getFirst();
    return isMetricRollupCompatible(metric.getField(), metric.getFormula(), metric.getFilter());
  }

  private static boolean isMetricRollupCompatible(String field, String formula, String filter) {
    if (field != null && !ROLLUP_METRIC_FIELDS.contains(field)) {
      return false;
    }

    if (filter != null && !isFilterRollupCompatible(filter)) {
      return false;
    }

    if (formula != null && !isFormulaRollupCompatible(formula)) {
      return false;
    }

    return true;
  }

  private static boolean isFilterRollupCompatible(String filter) {
    for (String dimension : ROLLUP_FILTER_FIELDS) {
      filter = filter.replace(dimension, "");
    }
    return !filter.matches(".*[a-zA-Z]\\.[a-zA-Z].*");
  }

  private static boolean isFormulaRollupCompatible(String formula) {
    var holders = DynamicChartAggregatorUtils.getFormulaList(formula);
    for (FormulaHolder holder : holders) {
      if (holder.getField() != null && !ROLLUP_METRIC_FIELDS.contains(holder.getField())) {
        return false;
      }
      if (holder.getQuery() != null && !isFilterRollupCompatible(holder.getQuery())) {
        return false;
      }
    }
    return true;
  }
}
