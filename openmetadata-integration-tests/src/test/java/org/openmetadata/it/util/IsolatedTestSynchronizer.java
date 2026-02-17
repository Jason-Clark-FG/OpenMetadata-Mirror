package org.openmetadata.it.util;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ForkJoinPool;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.extension.AfterAllCallback;
import org.junit.jupiter.api.extension.BeforeAllCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Globally auto-detected extension that enforces two-phase test execution:
 *
 * <ol>
 *   <li><b>Isolation phase</b>: {@link IsolatedTest} classes run one at a time (serialized via a
 *       semaphore). All non-isolated classes are blocked during this phase.
 *   <li><b>Parallel phase</b>: Once every isolated class has completed, non-isolated classes are
 *       unblocked and run concurrently.
 * </ol>
 *
 * <p>Uses {@link ForkJoinPool.ManagedBlocker} so that blocked threads do not starve JUnit's
 * ForkJoinPool — compensating threads are created as needed.
 *
 * <p>The set of isolated classes is published by {@link IsolatedFirstClassOrderer} during test
 * discovery (before any test execution begins).
 */
public class IsolatedTestSynchronizer implements BeforeAllCallback, AfterAllCallback {

  private static final Logger LOG = LoggerFactory.getLogger(IsolatedTestSynchronizer.class);

  private static final Semaphore ISOLATED_MUTEX = new Semaphore(1);
  private static final AtomicInteger ISOLATED_REMAINING = new AtomicInteger(-1);
  private static final CountDownLatch ISOLATION_DONE = new CountDownLatch(1);

  @Override
  public void beforeAll(ExtensionContext context) throws InterruptedException {
    initIsolatedCount();
    String className = context.getRequiredTestClass().getSimpleName();

    if (isIsolated(context)) {
      LOG.info("{} is ISOLATED, acquiring mutex (remaining={})", className, ISOLATED_REMAINING);
      managedAcquire(ISOLATED_MUTEX);
      LOG.info("{} acquired mutex, running exclusively", className);
    } else {
      managedAwait(ISOLATION_DONE);
    }
  }

  @Override
  public void afterAll(ExtensionContext context) {
    if (isIsolated(context)) {
      String className = context.getRequiredTestClass().getSimpleName();
      ISOLATED_MUTEX.release();
      int remaining = ISOLATED_REMAINING.decrementAndGet();
      LOG.info("{} finished, released mutex (remaining={})", className, remaining);
      if (remaining == 0) {
        LOG.info("All isolated classes done, opening parallel gate");
        ISOLATION_DONE.countDown();
      }
    }
  }

  private static synchronized void initIsolatedCount() {
    if (ISOLATED_REMAINING.get() == -1) {
      int count = IsolatedFirstClassOrderer.ISOLATED_CLASSES.size();
      ISOLATED_REMAINING.set(count);
      if (count == 0) {
        ISOLATION_DONE.countDown();
      }
    }
  }

  private static boolean isIsolated(ExtensionContext context) {
    Class<?> testClass = context.getRequiredTestClass();
    while (testClass != null) {
      if (testClass.isAnnotationPresent(IsolatedTest.class)) {
        return true;
      }
      testClass = testClass.getEnclosingClass();
    }
    return false;
  }

  private static void managedAcquire(Semaphore semaphore) throws InterruptedException {
    ForkJoinPool.managedBlock(
        new ForkJoinPool.ManagedBlocker() {
          @Override
          public boolean block() throws InterruptedException {
            semaphore.acquire();
            return true;
          }

          @Override
          public boolean isReleasable() {
            return semaphore.tryAcquire();
          }
        });
  }

  private static void managedAwait(CountDownLatch latch) throws InterruptedException {
    ForkJoinPool.managedBlock(
        new ForkJoinPool.ManagedBlocker() {
          @Override
          public boolean block() throws InterruptedException {
            latch.await();
            return true;
          }

          @Override
          public boolean isReleasable() {
            return latch.getCount() == 0;
          }
        });
  }
}
