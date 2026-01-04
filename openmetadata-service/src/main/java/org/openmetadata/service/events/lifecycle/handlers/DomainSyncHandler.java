/*
 *  Copyright 2024 Collate
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

package org.openmetadata.service.events.lifecycle.handlers;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.EntityInterface;
import org.openmetadata.schema.type.ChangeDescription;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.FieldChange;
import org.openmetadata.service.Entity;
import org.openmetadata.service.events.lifecycle.EntityLifecycleEventHandler;
import org.openmetadata.service.jdbi3.TaskRepository;
import org.openmetadata.service.security.policyevaluator.SubjectContext;

/**
 * Handler that syncs domains for dependent entities when their target entity's domain changes.
 * Ensures tasks, threads, announcements, etc. remain in the same domain as the entity
 * they're associated with, maintaining domain-based data isolation policies.
 */
@Slf4j
public class DomainSyncHandler implements EntityLifecycleEventHandler {

  private static final String DOMAIN_FIELD = "domain";
  private static final String DOMAINS_FIELD = "domains";

  private static final Set<String> SKIP_ENTITY_TYPES =
      Set.of(Entity.TASK, Entity.THREAD, Entity.DOMAIN);

  @Override
  public void onEntityUpdated(
      EntityInterface entity, ChangeDescription changeDescription, SubjectContext subjectContext) {
    if (entity == null || changeDescription == null) {
      return;
    }

    EntityReference newDomain = findDomainChange(changeDescription);
    boolean domainRemoved = hasDomainRemoved(changeDescription);

    if (newDomain == null && !domainRemoved) {
      return;
    }

    String entityType = entity.getEntityReference().getType();

    // Skip entities that shouldn't trigger domain sync
    if (SKIP_ENTITY_TYPES.contains(entityType)) {
      return;
    }

    UUID entityId = entity.getId();
    EntityReference effectiveDomain = domainRemoved ? null : newDomain;

    LOG.debug(
        "Domain change detected for {} {}, syncing related entities to domain {}",
        entityType,
        entityId,
        effectiveDomain != null ? effectiveDomain.getFullyQualifiedName() : "null");

    syncTaskDomains(entityId, entityType, effectiveDomain);
    // Future: Add sync for threads, announcements, etc.
    // syncThreadDomains(entityId, entityType, effectiveDomain);
    // syncAnnouncementDomains(entityId, entityType, effectiveDomain);
  }

  private void syncTaskDomains(UUID entityId, String entityType, EntityReference newDomain) {
    try {
      TaskRepository taskRepository = (TaskRepository) Entity.getEntityRepository(Entity.TASK);
      taskRepository.syncTaskDomainsForEntity(entityId, entityType, newDomain);
    } catch (Exception e) {
      LOG.error(
          "Failed to sync task domains for entity {} {}: {}", entityType, entityId, e.getMessage());
    }
  }

  private EntityReference findDomainChange(ChangeDescription changeDescription) {
    // Check fieldsAdded for new domain
    EntityReference domain = findDomainInChanges(changeDescription.getFieldsAdded());
    if (domain != null) {
      return domain;
    }

    // Check fieldsUpdated for domain change
    domain = findDomainInChanges(changeDescription.getFieldsUpdated());
    if (domain != null) {
      return domain;
    }

    return null;
  }

  private EntityReference findDomainInChanges(List<FieldChange> changes) {
    if (changes == null) {
      return null;
    }

    for (FieldChange change : changes) {
      if (DOMAIN_FIELD.equals(change.getName()) || DOMAINS_FIELD.equals(change.getName())) {
        Object newValue = change.getNewValue();
        if (newValue instanceof EntityReference ref) {
          return ref;
        } else if (newValue instanceof List<?> list && !list.isEmpty()) {
          Object first = list.get(0);
          if (first instanceof EntityReference ref) {
            return ref;
          }
        }
      }
    }
    return null;
  }

  private boolean hasDomainRemoved(ChangeDescription changeDescription) {
    List<FieldChange> deletedFields = changeDescription.getFieldsDeleted();
    if (deletedFields == null) {
      return false;
    }

    for (FieldChange change : deletedFields) {
      if (DOMAIN_FIELD.equals(change.getName()) || DOMAINS_FIELD.equals(change.getName())) {
        return true;
      }
    }
    return false;
  }

  @Override
  public String getHandlerName() {
    return "DomainSyncHandler";
  }

  @Override
  public int getPriority() {
    return 50;
  }

  @Override
  public boolean isAsync() {
    return true;
  }
}
