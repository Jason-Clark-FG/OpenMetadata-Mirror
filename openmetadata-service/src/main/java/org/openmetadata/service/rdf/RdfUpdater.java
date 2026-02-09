package org.openmetadata.service.rdf;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.EntityInterface;
import org.openmetadata.schema.api.configuration.rdf.RdfConfiguration;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.EntityRelationship;
import org.openmetadata.service.util.AsyncService;

@Slf4j
public class RdfUpdater {

  private static RdfRepository rdfRepository;

  private RdfUpdater() {}

  public static void initialize(RdfConfiguration config) {
    if (config.getEnabled() != null && config.getEnabled()) {
      RdfRepository.initialize(config);
      rdfRepository = RdfRepository.getInstance();
      LOG.info("RDF updater initialized");
    } else {
      LOG.info("RDF updater disabled");
    }
  }

  public static void updateEntity(EntityInterface entity) {
    if (rdfRepository != null && rdfRepository.isEnabled()) {
      runAsync(() -> rdfRepository.createOrUpdate(entity), "update entity " + entity.getId());
    }
  }

  public static void deleteEntity(EntityReference entityReference) {
    if (rdfRepository != null && rdfRepository.isEnabled()) {
      runAsync(
          () -> rdfRepository.delete(entityReference), "delete entity " + entityReference.getId());
    }
  }

  public static void addRelationship(EntityRelationship relationship) {
    if (rdfRepository != null && rdfRepository.isEnabled()) {
      runAsync(() -> rdfRepository.addRelationship(relationship), "add relationship");
    }
  }

  public static void removeRelationship(EntityRelationship relationship) {
    if (rdfRepository != null && rdfRepository.isEnabled()) {
      runAsync(() -> rdfRepository.removeRelationship(relationship), "remove relationship");
    }
  }

  public static boolean isEnabled() {
    return rdfRepository != null && rdfRepository.isEnabled();
  }

  public static void disable() {
    rdfRepository = null;
    RdfRepository.reset();
    LOG.info("RDF updater disabled");
  }

  private static void runAsync(Runnable task, String context) {
    ExecutorService executor = AsyncService.getInstance().getExecutorService();
    CompletableFuture.runAsync(task, executor)
        .exceptionally(
            ex -> {
              LOG.error("Failed to {} in RDF", context, ex);
              return null;
            });
  }
}
