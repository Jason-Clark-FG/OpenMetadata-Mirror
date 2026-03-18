package org.openmetadata.service.search.vector.client;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Semaphore;

public abstract class EmbeddingClient {
  static final int MAX_CONCURRENT_REQUESTS = 10;

  private final Semaphore concurrencyLimiter = new Semaphore(MAX_CONCURRENT_REQUESTS);

  protected abstract float[] doEmbed(String text);

  public final float[] embed(String text) {
    try {
      concurrencyLimiter.acquire();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new RuntimeException(
          "Embedding generation was interrupted while waiting for permit", e);
    }
    try {
      return doEmbed(text);
    } finally {
      concurrencyLimiter.release();
    }
  }

  public List<float[]> embedBatch(List<String> texts) {
    List<float[]> results = new ArrayList<>();
    for (String text : texts) {
      results.add(embed(text));
    }
    return results;
  }

  public abstract int getDimension();

  public abstract String getModelId();
}
