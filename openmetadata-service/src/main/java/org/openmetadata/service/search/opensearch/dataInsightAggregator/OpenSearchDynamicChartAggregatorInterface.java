package org.openmetadata.service.search.opensearch.dataInsightAggregator;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.apache.jena.atlas.logging.Log;
import org.jetbrains.annotations.NotNull;
import org.openmetadata.schema.dataInsight.custom.DataInsightCustomChart;
import org.openmetadata.schema.dataInsight.custom.DataInsightCustomChartResult;
import org.openmetadata.schema.dataInsight.custom.DataInsightCustomChartResultList;
import org.openmetadata.schema.dataInsight.custom.FormulaHolder;
import org.openmetadata.schema.dataInsight.custom.Function;
import org.openmetadata.service.search.dataInsightAggregators.DynamicChartAggregatorUtils;
import os.org.opensearch.client.json.JsonData;
import os.org.opensearch.client.opensearch._types.aggregations.Aggregate;
import os.org.opensearch.client.opensearch._types.aggregations.Aggregation;
import os.org.opensearch.client.opensearch._types.aggregations.DateHistogramBucket;
import os.org.opensearch.client.opensearch._types.aggregations.FilterAggregate;
import os.org.opensearch.client.opensearch._types.aggregations.StringTermsBucket;
import os.org.opensearch.client.opensearch._types.query_dsl.Query;
import os.org.opensearch.client.opensearch.core.SearchRequest;
import os.org.opensearch.client.opensearch.core.SearchResponse;

public interface OpenSearchDynamicChartAggregatorInterface {

  ObjectMapper mapper = new ObjectMapper();

  private static Aggregation getSubAggregationsByFunction(
      Function function, String field, int index) {
    return switch (function) {
      case COUNT -> Aggregation.of(a -> a.valueCount(v -> v.field(field)));
      case SUM -> Aggregation.of(a -> a.sum(s -> s.field(field)));
      case AVG -> Aggregation.of(a -> a.avg(avg -> avg.field(field)));
      case MIN -> Aggregation.of(a -> a.min(m -> m.field(field)));
      case MAX -> Aggregation.of(a -> a.max(m -> m.field(field)));
      case UNIQUE -> Aggregation.of(a -> a.cardinality(c -> c.field(field)));
    };
  }

  static List<FormulaHolder> getFormulaList(String formula) {
    return DynamicChartAggregatorUtils.getFormulaList(formula);
  }

  static void getDateHistogramByFormula(
      String formula,
      Query filter,
      Map<String, Aggregation> aggregations,
      String aggregationName,
      List<FormulaHolder> formulas) {
    java.util.regex.Pattern pattern =
        java.util.regex.Pattern.compile(
            org.openmetadata.service.jdbi3.DataInsightSystemChartRepository.FORMULA_FUNC_REGEX);
    java.util.regex.Matcher matcher = pattern.matcher(formula);
    int index = 0;
    while (matcher.find()) {
      FormulaHolder holder = new FormulaHolder();
      holder.setFormula(matcher.group());
      holder.setFunction(Function.valueOf(matcher.group(1).toUpperCase()));
      String field;
      if (matcher.group(3) != null) {
        field = matcher.group(3);
      } else {
        field = "id.keyword";
      }
      Aggregation subAgg =
          getSubAggregationsByFunction(
              Function.valueOf(matcher.group(1).toUpperCase()), field, index);
      if (matcher.group(5) != null) {
        String queryString = matcher.group(5);
        Query queryBuilder;
        if (filter != null) {
          queryBuilder =
              Query.of(
                  q ->
                      q.bool(
                          b ->
                              b.must(
                                      Query.of(
                                          mq ->
                                              mq.queryString(
                                                  qs -> qs.query(queryString).lenient(true))))
                                  .must(filter)));
        } else {
          queryBuilder = Query.of(q -> q.queryString(qs -> qs.query(queryString).lenient(true)));
        }
        Map<String, Aggregation> subAggMap = new HashMap<>();
        subAggMap.put(field + index, subAgg);
        aggregations.put(
            "filter" + index, Aggregation.of(a -> a.filter(queryBuilder).aggregations(subAggMap)));
        holder.setQuery(queryString);
      } else {
        if (filter != null) {
          Map<String, Aggregation> subAggMap = new HashMap<>();
          subAggMap.put(field + index, subAgg);
          aggregations.put(
              "filter" + index, Aggregation.of(a -> a.filter(filter).aggregations(subAggMap)));
        } else {
          aggregations.put(field + index, subAgg);
        }
      }
      formulas.add(holder);
      index++;
    }
  }

  default void populateDateHistogram(
      Function function,
      String formula,
      String field,
      String filter,
      Map<String, Aggregation> aggregations,
      String aggregationName,
      List<FormulaHolder> formulas) {
    if (formula != null) {
      if (filter != null && !filter.equals("{}")) {
        try {
          JsonNode rootNode = mapper.readTree(filter);
          JsonNode queryNode = rootNode.get("query");
          String base64Query = Base64.getEncoder().encodeToString(queryNode.toString().getBytes());
          Query queryFilter = Query.of(q -> q.wrapper(w -> w.query(base64Query)));

          getDateHistogramByFormula(formula, queryFilter, aggregations, aggregationName, formulas);
        } catch (Exception e) {
          Log.error("Error while parsing query string so using fallback: {}", e.getMessage(), e);
          getDateHistogramByFormula(formula, null, aggregations, aggregationName, formulas);
        }
      } else {
        getDateHistogramByFormula(formula, null, aggregations, aggregationName, formulas);
      }
      return;
    }

    Aggregation subAgg = getSubAggregationsByFunction(function, field, 0);
    if (filter != null && !filter.equals("{}")) {
      try {
        JsonNode rootNode = mapper.readTree(filter);
        JsonNode queryNode = rootNode.get("query");
        String base64Query = Base64.getEncoder().encodeToString(queryNode.toString().getBytes());
        Query queryFilter = Query.of(q -> q.wrapper(w -> w.query(base64Query)));

        Map<String, Aggregation> subAggMap = new HashMap<>();
        subAggMap.put(field + "0", subAgg);
        aggregations.put(
            "filter", Aggregation.of(a -> a.filter(queryFilter).aggregations(subAggMap)));
      } catch (Exception e) {
        Log.error("Error while parsing query string so using fallback: {}", e.getMessage(), e);
        aggregations.put(field + "0", subAgg);
      }
    } else {
      aggregations.put(field + "0", subAgg);
    }
  }

  SearchRequest prepareSearchRequest(
      @NotNull DataInsightCustomChart diChart,
      long start,
      long end,
      List<FormulaHolder> formulas,
      Map metricFormulaHolder,
      boolean live)
      throws IOException;

  default SearchRequest prepareSearchRequest(
      @NotNull DataInsightCustomChart diChart,
      long start,
      long end,
      List<FormulaHolder> formulas,
      Map metricFormulaHolder,
      boolean live,
      String filter)
      throws IOException {
    return prepareSearchRequest(diChart, start, end, formulas, metricFormulaHolder, live);
  }

  DataInsightCustomChartResultList processSearchResponse(
      @NotNull DataInsightCustomChart diChart,
      SearchResponse<JsonData> searchResponse,
      List<FormulaHolder> formulas,
      Map metricFormulaHolder);

  default List<DataInsightCustomChartResult> processAggregations(
      Map<String, Aggregate> aggregations,
      String formula,
      String group,
      List<FormulaHolder> holder,
      String metric) {
    List<List<DataInsightCustomChartResult>> rawResults =
        processAggregationsInternal(aggregations, group, metric);
    if (formula != null) {
      return DynamicChartAggregatorUtils.evaluateFormulas(rawResults, formula, group, holder, metric);
    }
    return DynamicChartAggregatorUtils.flattenResults(rawResults);
  }

  private List<List<DataInsightCustomChartResult>> processAggregationsInternal(
      Map<String, Aggregate> aggregations, String group, String metric) {
    List<List<DataInsightCustomChartResult>> results = new ArrayList<>();
    for (Map.Entry<String, Aggregate> entry : aggregations.entrySet()) {
      Aggregate agg = entry.getValue();
      if (agg.isSterms()) {
        for (StringTermsBucket bucket : agg.sterms().buckets().array()) {
          List<DataInsightCustomChartResult> subResults = new ArrayList<>();
          for (Map.Entry<String, Aggregate> subEntry :
              DynamicChartAggregatorUtils.getSortedAggregationEntries(bucket.aggregations())) {
            addByAggregationType(
                subEntry.getValue(), subResults, bucket.key(), group, false, metric);
          }
          results.add(subResults);
        }
      } else if (agg.isDateHistogram()) {
        for (DateHistogramBucket bucket : agg.dateHistogram().buckets().array()) {
          List<DataInsightCustomChartResult> subResults = new ArrayList<>();
          for (Map.Entry<String, Aggregate> subEntry :
              DynamicChartAggregatorUtils.getSortedAggregationEntries(bucket.aggregations())) {
            addByAggregationType(
                subEntry.getValue(), subResults, String.valueOf(bucket.key()), group, true, metric);
          }
          results.add(subResults);
        }
      }
    }
    return results;
  }

  private void addByAggregationType(
      Aggregate subAggr,
      List<DataInsightCustomChartResult> diChartResults,
      String key,
      String group,
      boolean isTimeStamp,
      String metric) {
    if (subAggr.isValueCount()) {
      addNumericResult(
          subAggr.valueCount().value(), diChartResults, key, group, isTimeStamp, metric);
    } else if (subAggr.isCardinality()) {
      double value = (double) subAggr.cardinality().value();
      if (!Double.isInfinite(value)) {
        diChartResults.add(
            DynamicChartAggregatorUtils.buildChartResult(value, key, group, isTimeStamp, metric));
      }
    } else if (subAggr.isSum()) {
      addNumericResult(subAggr.sum().value(), diChartResults, key, group, isTimeStamp, metric);
    } else if (subAggr.isAvg()) {
      addNumericResult(subAggr.avg().value(), diChartResults, key, group, isTimeStamp, metric);
    } else if (subAggr.isMin()) {
      addNumericResult(subAggr.min().value(), diChartResults, key, group, isTimeStamp, metric);
    } else if (subAggr.isMax()) {
      addNumericResult(subAggr.max().value(), diChartResults, key, group, isTimeStamp, metric);
    } else if (subAggr.isFilter()) {
      FilterAggregate filterAgg = subAggr.filter();
      for (Map.Entry<String, Aggregate> entry : filterAgg.aggregations().entrySet()) {
        addByAggregationType(entry.getValue(), diChartResults, key, group, isTimeStamp, metric);
      }
    }
  }

  private void addNumericResult(
      double value,
      List<DataInsightCustomChartResult> diChartResults,
      String key,
      String group,
      boolean isTimeStamp,
      String metric) {
    if (DynamicChartAggregatorUtils.isValidNumericValue(value)) {
      diChartResults.add(
          DynamicChartAggregatorUtils.buildChartResult(value, key, group, isTimeStamp, metric));
    }
  }
}
