package org.openmetadata.service.search.elasticsearch.dataInsightAggregators;

import static org.openmetadata.common.utils.CommonUtil.nullOrEmpty;

import es.co.elastic.clients.elasticsearch._types.aggregations.Aggregate;
import es.co.elastic.clients.elasticsearch._types.aggregations.Aggregation;
import es.co.elastic.clients.elasticsearch._types.aggregations.CalendarInterval;
import es.co.elastic.clients.elasticsearch._types.aggregations.StringTermsBucket;
import es.co.elastic.clients.elasticsearch._types.query_dsl.BoolQuery;
import es.co.elastic.clients.elasticsearch._types.query_dsl.Query;
import es.co.elastic.clients.elasticsearch.core.SearchRequest;
import es.co.elastic.clients.elasticsearch.core.SearchResponse;
import es.co.elastic.clients.json.JsonData;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.jetbrains.annotations.NotNull;
import org.openmetadata.common.utils.CommonUtil;
import org.openmetadata.schema.dataInsight.custom.DataInsightCustomChart;
import org.openmetadata.schema.dataInsight.custom.DataInsightCustomChartResult;
import org.openmetadata.schema.dataInsight.custom.DataInsightCustomChartResultList;
import org.openmetadata.schema.dataInsight.custom.FormulaHolder;
import org.openmetadata.schema.dataInsight.custom.LineChart;
import org.openmetadata.schema.dataInsight.custom.LineChartMetric;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.jdbi3.DataInsightSystemChartRepository;
import org.openmetadata.service.search.dataInsightAggregators.DynamicChartAggregatorUtils;
import org.openmetadata.service.search.elasticsearch.EsUtils;

public class ElasticSearchLineChartAggregator
    implements ElasticSearchDynamicChartAggregatorInterface {

  public static class MetricFormulaHolder extends DynamicChartAggregatorUtils.MetricFormulaHolder {
    public MetricFormulaHolder() {
      super();
    }

    public MetricFormulaHolder(String formula, List<FormulaHolder> holders) {
      super(formula, holders);
    }
  }

  @Override
  public SearchRequest prepareSearchRequest(
      @NotNull DataInsightCustomChart diChart,
      long start,
      long end,
      List<FormulaHolder> formulas,
      Map metricFormulaHolder,
      boolean live,
      String filter,
      String targetIndex)
      throws IOException {
    return prepareSearchRequestInternal(
        diChart, start, end, formulas, metricFormulaHolder, live, filter, targetIndex);
  }

  @Override
  public SearchRequest prepareSearchRequest(
      @NotNull DataInsightCustomChart diChart,
      long start,
      long end,
      List<FormulaHolder> formulas,
      Map metricFormulaHolder,
      boolean live,
      String filter)
      throws IOException {
    return prepareSearchRequestInternal(
        diChart, start, end, formulas, metricFormulaHolder, live, filter, null);
  }

  @Override
  public SearchRequest prepareSearchRequest(
      @NotNull DataInsightCustomChart diChart,
      long start,
      long end,
      List<FormulaHolder> formulas,
      Map metricFormulaHolder,
      boolean live)
      throws IOException {
    return prepareSearchRequestInternal(
        diChart, start, end, formulas, metricFormulaHolder, live, null, null);
  }

  @SuppressWarnings("unchecked")
  private SearchRequest prepareSearchRequestInternal(
      @NotNull DataInsightCustomChart diChart,
      long start,
      long end,
      List<FormulaHolder> formulas,
      Map metricFormulaHolder,
      boolean live,
      String filter,
      String targetIndex)
      throws IOException {
    LineChart lineChart = JsonUtils.convertValue(diChart.getChartDetails(), LineChart.class);
    Map<String, Aggregation> aggregationsMap = new HashMap<>();
    int metricCounter = 0;
    long startTime = start;
    boolean usesCustomXAxis = hasCustomXAxis(lineChart);

    for (LineChartMetric metric : lineChart.getMetrics()) {
      String metricName =
          metric.getName() != null ? metric.getName() : "metric_" + ++metricCounter;

      Map<String, Aggregation> subAggregations = buildSubAggregations(metric, formulas, metricName);
      metricFormulaHolder.put(metricName, buildFormulaHolder(metric));

      Aggregation primaryAgg;
      if (usesCustomXAxis) {
        primaryAgg =
            buildTermsAggregation(
                lineChart.getxAxisField(),
                nullableIfEmpty(lineChart.getIncludeXAxisFiled()),
                nullableIfEmpty(lineChart.getExcludeXAxisField()),
                subAggregations);
        startTime = end - DynamicChartAggregatorUtils.MILLISECONDS_IN_DAY;
      } else {
        primaryAgg = buildDateHistogramAggregation(subAggregations);
      }

      if (lineChart.getGroupBy() != null) {
        Aggregation groupByAgg =
            buildGroupByAggregation(lineChart, Map.of(metricName, primaryAgg));
        aggregationsMap.put("term_" + metricCounter, groupByAgg);
      } else {
        aggregationsMap.put(metricName, primaryAgg);
      }
    }

    return buildSearchRequest(aggregationsMap, startTime, end, live, filter, lineChart, targetIndex);
  }

  private boolean hasCustomXAxis(LineChart lineChart) {
    return lineChart.getxAxisField() != null
        && !lineChart.getxAxisField().equals(DataInsightSystemChartRepository.TIMESTAMP_FIELD);
  }

  private String nullableIfEmpty(String value) {
    return CommonUtil.nullOrEmpty(value) ? null : value;
  }

  private Map<String, Aggregation> buildSubAggregations(
      LineChartMetric metric, List<FormulaHolder> formulas, String metricName) {
    Map<String, Aggregation> subAggregations = new HashMap<>();
    populateDateHistogram(
        metric.getFunction(),
        metric.getFormula(),
        metric.getField(),
        metric.getFilter(),
        subAggregations,
        metricName,
        formulas);
    return subAggregations;
  }

  private MetricFormulaHolder buildFormulaHolder(LineChartMetric metric) {
    return new MetricFormulaHolder(
        metric.getFormula(),
        DynamicChartAggregatorUtils.getFormulaList(metric.getFormula()));
  }

  private Aggregation buildTermsAggregation(
      String field,
      String includeRegex,
      String excludeRegex,
      Map<String, Aggregation> subAggregations) {
    return Aggregation.of(
        a ->
            a.terms(
                    t -> {
                      es.co.elastic.clients.elasticsearch._types.aggregations.TermsAggregation
                              .Builder
                          builder = t.field(field).size(100);
                      if (includeRegex != null) {
                        builder = builder.include(inc -> inc.regexp(includeRegex));
                      }
                      if (excludeRegex != null) {
                        builder = builder.exclude(exc -> exc.regexp(excludeRegex));
                      }
                      return builder;
                    })
                .aggregations(subAggregations));
  }

  private Aggregation buildDateHistogramAggregation(Map<String, Aggregation> subAggregations) {
    return Aggregation.of(
        a ->
            a.dateHistogram(
                    dh ->
                        dh.field(DataInsightSystemChartRepository.TIMESTAMP_FIELD)
                            .calendarInterval(CalendarInterval.Day))
                .aggregations(subAggregations));
  }

  private Aggregation buildGroupByAggregation(
      LineChart lineChart, Map<String, Aggregation> metricAggregations) {
    List<String> includeGroups =
        CommonUtil.nullOrEmpty(lineChart.getIncludeGroups()) ? null : lineChart.getIncludeGroups();
    List<String> excludeGroups =
        CommonUtil.nullOrEmpty(lineChart.getExcludeGroups()) ? null : lineChart.getExcludeGroups();

    return Aggregation.of(
        a ->
            a.terms(
                    t -> {
                      es.co.elastic.clients.elasticsearch._types.aggregations.TermsAggregation
                              .Builder
                          builder = t.field(lineChart.getGroupBy()).size(100);
                      if (includeGroups != null) {
                        builder = builder.include(inc -> inc.terms(includeGroups));
                      }
                      if (excludeGroups != null) {
                        builder = builder.exclude(exc -> exc.terms(excludeGroups));
                      }
                      return builder;
                    })
                .aggregations(metricAggregations));
  }

  private SearchRequest buildSearchRequest(
      Map<String, Aggregation> aggregationsMap,
      long startTime,
      long end,
      boolean live,
      String filter,
      LineChart lineChart,
      String targetIndex) {
    SearchRequest.Builder builder = new SearchRequest.Builder().size(0);

    if (!live) {
      Query rangeQuery =
          Query.of(
              q ->
                  q.range(
                      r ->
                          r.untyped(
                              u ->
                                  u.field(DataInsightSystemChartRepository.TIMESTAMP_FIELD)
                                      .gte(JsonData.of(String.valueOf(startTime)))
                                      .lte(JsonData.of(String.valueOf(end))))));
      builder.query(buildQueryWithFilter(rangeQuery, filter));
      String index =
          targetIndex != null
              ? targetIndex
              : DataInsightSystemChartRepository.getDataInsightsSearchIndex();
      builder.index(index);
    } else {
      builder.index(
          DataInsightSystemChartRepository.getLiveSearchIndex(lineChart.getSearchIndex()));
    }

    return builder.aggregations(aggregationsMap).build();
  }

  private Query buildQueryWithFilter(Query rangeQuery, String filter) {
    Query deletedFilter =
        Query.of(q -> q.term(t -> t.field("deleted").value(v -> v.booleanValue(true))));

    if (nullOrEmpty(filter) || filter.equals("{}")) {
      return Query.of(
          q -> q.bool(BoolQuery.of(b -> b.must(rangeQuery).mustNot(deletedFilter))));
    }

    try {
      String queryToProcess = EsUtils.parseJsonQuery(filter);
      Query filterQuery = Query.of(q -> q.wrapper(w -> w.query(queryToProcess)));
      return Query.of(
          q ->
              q.bool(
                  BoolQuery.of(
                      b -> b.must(rangeQuery).filter(filterQuery).mustNot(deletedFilter))));
    } catch (Exception e) {
      return Query.of(
          q -> q.bool(BoolQuery.of(b -> b.must(rangeQuery).mustNot(deletedFilter))));
    }
  }

  @Override
  @SuppressWarnings("unchecked")
  public DataInsightCustomChartResultList processSearchResponse(
      @NotNull DataInsightCustomChart diChart,
      SearchResponse<JsonData> searchResponse,
      List<FormulaHolder> formulas,
      Map metricFormulaHolder) {
    LineChart lineChart = JsonUtils.convertValue(diChart.getChartDetails(), LineChart.class);
    Map<String, Aggregate> aggregationMap =
        searchResponse.aggregations() != null ? searchResponse.aggregations() : new HashMap<>();
    Map<String, MetricFormulaHolder> holders = metricFormulaHolder;

    List<DataInsightCustomChartResult> results = new ArrayList<>();

    for (Map.Entry<String, Aggregate> entry : aggregationMap.entrySet()) {
      Aggregate agg = entry.getValue();

      if (lineChart.getGroupBy() != null && agg.isSterms()) {
        for (StringTermsBucket bucket : agg.sterms().buckets().array()) {
          for (Map.Entry<String, Aggregate> subEntry : bucket.aggregations().entrySet()) {
            String subAggName = subEntry.getKey();
            String group = lineChart.getMetrics().size() > 1
                ? bucket.key().stringValue() + " - " + DynamicChartAggregatorUtils.getMetricName(lineChart, subAggName)
                : bucket.key().stringValue();
            MetricFormulaHolder holder = holders.get(subAggName);
            if (holder != null) {
              results.addAll(
                  processAggregations(
                      Map.of(subAggName, subEntry.getValue()),
                      holder.formula,
                      group,
                      holder.holders,
                      DynamicChartAggregatorUtils.getMetricName(lineChart, subAggName)));
            }
          }
        }
      } else {
        String aggName = entry.getKey();
        MetricFormulaHolder holder =
            holders.get(aggName) != null ? holders.get(aggName) : new MetricFormulaHolder();
        String group = lineChart.getMetrics().size() > 1
            ? DynamicChartAggregatorUtils.getMetricName(lineChart, aggName) : null;
        results.addAll(
            processAggregations(
                Map.of(aggName, agg),
                holder.formula,
                group,
                holder.holders,
                DynamicChartAggregatorUtils.getMetricName(lineChart, aggName)));
      }
    }

    DataInsightCustomChartResultList resultList = new DataInsightCustomChartResultList();
    resultList.setResults(results);
    if (lineChart.getKpiDetails() != null) {
      resultList.setKpiDetails(lineChart.getKpiDetails());
    }
    return resultList;
  }
}
