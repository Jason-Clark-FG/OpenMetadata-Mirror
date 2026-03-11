package org.openmetadata.service.apps.bundles.searchIndex;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.openmetadata.schema.system.EntityStats;
import org.openmetadata.schema.system.IndexingError;
import org.openmetadata.schema.system.Stats;
import org.openmetadata.schema.system.StepStats;
import org.openmetadata.schema.utils.ResultList;
import org.openmetadata.service.Entity;
import org.openmetadata.service.exception.SearchIndexException;
import org.openmetadata.service.jdbi3.CollectionDAO;
import org.openmetadata.service.search.SearchRepository;
import org.openmetadata.service.util.RestUtil;

class SearchIndexExecutorControlFlowTest {

  private SearchIndexExecutor executor;
  private SearchRepository searchRepository;
  private CollectionDAO collectionDAO;

  @BeforeEach
  void setUp() {
    collectionDAO = mock(CollectionDAO.class);
    searchRepository = mock(SearchRepository.class);
    executor = new SearchIndexExecutor(collectionDAO, searchRepository);
  }

  @AfterEach
  void tearDown() {
    executor.close();
  }

  @Test
  void hasReachedEndCursorHandlesNumericJsonAndFallbackComparisons() throws Exception {
    assertTrue(
        (Boolean)
            invokePrivateMethod(
                "hasReachedEndCursor",
                new Class<?>[] {String.class, String.class},
                RestUtil.encodeCursor("10"),
                RestUtil.encodeCursor("5")));
    assertFalse(
        (Boolean)
            invokePrivateMethod(
                "hasReachedEndCursor",
                new Class<?>[] {String.class, String.class},
                RestUtil.encodeCursor("4"),
                RestUtil.encodeCursor("5")));
    assertTrue(
        (Boolean)
            invokePrivateMethod(
                "hasReachedEndCursor",
                new Class<?>[] {String.class, String.class},
                RestUtil.encodeCursor("{\"name\":\"b\",\"id\":\"2\"}"),
                RestUtil.encodeCursor("{\"name\":\"a\",\"id\":\"9\"}")));
    assertTrue(
        (Boolean)
            invokePrivateMethod(
                "hasReachedEndCursor",
                new Class<?>[] {String.class, String.class},
                RestUtil.encodeCursor("z"),
                RestUtil.encodeCursor("a")));
  }

  @Test
  void isTransientReadErrorRecognizesRetryableMessages() throws Exception {
    SearchIndexException timeout =
        new SearchIndexException(new IndexingError().withMessage("Connection timeout"));
    SearchIndexException nonTransient =
        new SearchIndexException(new IndexingError().withMessage("Entity not found"));

    assertTrue(
        (Boolean)
            invokePrivateMethod(
                "isTransientReadError",
                new Class<?>[] {SearchIndexException.class},
                timeout));
    assertFalse(
        (Boolean)
            invokePrivateMethod(
                "isTransientReadError",
                new Class<?>[] {SearchIndexException.class},
                nonTransient));
  }

  @Test
  void readWithRetryRetriesTransientErrorsThenSucceeds() throws Exception {
    AtomicInteger attempts = new AtomicInteger();
    SearchIndexExecutor.KeysetBatchReader batchReader =
        cursor -> {
          if (attempts.getAndIncrement() < 2) {
            throw new SearchIndexException(new IndexingError().withMessage("socket timeout"));
          }
          return new ResultList<>(java.util.List.of("entity"), null, null, 1);
        };

    ResultList<?> result =
        (ResultList<?>)
            invokePrivateMethod(
                "readWithRetry",
                new Class<?>[] {
                  SearchIndexExecutor.KeysetBatchReader.class, String.class, String.class
                },
                batchReader,
                null,
                "table");

    assertEquals(3, attempts.get());
    assertEquals(1, result.getData().size());
  }

  @Test
  void readWithRetryThrowsNonTransientErrorsImmediately() {
    SearchIndexExecutor.KeysetBatchReader batchReader =
        cursor -> {
          throw new SearchIndexException(new IndexingError().withMessage("Entity not found"));
        };

    InvocationTargetException thrown =
        assertThrows(
            InvocationTargetException.class,
            () ->
                invokePrivateMethod(
                    "readWithRetry",
                    new Class<?>[] {
                      SearchIndexExecutor.KeysetBatchReader.class, String.class, String.class
                    },
                    batchReader,
                    null,
                    "table"));

    assertTrue(thrown.getCause() instanceof SearchIndexException);
  }

  @Test
  void syncSinkStatsFromBulkSinkCopiesSinkVectorAndProcessStats() throws Exception {
    BulkSink sink = mock(BulkSink.class);
    StepStats sinkStats = new StepStats().withTotalRecords(20).withSuccessRecords(18).withFailedRecords(2);
    StepStats vectorStats =
        new StepStats().withTotalRecords(10).withSuccessRecords(9).withFailedRecords(1);
    StepStats processStats =
        new StepStats().withTotalRecords(20).withSuccessRecords(19).withFailedRecords(1);
    when(sink.getStats()).thenReturn(sinkStats);
    when(sink.getVectorStats()).thenReturn(vectorStats);
    when(sink.getProcessStats()).thenReturn(processStats);

    setField("searchIndexSink", sink);
    executor.getStats().set(initializeStats(Set.of("table")));

    invokePrivateMethod("syncSinkStatsFromBulkSink", new Class<?>[0]);

    Stats stats = executor.getStats().get();
    assertEquals(20, stats.getSinkStats().getTotalRecords());
    assertEquals(18, stats.getSinkStats().getSuccessRecords());
    assertEquals(2, stats.getSinkStats().getFailedRecords());
    assertSame(vectorStats, stats.getVectorStats());
    assertSame(processStats, stats.getProcessStats());
  }

  @Test
  void closeSinkIfNeededFlushesVectorTasksAndClosesOnlyOnce() throws Exception {
    BulkSink sink = mock(BulkSink.class);
    when(sink.getPendingVectorTaskCount()).thenReturn(2);
    when(sink.awaitVectorCompletionWithDetails(300)).thenReturn(VectorCompletionResult.success(150));
    when(sink.getStats()).thenReturn(new StepStats().withTotalRecords(5).withSuccessRecords(5));
    when(sink.getVectorStats()).thenReturn(new StepStats().withTotalRecords(2).withSuccessRecords(2));
    when(sink.getProcessStats()).thenReturn(new StepStats().withTotalRecords(5).withSuccessRecords(5));

    setField("searchIndexSink", sink);
    executor.getStats().set(initializeStats(Set.of("table")));

    invokePrivateMethod("closeSinkIfNeeded", new Class<?>[0]);
    invokePrivateMethod("closeSinkIfNeeded", new Class<?>[0]);

    verify(sink).awaitVectorCompletionWithDetails(300);
    verify(sink, times(1)).close();
  }

  @Test
  void adjustThreadsForLimitReducesRequestedCountsWhenTheyExceedGlobalCap() throws Exception {
    setField(
        "config",
        ReindexingConfiguration.builder()
            .entities(Set.of("table"))
            .build());

    SearchIndexExecutor.ThreadConfiguration configuration =
        (SearchIndexExecutor.ThreadConfiguration)
            invokePrivateMethod(
                "adjustThreadsForLimit",
                new Class<?>[] {int.class, int.class},
                40,
                40);

    assertTrue(configuration.numProducers() < 40);
    assertTrue(configuration.numConsumers() < 40);
  }

  @Test
  void initializeQueueAndExecutorsBuildsBoundedInfrastructure() throws Exception {
    setField(
        "config",
        ReindexingConfiguration.builder().entities(Set.of("table", "dashboard")).queueSize(200).build());
    setField("batchSize", new java.util.concurrent.atomic.AtomicReference<>(50));

    int effectiveQueueSize =
        (Integer)
            invokePrivateMethod(
                "initializeQueueAndExecutors",
                new Class<?>[] {SearchIndexExecutor.ThreadConfiguration.class, int.class},
                new SearchIndexExecutor.ThreadConfiguration(3, 4),
                2);

    assertTrue(effectiveQueueSize > 0);
    assertTrue(effectiveQueueSize <= 200);
    assertNotNull(getField("taskQueue"));
    assertNotNull(getField("producerExecutor"));
    assertNotNull(getField("consumerExecutor"));
    assertNotNull(getField("jobExecutor"));
  }

  @Test
  void buildResultUsesStatsToDetermineCompletionStatus() throws Exception {
    Stats completed = initializeStats(Set.of("table"));
    completed.getJobStats().setTotalRecords(10);
    completed.getJobStats().setSuccessRecords(10);
    completed.getJobStats().setFailedRecords(0);
    executor.getStats().set(completed);
    setField("startTime", System.currentTimeMillis() - 5000L);

    ExecutionResult success =
        (ExecutionResult) invokePrivateMethod("buildResult", new Class<?>[0]);
    assertEquals(ExecutionResult.Status.COMPLETED, success.status());

    Stats withErrors = initializeStats(Set.of("table"));
    withErrors.getReaderStats().setTotalRecords(10);
    withErrors.getReaderStats().setFailedRecords(1);
    withErrors.getProcessStats().setFailedRecords(1);
    withErrors.getSinkStats().setTotalRecords(8);
    withErrors.getSinkStats().setSuccessRecords(8);
    executor.getStats().set(withErrors);

    ExecutionResult completedWithErrors =
        (ExecutionResult) invokePrivateMethod("buildResult", new Class<?>[0]);
    assertEquals(ExecutionResult.Status.COMPLETED_WITH_ERRORS, completedWithErrors.status());
  }

  @Test
  void getAllReturnsOnlyIndexedEntityTypesAndTimeSeriesEntities() throws Exception {
    when(searchRepository.getEntityIndexMap())
        .thenReturn(
            Map.of(
                Entity.TABLE, mock(org.openmetadata.search.IndexMapping.class),
                Entity.ENTITY_REPORT_DATA, mock(org.openmetadata.search.IndexMapping.class)));

    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class)) {
      entityMock.when(Entity::getEntityList).thenReturn(Set.of(Entity.TABLE, Entity.USER));

      @SuppressWarnings("unchecked")
      Set<String> entities = (Set<String>) invokePrivateMethod("getAll", new Class<?>[0]);

      assertTrue(entities.contains(Entity.TABLE));
      assertTrue(entities.contains(Entity.ENTITY_REPORT_DATA));
      assertFalse(entities.contains(Entity.USER));
    }
  }

  @Test
  void stopFlushesSinkAndShutsExecutorsDown() throws Exception {
    BulkSink sink = mock(BulkSink.class);
    when(sink.getActiveBulkRequestCount()).thenReturn(2);
    when(sink.flushAndAwait(10)).thenReturn(true);
    setField("searchIndexSink", sink);
    setField("producerExecutor", Executors.newSingleThreadExecutor());
    setField("jobExecutor", Executors.newSingleThreadExecutor());
    setField("consumerExecutor", Executors.newSingleThreadExecutor());
    setField("taskQueue", new java.util.concurrent.LinkedBlockingQueue<>());

    executor.stop();

    assertTrue(executor.isStopped());
    verify(sink).flushAndAwait(10);
    assertTrue(((ExecutorService) getField("producerExecutor")).isShutdown());
    assertTrue(((ExecutorService) getField("jobExecutor")).isShutdown());
    assertTrue(((ExecutorService) getField("consumerExecutor")).isShutdown());
  }

  private Stats initializeStats(Set<String> entities) {
    Stats stats = executor.initializeTotalRecords(entities);
    if (stats.getEntityStats() == null) {
      stats.setEntityStats(new EntityStats());
    }
    return stats;
  }

  private Object invokePrivateMethod(String methodName, Class<?>[] parameterTypes, Object... args)
      throws Exception {
    Method method = SearchIndexExecutor.class.getDeclaredMethod(methodName, parameterTypes);
    method.setAccessible(true);
    return method.invoke(executor, args);
  }

  private void setField(String fieldName, Object value) throws Exception {
    Field field = SearchIndexExecutor.class.getDeclaredField(fieldName);
    field.setAccessible(true);
    field.set(executor, value);
  }

  private Object getField(String fieldName) throws Exception {
    Field field = SearchIndexExecutor.class.getDeclaredField(fieldName);
    field.setAccessible(true);
    return field.get(executor);
  }
}
