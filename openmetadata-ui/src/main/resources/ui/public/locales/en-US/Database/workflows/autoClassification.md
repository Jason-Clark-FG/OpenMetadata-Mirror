# Auto Classification

Auto Classification Pipeline Configuration.

The main goal of this pipeline is bringing in Sample Data from your sources, as well as using NLP models to
automatically classify your data based on PII (Personally Identifiable Information) and other sensitive information.

## Configuration

$$section
### Database Filter Pattern $(id="databaseFilterPattern")

Database filter patterns to control whether to include database as part of metadata ingestion.

**Include**: Explicitly include databases by adding a list of regular expressions to the `Include` field. OpenMetadata will include all databases with names matching one or more of the supplied regular expressions. All other databases will be excluded.

For example, to include only those databases whose name starts with the word `demo`, add the regex pattern in the include field as `^demo.*`.

**Exclude**: Explicitly exclude databases by adding a list of regular expressions to the `Exclude` field. OpenMetadata will exclude all databases with names matching one or more of the supplied regular expressions. All other databases will be included.

For example, to exclude all databases with the name containing the word `demo`, add the regex pattern in the exclude field as `.*demo.*`.

Checkout <a href="https://docs.open-metadata.org/connectors/ingestion/workflows/metadata/filter-patterns/database#database-filter-pattern" target="_blank">this</a> document for further examples on database filter patterns.
$$

$$section
### Schema Filter Pattern $(id="schemaFilterPattern")

Schema filter patterns are used to control whether to include schemas as part of metadata ingestion.

**Include**: Explicitly include schemas by adding a list of regular expressions to the `Include` field. OpenMetadata will include all schemas with names matching one or more of the supplied regular expressions. All other schemas will be excluded.

For example, to include only those schemas whose name starts with the word `demo`, add the regex pattern in the include field as `^demo.*`.

**Exclude**: Explicitly exclude schemas by adding a list of regular expressions to the `Exclude` field. OpenMetadata will exclude all schemas with names matching one or more of the supplied regular expressions. All other schemas will be included.

For example, to exclude all schemas with the name containing the word `demo`, add regex pattern in the exclude field as `.*demo.*`.

Checkout <a href="https://docs.open-metadata.org/connectors/ingestion/workflows/metadata/filter-patterns/database#database-filter-pattern" target="_blank">this</a> document for further examples on schema filter patterns.
$$

$$section
### Table Filter Pattern $(id="tableFilterPattern")

Table filter patterns are used to control whether to include tables as part of metadata ingestion.

**Include**: Explicitly include tables by adding a list of regular expressions to the `Include` field. OpenMetadata will include all tables with names matching one or more of the supplied regular expressions. All other tables will be excluded.

For example, to include only those tables whose name starts with the word `demo`, add the regex pattern in the include field as `^demo.*`.

**Exclude**: Explicitly exclude tables by adding a list of regular expressions to the `Exclude` field. OpenMetadata will exclude all tables with names matching one or more of the supplied regular expressions. All other tables will be included.

For example, to exclude all tables with the name containing the word `demo`, add the regex pattern in the exclude field as `.*demo.*`.

Checkout <a href="https://docs.open-metadata.org/connectors/ingestion/workflows/metadata/filter-patterns/database#table-filter-pattern" target="_blank">this</a> document for further examples on table filter patterns.
$$

$$section
### Enable Debug Logs $(id="enableDebugLog")

Set the `Enable Debug Log` toggle to set the logging level of the process to debug. You can check these logs in the Ingestion tab of the service and dig deeper into any errors you might find.
$$

$$section
### Include Views $(id="includeViews")
If activated the profiler will compute metric for view entity types. Note that it can have a negative impact on the profiler performance.
$$

$$section
### Use FQN For Filtering Views $(id="useFqnForFiltering")
Set this flag when you want to apply the filters on Fully Qualified Names (e.g `service_name.db_name.schema_name.table_name`) instead of applying them to the raw name of the asset (e.g `table_name`).

This Flag is useful in scenarios when you have different schemas with same name in multiple databases, or tables with same name in different schemas, and you want to filter out only one of them.

Checkout <a href="https://docs.open-metadata.org/connectors/ingestion/workflows/metadata/filter-patterns/database#table-filter-pattern" target="_blank">this</a> document for further examples on how to use this field.
$$


$$section
### Store Sample Data $(id="storeSampleData")

Set the Store Sample Data toggle to control whether to store sample data as part of Auto Classification workflow. If this is enabled, 50 rows will be ingested by default. You can update the number of rows in the "DatabaseServiceProfilerPipeline Advanced Config" section (i.e. `Sample Data Rows Count` setting).

If disabled, OpenMetadata will not store any sample data, but will still use it on-the-fly to compute the Auto Classification.
$$

$$section
### Enable Auto Classification $(id="enableAutoClassification")

Set the Enable Auto Classification toggle to control whether to automatically tag columns that might contain sensitive information.

Use the `Confidence` setting  to set the confidence level when inferring the tags for a column.
$$

$$section
### PII Inference Confidence Level $(id="confidence")
Confidence level to use when inferring whether a column should be applied the classification or not (between 0 and 100). A number closer to 100 will yield less false positive but potentially more false negative.
$$

$$section
### Sample Data Rows Count $(id="sampleDataCount")
Set the number of rows to ingest when `Ingest Sample Data` toggle is on. Defaults to 50.
$$

$$section
### Maximum Cell Length $(id="maxCellLength")

Controls the maximum character length for individual cell values in sample data during auto classification. Cell values exceeding this limit will be truncated to prevent memory issues during sampling and processing.

**Default**: 1000 characters

**When to increase**: If your sensitive data patterns or PII information appears in longer text fields (e.g., large JSON blobs, long descriptions, or comments), you may need to increase this value to preserve the full content for accurate classification.

**Performance impact**: Larger values consume more memory during sampling. Each character adds approximately 1KB of memory across all sampled rows. For example, setting this to 10,000 characters on a table with 50 sample rows would use roughly 500KB per column containing long text.

**Recommendation**: Start with the default 1000 characters. Only increase if you notice that important classification patterns are being missed due to truncation. Monitor memory usage when increasing this value for tables with many text columns.
$$

$$section
### Maximum NLP Text Length $(id="maxNlpTextLength")

Controls the maximum character length for text fields during NLP (Natural Language Processing) analysis and pattern recognition in auto classification. Text exceeding this limit will be truncated before being analyzed for sensitive information patterns.

**Default**: 1000 characters

**When to increase**: If your sensitive data patterns (like email addresses, phone numbers, or credit card numbers) frequently appear later in long text fields, or if you're using custom recognizers that need to analyze larger text segments, you should increase this value.

**Performance impact**: Larger values significantly increase NLP processing time and memory consumption during classification. NLP analysis is computationally expensive, and doubling this value can more than double the processing time per column. This also impacts the overall pipeline execution time.

**Recommendation**: The default 1000 characters balances accuracy and performance for most use cases. For tables with very long text columns (e.g., articles, logs, or transcripts), consider:
- First, verifying that sensitive data actually appears beyond the 1000-character mark
- Testing with a slightly higher value (e.g., 2000-3000) on a subset of tables before applying broadly
- Monitoring pipeline execution times to ensure they remain acceptable
$$
