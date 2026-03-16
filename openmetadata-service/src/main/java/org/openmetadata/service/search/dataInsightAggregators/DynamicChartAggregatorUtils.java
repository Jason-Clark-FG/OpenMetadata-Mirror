package org.openmetadata.service.search.dataInsightAggregators;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.openmetadata.schema.dataInsight.custom.DataInsightCustomChart;
import org.openmetadata.schema.dataInsight.custom.DataInsightCustomChartResult;
import org.openmetadata.schema.dataInsight.custom.DataInsightCustomChartResultList;
import org.openmetadata.schema.dataInsight.custom.FormulaHolder;
import org.openmetadata.schema.dataInsight.custom.Function;
import org.openmetadata.schema.dataInsight.custom.LineChart;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.jdbi3.DataInsightSystemChartRepository;
import org.openmetadata.service.security.policyevaluator.CompiledRule;
import org.springframework.expression.Expression;

// Suppress warnings for the raw Map type used in metricFormulaHolder parameter
@SuppressWarnings("unchecked")

/**
 * Shared utility methods for DI chart aggregation processing. These methods are
 * platform-independent (no ES/OS types) and are used by both the Elasticsearch and OpenSearch
 * aggregator interfaces.
 */
public final class DynamicChartAggregatorUtils {

  public static final long MILLISECONDS_IN_DAY = 24L * 60 * 60 * 1000;

  private DynamicChartAggregatorUtils() {}

  public static List<FormulaHolder> getFormulaList(String formula) {
    List<FormulaHolder> formulas = new ArrayList<>();
    if (formula == null) {
      return formulas;
    }
    Pattern pattern = Pattern.compile(DataInsightSystemChartRepository.FORMULA_FUNC_REGEX);
    Matcher matcher = pattern.matcher(formula);
    while (matcher.find()) {
      FormulaHolder holder = new FormulaHolder();
      holder.setFormula(matcher.group());
      holder.setFunction(Function.valueOf(matcher.group(1).toUpperCase()));
      if (matcher.group(5) != null) {
        holder.setQuery(matcher.group(5));
      }
      formulas.add(holder);
    }
    return formulas;
  }

  public static DataInsightCustomChartResult buildChartResult(
      Double value, String key, String group, boolean isTimestamp, String metric) {
    if (isTimestamp) {
      return new DataInsightCustomChartResult()
          .withCount(value)
          .withDay(Double.valueOf(key))
          .withGroup(group)
          .withMetric(metric);
    }
    return new DataInsightCustomChartResult()
        .withCount(value)
        .withGroup(group)
        .withTerm(key)
        .withMetric(metric);
  }

  public static boolean isValidNumericValue(double value) {
    return !Double.isInfinite(value) && !Double.isNaN(value);
  }

  public static int extractAggregationIndex(String key) {
    int i = key.length() - 1;
    while (i >= 0 && Character.isDigit(key.charAt(i))) {
      i--;
    }
    if (i < key.length() - 1) {
      return Integer.parseInt(key.substring(i + 1));
    }
    return Integer.MAX_VALUE;
  }

  public static <T> List<Map.Entry<String, T>> getSortedAggregationEntries(
      Map<String, T> aggregations) {
    List<Map.Entry<String, T>> entries = new ArrayList<>(aggregations.entrySet());
    entries.sort(Comparator.comparingInt(e -> extractAggregationIndex(e.getKey())));
    return entries;
  }

  public static List<DataInsightCustomChartResult> evaluateFormulas(
      List<List<DataInsightCustomChartResult>> rawResults,
      String formula,
      String group,
      List<FormulaHolder> holders,
      String metric) {
    List<DataInsightCustomChartResult> finalList = new ArrayList<>();
    for (List<DataInsightCustomChartResult> result : rawResults) {
      String formulaCopy = formula;
      if (holders.size() != result.size()) {
        continue;
      }
      boolean evaluate = true;
      Double day = null;
      String term = null;
      for (int i = 0; i < holders.size(); i++) {
        if (result.get(i).getCount() == null) {
          evaluate = false;
          break;
        }
        day = result.get(i).getDay();
        term = result.get(i).getTerm();
        formulaCopy =
            formulaCopy.replace(holders.get(i).getFormula(), result.get(i).getCount().toString());
      }
      if (evaluate
          && formulaCopy.matches(DataInsightSystemChartRepository.NUMERIC_VALIDATION_REGEX)
          && (day != null || term != null)) {
        Expression expression = CompiledRule.parseExpression(formulaCopy);
        Double value = (Double) expression.getValue();
        if (value == null || value.isNaN() || value.isInfinite()) {
          value = 0.0;
        }
        finalList.add(buildChartResult(value, day != null ? String.valueOf(day) : term, group,
            day != null, metric));
      }
    }
    return finalList;
  }

  public static List<DataInsightCustomChartResult> flattenResults(
      List<List<DataInsightCustomChartResult>> rawResults) {
    List<DataInsightCustomChartResult> finalResult = new ArrayList<>();
    for (List<DataInsightCustomChartResult> diResultList : rawResults) {
      finalResult.addAll(diResultList);
    }
    return finalResult;
  }

  public static class MetricFormulaHolder {
    public String formula;
    public List<FormulaHolder> holders;

    public MetricFormulaHolder() {}

    public MetricFormulaHolder(String formula, List<FormulaHolder> holders) {
      this.holders = holders;
      this.formula = formula;
    }
  }

  public static String getMetricName(LineChart lineChart, String name) {
    if (lineChart.getMetrics().size() == 1) {
      return null;
    }
    return name;
  }

  public static <AggType> DataInsightCustomChartResultList processSummaryCardResponse(
      DataInsightCustomChart diChart,
      Map<String, AggType> aggregationMap,
      List<FormulaHolder> formulas,
      AggregationProcessor<AggType> processAggregationsFn) {
    DataInsightCustomChartResultList resultList = new DataInsightCustomChartResultList();
    org.openmetadata.schema.dataInsight.custom.SummaryCard summaryCard =
        JsonUtils.convertValue(
            diChart.getChartDetails(),
            org.openmetadata.schema.dataInsight.custom.SummaryCard.class);

    String formula = summaryCard.getMetrics().getFirst().getFormula();
    if ((formulas == null || formulas.isEmpty()) && formula != null) {
      formulas = getFormulaList(formula);
    }

    List<DataInsightCustomChartResult> results =
        processAggregationsFn.process(aggregationMap, formula, null, formulas, null);

    List<DataInsightCustomChartResult> finalResults = new ArrayList<>();
    for (int i = results.size() - 1; i >= 0; i--) {
      if (results.get(i).getCount() != null) {
        finalResults.add(results.get(i));
        resultList.setResults(finalResults);
        return resultList;
      }
    }

    resultList.setResults(results);
    return resultList;
  }

  public static String getChartType(DataInsightCustomChart diChart) {
    Object details = diChart.getChartDetails();
    if (details instanceof java.util.LinkedHashMap) {
      return (String) ((java.util.LinkedHashMap<?, ?>) details).get("type");
    }
    return null;
  }

  public static boolean isLineChart(DataInsightCustomChart diChart) {
    return org.openmetadata.schema.dataInsight.custom.LineChart.Type.LINE_CHART
        .value()
        .equals(getChartType(diChart));
  }

  public static boolean isSummaryCard(DataInsightCustomChart diChart) {
    return org.openmetadata.schema.dataInsight.custom.SummaryCard.Type.SUMMARY_CARD
        .value()
        .equals(getChartType(diChart));
  }

  @FunctionalInterface
  public interface AggregationProcessor<AggType> {
    List<DataInsightCustomChartResult> process(
        Map<String, AggType> aggregations,
        String formula,
        String group,
        List<FormulaHolder> holders,
        String metric);
  }
}
