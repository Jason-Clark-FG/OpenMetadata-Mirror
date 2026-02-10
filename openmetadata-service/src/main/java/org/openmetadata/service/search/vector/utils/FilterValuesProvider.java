package org.openmetadata.service.search.vector.utils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.EntityInterface;
import org.openmetadata.schema.entity.teams.User;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.Include;
import org.openmetadata.schema.type.TagLabel;
import org.openmetadata.service.Entity;
import org.openmetadata.service.jdbi3.EntityRepository;
import org.openmetadata.service.jdbi3.ListFilter;
import org.openmetadata.service.jdbi3.UserRepository;

@Slf4j
public final class FilterValuesProvider {
  private static final long TTL_MILLIS = TimeUnit.MINUTES.toMillis(10);

  private static volatile List<String> cachedDomains;
  private static volatile List<String> cachedTags;
  private static volatile List<String> cachedOwners;
  private static volatile List<String> cachedServiceTypes;
  private static volatile List<String> cachedTiers;
  private static volatile List<String> cachedEntityTypes;
  private static volatile long lastRefreshTime = 0;

  private FilterValuesProvider() {}

  public static List<String> domains() {
    refreshIfStale();
    return cachedDomains != null ? cachedDomains : Collections.emptyList();
  }

  public static List<String> tags() {
    refreshIfStale();
    return cachedTags != null ? cachedTags : Collections.emptyList();
  }

  public static List<String> owners() {
    refreshIfStale();
    return cachedOwners != null ? cachedOwners : Collections.emptyList();
  }

  public static List<String> serviceTypes() {
    refreshIfStale();
    return cachedServiceTypes != null ? cachedServiceTypes : Collections.emptyList();
  }

  public static List<String> tiers() {
    refreshIfStale();
    return cachedTiers != null ? cachedTiers : Collections.emptyList();
  }

  public static List<String> entityTypes() {
    refreshIfStale();
    return cachedEntityTypes != null ? cachedEntityTypes : AvailableEntityTypes.LIST;
  }

  public static void refreshIfStale() {
    long now = System.currentTimeMillis();
    if (now - lastRefreshTime > TTL_MILLIS) {
      synchronized (FilterValuesProvider.class) {
        if (now - lastRefreshTime > TTL_MILLIS) {
          forceRefresh();
        }
      }
    }
  }

  public static synchronized void forceRefresh() {
    cachedDomains = loadDomains();
    cachedTags = loadTags();
    cachedOwners = loadOwners();
    cachedServiceTypes = loadServiceTypes();
    cachedTiers = loadTiers();
    cachedEntityTypes = AvailableEntityTypes.LIST;
    lastRefreshTime = System.currentTimeMillis();
  }

  @SuppressWarnings("unchecked")
  private static List<String> loadDomains() {
    try {
      if (!Entity.hasEntityRepository(Entity.DOMAIN)) {
        return Collections.emptyList();
      }
      EntityRepository<EntityInterface> repo =
          (EntityRepository<EntityInterface>) Entity.getEntityRepository(Entity.DOMAIN);
      List<EntityInterface> entities =
          repo.listAll(repo.getFields("name"), new ListFilter(Include.ALL));
      return entities.stream()
          .map(EntityInterface::getName)
          .filter(Objects::nonNull)
          .distinct()
          .sorted()
          .collect(Collectors.toUnmodifiableList());
    } catch (Exception e) {
      LOG.warn("Failed to load domains for vector filter cache: {}", e.getMessage());
      return Collections.emptyList();
    }
  }

  @SuppressWarnings("unchecked")
  private static List<String> loadTags() {
    try {
      if (!Entity.hasEntityRepository(Entity.TAG)) {
        return Collections.emptyList();
      }
      EntityRepository<EntityInterface> repo =
          (EntityRepository<EntityInterface>) Entity.getEntityRepository(Entity.TAG);
      List<EntityInterface> entities =
          repo.listAll(repo.getFields("fullyQualifiedName"), new ListFilter(Include.ALL));
      return entities.stream()
          .map(EntityInterface::getFullyQualifiedName)
          .filter(Objects::nonNull)
          .distinct()
          .sorted()
          .collect(Collectors.toUnmodifiableList());
    } catch (Exception e) {
      LOG.warn("Failed to load tags for vector filter cache: {}", e.getMessage());
      return Collections.emptyList();
    }
  }

  private static List<String> loadOwners() {
    try {
      List<String> ownerNames = new ArrayList<>();
      if (Entity.hasEntityRepository(Entity.USER)) {
        UserRepository userRepo = (UserRepository) Entity.getEntityRepository(Entity.USER);
        List<User> users =
            userRepo.listAll(userRepo.getFields("name,isBot"), new ListFilter(Include.ALL));
        users.stream()
            .filter(u -> !Boolean.TRUE.equals(u.getIsBot()))
            .map(User::getName)
            .filter(Objects::nonNull)
            .forEach(ownerNames::add);
      }
      if (Entity.hasEntityRepository(Entity.TEAM)) {
        @SuppressWarnings("unchecked")
        EntityRepository<EntityInterface> teamRepo =
            (EntityRepository<EntityInterface>) Entity.getEntityRepository(Entity.TEAM);
        List<EntityInterface> teams =
            teamRepo.listAll(teamRepo.getFields("name"), new ListFilter(Include.ALL));
        for (EntityInterface team : teams) {
          if (team.getName() != null) {
            ownerNames.add(team.getName());
          }
        }
      }
      return ownerNames.stream().distinct().sorted().collect(Collectors.toUnmodifiableList());
    } catch (Exception e) {
      LOG.warn("Failed to load owners for vector filter cache: {}", e.getMessage());
      return Collections.emptyList();
    }
  }

  private static List<String> loadServiceTypes() {
    try {
      List<String> serviceTypes = new ArrayList<>();
      for (String entityType : Entity.getEntityList()) {
        String serviceType = Entity.getServiceType(entityType);
        if (serviceType != null && !serviceTypes.contains(serviceType)) {
          serviceTypes.add(serviceType);
        }
      }
      return serviceTypes;
    } catch (Exception e) {
      LOG.warn("Failed to load service types for vector filter cache: {}", e.getMessage());
      return Collections.emptyList();
    }
  }

  @SuppressWarnings("unchecked")
  private static List<String> loadTiers() {
    try {
      if (!Entity.hasEntityRepository(Entity.TAG)) {
        return Collections.emptyList();
      }
      EntityRepository<EntityInterface> repo =
          (EntityRepository<EntityInterface>) Entity.getEntityRepository(Entity.TAG);
      List<EntityInterface> entities =
          repo.listAll(repo.getFields("fullyQualifiedName"), new ListFilter(Include.ALL));
      return entities.stream()
          .map(EntityInterface::getFullyQualifiedName)
          .filter(fqn -> fqn != null && fqn.startsWith("Tier."))
          .distinct()
          .sorted()
          .collect(Collectors.toUnmodifiableList());
    } catch (Exception e) {
      LOG.warn("Failed to load tiers for vector filter cache: {}", e.getMessage());
      return Collections.emptyList();
    }
  }

  public static List<String> getOwnerIds(EntityInterface entity) {
    if (entity.getOwners() == null) {
      return Collections.emptyList();
    }
    List<String> ownerIds = new ArrayList<>();
    for (EntityReference owner : entity.getOwners()) {
      ownerIds.add(owner.getId().toString());
    }
    return ownerIds;
  }

  public static List<String> getDomainIds(EntityInterface entity) {
    if (entity.getDomains() == null) {
      return Collections.emptyList();
    }
    List<String> domainIds = new ArrayList<>();
    for (EntityReference domain : entity.getDomains()) {
      domainIds.add(domain.getId().toString());
    }
    return domainIds;
  }

  public static List<String> getTagFqns(EntityInterface entity) {
    if (entity.getTags() == null) {
      return Collections.emptyList();
    }
    List<String> tagFqns = new ArrayList<>();
    for (TagLabel tag : entity.getTags()) {
      tagFqns.add(tag.getTagFQN());
    }
    return tagFqns;
  }

  public static String getServiceName(EntityInterface entity) {
    EntityReference service = entity.getEntityReference();
    if (service != null && service.getFullyQualifiedName() != null) {
      String fqn = service.getFullyQualifiedName();
      int dotIndex = fqn.indexOf('.');
      if (dotIndex > 0) {
        return fqn.substring(0, dotIndex);
      }
    }
    return null;
  }
}
