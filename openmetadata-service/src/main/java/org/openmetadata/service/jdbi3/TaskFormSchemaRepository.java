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

import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.entity.feed.TaskFormSchema;
import org.openmetadata.service.Entity;
import org.openmetadata.service.util.EntityUtil.Fields;
import org.openmetadata.service.util.EntityUtil.RelationIncludes;
import org.openmetadata.service.util.FullyQualifiedName;

@Slf4j
@Repository
public class TaskFormSchemaRepository extends EntityRepository<TaskFormSchema> {

  public static final String COLLECTION_PATH = "/v1/taskFormSchemas";

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
    // No special preparation needed
  }

  @Override
  public void storeEntity(TaskFormSchema schema, boolean update) {
    store(schema, update);
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
}
