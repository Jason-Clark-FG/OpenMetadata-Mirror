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

package org.openmetadata.service.jdbi3;

import static org.openmetadata.service.Entity.TASK_FORM_SCHEMA;
import static org.openmetadata.schema.type.Include.NON_DELETED;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.entity.feed.TaskFormSchema;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.Entity;
import org.openmetadata.service.tasks.TaskFormSchemaValidator;
import org.openmetadata.service.util.EntityUtil.Fields;
import org.openmetadata.service.util.EntityUtil.RelationIncludes;
import org.openmetadata.service.util.FullyQualifiedName;

@Slf4j
@Repository
public class TaskFormSchemaRepository extends EntityRepository<TaskFormSchema> {

  public static final String COLLECTION_PATH = "/v1/taskFormSchemas";
  private final ConcurrentMap<String, Optional<TaskFormSchema>> schemaCache =
      new ConcurrentHashMap<>();

  public TaskFormSchemaRepository() {
    super(
        COLLECTION_PATH,
        TASK_FORM_SCHEMA,
        TaskFormSchema.class,
        Entity.getCollectionDAO().taskFormSchemaDAO(),
        "",
        "");
    supportsSearch = false;
    quoteFqn = false;
  }

  @Override
  public void setFullyQualifiedName(TaskFormSchema schema) {
    schema.setFullyQualifiedName(FullyQualifiedName.quoteName(schema.getName()));
  }

  @Override
  public void prepare(TaskFormSchema schema, boolean update) {
    if (schema.getName() == null || schema.getName().isBlank()) {
      throw new IllegalArgumentException("Task form schema name must not be empty");
    }
    if (schema.getName().length() > 256) {
      throw new IllegalArgumentException("Task form schema name length must be <= 256");
    }
    if (schema.getTaskType() == null || schema.getTaskType().isBlank()) {
      throw new IllegalArgumentException("Task form schema taskType must not be empty");
    }
    if (schema.getTaskType().length() > 64) {
      throw new IllegalArgumentException("Task form schema taskType length must be <= 64");
    }
    if (schema.getTaskCategory() == null || schema.getTaskCategory().isBlank()) {
      throw new IllegalArgumentException("Task form schema taskCategory must not be empty");
    }
    if (schema.getTaskCategory().length() > 32) {
      throw new IllegalArgumentException("Task form schema taskCategory length must be <= 32");
    }
    TaskFormSchemaValidator.validateFormSchema(schema.getFormSchema());
    validateUniqueTaskSchemaBinding(schema);
  }

  @Override
  public void storeEntity(TaskFormSchema schema, boolean update) {
    schemaCache.clear();
    if (update) {
      daoCollection
          .taskFormSchemaDAO()
          .update(schema.getId(), schema.getFullyQualifiedName(), JsonUtils.pojoToJson(schema));
    } else {
      daoCollection
          .taskFormSchemaDAO()
          .insertTaskFormSchema(
              schema.getId().toString(),
              JsonUtils.pojoToJson(schema),
              schema.getFullyQualifiedName());
    }
  }

  @Override
  public void setFields(TaskFormSchema schema, Fields fields, RelationIncludes includes) {
    // No relational fields to set
  }

  @Override
  public void clearFields(TaskFormSchema schema, Fields fields) {
    // No extra fields to clear
  }

  @Override
  public void storeRelationships(TaskFormSchema schema) {
    // No relationships needed
  }

  @Override
  public TaskFormSchemaUpdater getUpdater(
      TaskFormSchema original,
      TaskFormSchema updated,
      Operation operation,
      org.openmetadata.schema.type.change.ChangeSource changeSource) {
    return new TaskFormSchemaUpdater(original, updated, operation, changeSource);
  }

  public class TaskFormSchemaUpdater extends EntityUpdater {
    public TaskFormSchemaUpdater(
        TaskFormSchema original,
        TaskFormSchema updated,
        Operation operation,
        org.openmetadata.schema.type.change.ChangeSource changeSource) {
      super(original, updated, operation, changeSource);
    }

    @Override
    public void entitySpecificUpdate(boolean consolidatingChanges) {
      recordChange("formSchema", original.getFormSchema(), updated.getFormSchema());
      recordChange("uiSchema", original.getUiSchema(), updated.getUiSchema());
      recordChange("taskType", original.getTaskType(), updated.getTaskType());
      recordChange("taskCategory", original.getTaskCategory(), updated.getTaskCategory());
    }
  }

  public Optional<TaskFormSchema> resolve(String taskType, String taskCategory) {
    if (taskType == null || taskType.isBlank()) {
      return Optional.empty();
    }

    String cacheKey = taskType + "::" + (taskCategory == null ? "" : taskCategory);
    return schemaCache.computeIfAbsent(cacheKey, key -> resolveUncached(taskType, taskCategory));
  }

  private Optional<TaskFormSchema> resolveUncached(String taskType, String taskCategory) {
    ListFilter filter = new ListFilter(NON_DELETED);
    filter.addQueryParam("taskFormType", taskType);
    if (taskCategory != null && !taskCategory.isBlank()) {
      filter.addQueryParam("taskFormCategory", taskCategory);
    }

    List<TaskFormSchema> matches = listAll(getFields(""), filter);
    if (matches.isEmpty()) {
      return Optional.empty();
    }
    if (matches.size() > 1) {
      throw new IllegalArgumentException(
          String.format(
              "Multiple task form schemas found for taskType='%s' and taskCategory='%s'",
              taskType, taskCategory));
    }
    return Optional.of(matches.get(0));
  }

  private void validateUniqueTaskSchemaBinding(TaskFormSchema schema) {
    Optional<TaskFormSchema> existing = resolveUncached(schema.getTaskType(), schema.getTaskCategory());
    if (existing.isPresent() && !existing.get().getId().equals(schema.getId())) {
      throw new IllegalArgumentException(
          String.format(
              "A task form schema already exists for taskType='%s' and taskCategory='%s'",
              schema.getTaskType(), schema.getTaskCategory()));
    }
  }
}
