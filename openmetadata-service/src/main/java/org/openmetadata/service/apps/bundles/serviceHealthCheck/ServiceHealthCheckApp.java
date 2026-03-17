package org.openmetadata.service.apps.bundles.serviceHealthCheck;

import static org.openmetadata.service.apps.scheduler.AppScheduler.SERVICE_ID;
import static org.openmetadata.service.apps.scheduler.OmAppJobListener.APP_RUN_STATS;

import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.entity.app.AppRunRecord;
import org.openmetadata.schema.system.Stats;
import org.openmetadata.schema.system.StepStats;
import org.openmetadata.service.apps.AbstractServiceNativeApplication;
import org.openmetadata.service.jdbi3.CollectionDAO;
import org.openmetadata.service.search.SearchRepository;
import org.quartz.JobExecutionContext;

@Slf4j
public class ServiceHealthCheckApp extends AbstractServiceNativeApplication {

  private volatile boolean stopped = false;

  public ServiceHealthCheckApp(CollectionDAO collectionDAO, SearchRepository searchRepository) {
    super(collectionDAO, searchRepository);
  }

  @Override
  public void startApp(JobExecutionContext jobExecutionContext) {
    String serviceIdStr =
        (String) jobExecutionContext.getJobDetail().getJobDataMap().get(SERVICE_ID);
    UUID serviceId = serviceIdStr != null ? UUID.fromString(serviceIdStr) : null;

    LOG.info(
        "[ServiceHealthCheck] Starting health check for app={}, serviceId={}",
        getApp().getName(),
        serviceId);

    Object config = serviceId != null ? getServiceAppConfiguration(serviceId) : Map.of();
    LOG.info("[ServiceHealthCheck] Config for service {}: {}", serviceId, config);

    try {
      // Simulate work with a 5-second sleep (allows testing stop/interrupt)
      for (int i = 0; i < 5; i++) {
        if (stopped) {
          LOG.info("[ServiceHealthCheck] Job was stopped for service {}", serviceId);
          return;
        }
        Thread.sleep(1000);
        LOG.info("[ServiceHealthCheck] Working... ({}/5) for service {}", i + 1, serviceId);
      }
    } catch (InterruptedException e) {
      LOG.info("[ServiceHealthCheck] Job interrupted for service {}", serviceId);
      Thread.currentThread().interrupt();
      return;
    }

    // Report stats
    Stats stats = new Stats();
    StepStats jobStats =
        new StepStats().withTotalRecords(1).withSuccessRecords(1).withFailedRecords(0);
    stats.setJobStats(jobStats);
    jobExecutionContext.getJobDetail().getJobDataMap().put(APP_RUN_STATS, stats);

    // Update run record
    AppRunRecord appRecord = getJobRecord(jobExecutionContext);
    if (appRecord != null) {
      appRecord.setStatus(AppRunRecord.Status.COMPLETED);
      pushAppStatusUpdates(jobExecutionContext, appRecord, true);
    }

    LOG.info(
        "[ServiceHealthCheck] Health check completed for app={}, serviceId={}",
        getApp().getName(),
        serviceId);
  }

  @Override
  public void stop() {
    LOG.info("[ServiceHealthCheck] Stop requested for app={}", getApp().getName());
    stopped = true;
  }
}
