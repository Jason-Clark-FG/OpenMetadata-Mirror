package org.openmetadata.service.search.vector.client;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.ssl.SSLSession;
import org.junit.jupiter.api.Test;
import org.openmetadata.schema.service.configuration.elasticsearch.ElasticSearchConfiguration;
import org.openmetadata.schema.service.configuration.elasticsearch.NaturalLanguageSearchConfiguration;
import org.openmetadata.schema.service.configuration.elasticsearch.Openai;

class OpenAIEmbeddingClientTest {

  private static class StubHttpResponse implements HttpResponse<String> {
    private final String body;
    private final int statusCode;
    private final HttpRequest request;

    StubHttpResponse(String body, int statusCode, HttpRequest request) {
      this.body = body;
      this.statusCode = statusCode;
      this.request = request;
    }

    @Override
    public int statusCode() {
      return statusCode;
    }

    @Override
    public HttpRequest request() {
      return request;
    }

    @Override
    public Optional<HttpResponse<String>> previousResponse() {
      return Optional.empty();
    }

    @Override
    public HttpHeaders headers() {
      return HttpHeaders.of(Map.of(), (a, b) -> true);
    }

    @Override
    public String body() {
      return body;
    }

    @Override
    public Optional<SSLSession> sslSession() {
      return Optional.empty();
    }

    @Override
    public URI uri() {
      return request.uri();
    }

    @Override
    public HttpClient.Version version() {
      return HttpClient.Version.HTTP_2;
    }
  }

  @Test
  void testClientCreationWithConfig() {
    ElasticSearchConfiguration config = buildConfig("test-key", "text-embedding-3-small", 1536);
    OpenAIEmbeddingClient client = new OpenAIEmbeddingClient(config);

    assertEquals(1536, client.getDimension());
    assertEquals("text-embedding-3-small", client.getModelId());
  }

  @Test
  void testClientCreationWithCustomModel() {
    ElasticSearchConfiguration config = buildConfig("test-key", "text-embedding-ada-002", 768);
    OpenAIEmbeddingClient client = new OpenAIEmbeddingClient(config);

    assertEquals(768, client.getDimension());
    assertEquals("text-embedding-ada-002", client.getModelId());
  }

  @Test
  void testAzureEndpointResolution() {
    Openai openaiCfg =
        new Openai()
            .withApiKey("test-key")
            .withEmbeddingModelId("text-embedding-3-small")
            .withEmbeddingDimension(1536)
            .withEndpoint("https://my-resource.openai.azure.com")
            .withDeploymentName("my-deployment")
            .withApiVersion("2024-02-01");

    NaturalLanguageSearchConfiguration nlsCfg = new NaturalLanguageSearchConfiguration();
    nlsCfg.setOpenai(openaiCfg);

    ElasticSearchConfiguration config = new ElasticSearchConfiguration();
    config.setNaturalLanguageSearch(nlsCfg);

    OpenAIEmbeddingClient client = new OpenAIEmbeddingClient(config);
    assertNotNull(client);
  }

  @Test
  void testAzureWithoutApiVersionThrows() {
    Openai openaiCfg =
        new Openai()
            .withApiKey("test-key")
            .withEmbeddingModelId("text-embedding-3-small")
            .withEmbeddingDimension(1536)
            .withEndpoint("https://my-resource.openai.azure.com")
            .withDeploymentName("my-deployment")
            .withApiVersion(null);

    NaturalLanguageSearchConfiguration nlsCfg = new NaturalLanguageSearchConfiguration();
    nlsCfg.setOpenai(openaiCfg);

    ElasticSearchConfiguration config = new ElasticSearchConfiguration();
    config.setNaturalLanguageSearch(nlsCfg);

    assertThrows(IllegalArgumentException.class, () -> new OpenAIEmbeddingClient(config));
  }

  @Test
  void testMissingApiKeyThrows() {
    Openai openaiCfg =
        new Openai().withEmbeddingModelId("text-embedding-3-small").withEmbeddingDimension(1536);

    NaturalLanguageSearchConfiguration nlsCfg = new NaturalLanguageSearchConfiguration();
    nlsCfg.setOpenai(openaiCfg);

    ElasticSearchConfiguration config = new ElasticSearchConfiguration();
    config.setNaturalLanguageSearch(nlsCfg);

    assertThrows(IllegalArgumentException.class, () -> new OpenAIEmbeddingClient(config));
  }

  @Test
  void testMissingModelIdThrows() {
    Openai openaiCfg =
        new Openai().withApiKey("test-key").withEmbeddingModelId(null).withEmbeddingDimension(1536);

    NaturalLanguageSearchConfiguration nlsCfg = new NaturalLanguageSearchConfiguration();
    nlsCfg.setOpenai(openaiCfg);

    ElasticSearchConfiguration config = new ElasticSearchConfiguration();
    config.setNaturalLanguageSearch(nlsCfg);

    assertThrows(IllegalArgumentException.class, () -> new OpenAIEmbeddingClient(config));
  }

  @Test
  void testInvalidDimensionThrows() {
    Openai openaiCfg =
        new Openai()
            .withApiKey("test-key")
            .withEmbeddingModelId("text-embedding-3-small")
            .withEmbeddingDimension(0);

    NaturalLanguageSearchConfiguration nlsCfg = new NaturalLanguageSearchConfiguration();
    nlsCfg.setOpenai(openaiCfg);

    ElasticSearchConfiguration config = new ElasticSearchConfiguration();
    config.setNaturalLanguageSearch(nlsCfg);

    assertThrows(IllegalArgumentException.class, () -> new OpenAIEmbeddingClient(config));
  }

  @Test
  void testNullTextThrows() {
    ElasticSearchConfiguration config = buildConfig("test-key", "text-embedding-3-small", 1536);
    OpenAIEmbeddingClient client = new OpenAIEmbeddingClient(config);

    assertThrows(IllegalArgumentException.class, () -> client.embed(null));
  }

  @Test
  void testBlankTextThrows() {
    ElasticSearchConfiguration config = buildConfig("test-key", "text-embedding-3-small", 1536);
    OpenAIEmbeddingClient client = new OpenAIEmbeddingClient(config);

    assertThrows(IllegalArgumentException.class, () -> client.embed("   "));
  }

  @Test
  void testEmbeddingWithUnreachableEndpoint() {
    Openai openaiCfg =
        new Openai()
            .withApiKey("test-key")
            .withEmbeddingModelId("text-embedding-3-small")
            .withEmbeddingDimension(1536)
            .withEndpoint("http://localhost:1");

    NaturalLanguageSearchConfiguration nlsCfg = new NaturalLanguageSearchConfiguration();
    nlsCfg.setOpenai(openaiCfg);

    ElasticSearchConfiguration config = new ElasticSearchConfiguration();
    config.setNaturalLanguageSearch(nlsCfg);

    OpenAIEmbeddingClient client = new OpenAIEmbeddingClient(config);
    assertThrows(RuntimeException.class, () -> client.embed("test text"));
  }

  @Test
  void testCustomEndpointWithoutDeployment() {
    Openai openaiCfg =
        new Openai()
            .withApiKey("test-key")
            .withEmbeddingModelId("text-embedding-3-small")
            .withEmbeddingDimension(1536)
            .withEndpoint("https://custom.api.example.com");

    NaturalLanguageSearchConfiguration nlsCfg = new NaturalLanguageSearchConfiguration();
    nlsCfg.setOpenai(openaiCfg);

    ElasticSearchConfiguration config = new ElasticSearchConfiguration();
    config.setNaturalLanguageSearch(nlsCfg);

    OpenAIEmbeddingClient client = new OpenAIEmbeddingClient(config);
    assertNotNull(client);
    assertEquals(1536, client.getDimension());
  }

  @SuppressWarnings("unchecked")
  @Test
  void testConcurrencyLimiterEnforced() throws Exception {
    AtomicInteger concurrentCount = new AtomicInteger(0);
    AtomicInteger maxObservedConcurrent = new AtomicInteger(0);
    CountDownLatch allStarted = new CountDownLatch(1);

    String fakeResponse =
        "{\"data\":[{\"embedding\":[0.1,0.2,0.3]}],\"model\":\"test\",\"usage\":{}}";

    HttpClient mockHttpClient =
        new HttpClient() {
          @Override
          public java.util.Optional<java.net.Authenticator> authenticator() {
            return java.util.Optional.empty();
          }

          @Override
          public java.util.Optional<java.net.CookieHandler> cookieHandler() {
            return java.util.Optional.empty();
          }

          @Override
          public java.net.http.HttpClient.Redirect followRedirects() {
            return Redirect.NEVER;
          }

          @Override
          public java.util.Optional<java.net.ProxySelector> proxy() {
            return java.util.Optional.empty();
          }

          @Override
          public javax.net.ssl.SSLContext sslContext() {
            return null;
          }

          @Override
          public javax.net.ssl.SSLParameters sslParameters() {
            return null;
          }

          @Override
          public java.util.Optional<java.util.concurrent.Executor> executor() {
            return java.util.Optional.empty();
          }

          @Override
          public java.net.http.HttpClient.Version version() {
            return Version.HTTP_2;
          }

          @Override
          public <T> HttpResponse<T> send(
              HttpRequest request, HttpResponse.BodyHandler<T> responseBodyHandler)
              throws IOException, InterruptedException {
            int current = concurrentCount.incrementAndGet();
            maxObservedConcurrent.accumulateAndGet(current, Math::max);
            try {
              allStarted.await();
              Thread.sleep(50);
            } finally {
              concurrentCount.decrementAndGet();
            }
            return (HttpResponse<T>) new StubHttpResponse(fakeResponse, 200, request);
          }

          @Override
          public <T> CompletableFuture<HttpResponse<T>> sendAsync(
              HttpRequest request, HttpResponse.BodyHandler<T> responseBodyHandler) {
            return CompletableFuture.supplyAsync(
                () -> {
                  try {
                    return send(request, responseBodyHandler);
                  } catch (Exception e) {
                    throw new RuntimeException(e);
                  }
                });
          }

          @Override
          public <T> CompletableFuture<HttpResponse<T>> sendAsync(
              HttpRequest request,
              HttpResponse.BodyHandler<T> responseBodyHandler,
              HttpResponse.PushPromiseHandler<T> pushPromiseHandler) {
            return sendAsync(request, responseBodyHandler);
          }
        };

    OpenAIEmbeddingClient client =
        new OpenAIEmbeddingClient(
            mockHttpClient,
            "test-key",
            "test-model",
            3,
            "http://localhost:9999/v1/embeddings",
            false);

    int totalRequests = 30;
    List<CompletableFuture<float[]>> futures = new ArrayList<>();
    for (int i = 0; i < totalRequests; i++) {
      futures.add(CompletableFuture.supplyAsync(() -> client.embed("test text")));
    }

    allStarted.countDown();

    for (CompletableFuture<float[]> f : futures) {
      float[] result = f.join();
      assertNotNull(result);
      assertEquals(3, result.length);
    }

    assertTrue(
        maxObservedConcurrent.get() <= EmbeddingClient.MAX_CONCURRENT_REQUESTS,
        "Max concurrent requests ("
            + maxObservedConcurrent.get()
            + ") exceeded limit ("
            + EmbeddingClient.MAX_CONCURRENT_REQUESTS
            + ")");
  }

  private ElasticSearchConfiguration buildConfig(String apiKey, String modelId, int dimension) {
    Openai openaiCfg =
        new Openai()
            .withApiKey(apiKey)
            .withEmbeddingModelId(modelId)
            .withEmbeddingDimension(dimension);

    NaturalLanguageSearchConfiguration nlsCfg = new NaturalLanguageSearchConfiguration();
    nlsCfg.setOpenai(openaiCfg);

    ElasticSearchConfiguration config = new ElasticSearchConfiguration();
    config.setNaturalLanguageSearch(nlsCfg);
    return config;
  }
}
