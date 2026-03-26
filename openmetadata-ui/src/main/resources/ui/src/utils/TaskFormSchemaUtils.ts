/*
 *  Copyright 2026 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import { cloneDeep, uniqBy } from 'lodash';
import { TagLabel } from '../generated/type/tagLabel';
import {
  Task,
  TaskCategory,
  TaskEntityType,
  TaskPayload,
} from '../rest/tasksAPI';
import {
  JsonSchemaObject,
  resolveTaskFormSchema,
  TaskFormSchema,
} from '../rest/taskFormSchemasAPI';
import { getNormalizedTaskPayload, isRecognizerFeedbackTask } from './TasksUtils';

export type TaskFormHandlerType =
  | 'descriptionUpdate'
  | 'tagUpdate'
  | 'approval'
  | 'incident'
  | 'feedbackApproval'
  | 'ownershipUpdate'
  | 'tierUpdate'
  | 'domainUpdate'
  | 'suggestion'
  | 'custom';

export type TaskFormHandlerConfig = {
  type: TaskFormHandlerType;
  permission?: string;
  fieldPathField?: string;
  valueField?: string;
  currentTagsField?: string;
  addTagsField?: string;
  removeTagsField?: string;
  approvedValue?: string;
  rejectedValue?: string;
};

const descriptionUpdateSchema: TaskFormSchema = {
  name: 'DescriptionUpdate',
  displayName: 'Description Update',
  taskType: TaskEntityType.DescriptionUpdate,
  taskCategory: TaskCategory.MetadataUpdate,
  formSchema: {
    type: 'object',
    additionalProperties: true,
    properties: {
      fieldPath: { type: 'string', title: 'Field Path' },
      currentDescription: { type: 'string', title: 'Current Description' },
      newDescription: { type: 'string', title: 'New Description' },
      source: { type: 'string', title: 'Source' },
      confidence: { type: 'number', title: 'Confidence' },
    },
  },
  uiSchema: {
    'ui:handler': {
      type: 'descriptionUpdate',
      permission: 'EDIT_DESCRIPTION',
      fieldPathField: 'fieldPath',
      valueField: 'newDescription',
    },
    'ui:editablePayload': {
      fieldPathField: 'fieldPath',
      currentValueField: 'currentDescription',
      editedValueField: 'newDescription',
    },
    'ui:resolution': {
      mode: 'field',
      valueField: 'newDescription',
    },
    'ui:order': [
      'newDescription',
      'fieldPath',
      'currentDescription',
      'source',
      'confidence',
    ],
    fieldPath: { 'ui:widget': 'hidden' },
    currentDescription: { 'ui:widget': 'hidden' },
    source: { 'ui:widget': 'hidden' },
    confidence: { 'ui:widget': 'hidden' },
    newDescription: { 'ui:widget': 'descriptionTabs' },
  },
};

const tagUpdateSchema: TaskFormSchema = {
  name: 'TagUpdate',
  displayName: 'Tag Update',
  taskType: TaskEntityType.TagUpdate,
  taskCategory: TaskCategory.MetadataUpdate,
  formSchema: {
    type: 'object',
    additionalProperties: true,
    properties: {
      fieldPath: { type: 'string', title: 'Field Path' },
      currentTags: {
        type: 'array',
        title: 'Current Tags',
        items: { type: 'object', additionalProperties: true },
      },
      tagsToAdd: {
        type: 'array',
        title: 'Tags To Add',
        items: { type: 'object', additionalProperties: true },
      },
      tagsToRemove: {
        type: 'array',
        title: 'Tags To Remove',
        items: { type: 'object', additionalProperties: true },
      },
      operation: { type: 'string', title: 'Operation' },
      source: { type: 'string', title: 'Source' },
      confidence: { type: 'number', title: 'Confidence' },
    },
  },
  uiSchema: {
    'ui:handler': {
      type: 'tagUpdate',
      permission: 'EDIT_TAGS',
      fieldPathField: 'fieldPath',
      currentTagsField: 'currentTags',
      addTagsField: 'tagsToAdd',
      removeTagsField: 'tagsToRemove',
    },
    'ui:editablePayload': {
      fieldPathField: 'fieldPath',
      currentTagsField: 'currentTags',
      addTagsField: 'tagsToAdd',
      removeTagsField: 'tagsToRemove',
    },
    'ui:resolution': {
      mode: 'tagMerge',
      currentField: 'currentTags',
      addField: 'tagsToAdd',
      removeField: 'tagsToRemove',
    },
    'ui:order': [
      'tagsToAdd',
      'fieldPath',
      'currentTags',
      'tagsToRemove',
      'operation',
      'source',
      'confidence',
    ],
    fieldPath: { 'ui:widget': 'hidden' },
    currentTags: { 'ui:widget': 'hidden' },
    tagsToRemove: { 'ui:widget': 'hidden' },
    operation: { 'ui:widget': 'hidden' },
    source: { 'ui:widget': 'hidden' },
    confidence: { 'ui:widget': 'hidden' },
    tagsToAdd: { 'ui:widget': 'tagsTabs' },
  },
};

export const getDefaultTaskFormSchema = (
  taskType: TaskEntityType,
  taskCategory: TaskCategory
) => {
  if (
    taskType === TaskEntityType.DescriptionUpdate &&
    taskCategory === TaskCategory.MetadataUpdate
  ) {
    return descriptionUpdateSchema;
  }

  if (
    taskType === TaskEntityType.TagUpdate &&
    taskCategory === TaskCategory.MetadataUpdate
  ) {
    return tagUpdateSchema;
  }

  return undefined;
};

export const getResolvedTaskFormSchema = async (
  taskType: TaskEntityType,
  taskCategory: TaskCategory
) => {
  try {
    const resolvedSchema = await resolveTaskFormSchema(taskType, taskCategory);

    return resolvedSchema ?? getDefaultTaskFormSchema(taskType, taskCategory);
  } catch {
    return getDefaultTaskFormSchema(taskType, taskCategory);
  }
};

const DEFAULT_APPROVAL_VALUES = {
  approvedValue: 'approved',
  rejectedValue: 'rejected',
};

const getDefaultTaskFormHandler = (task: Task): TaskFormHandlerConfig => {
  if (isRecognizerFeedbackTask(task)) {
    return {
      type: 'feedbackApproval',
      permission: 'EDIT_ALL',
      ...DEFAULT_APPROVAL_VALUES,
    };
  }

  switch (task.type) {
    case TaskEntityType.DescriptionUpdate:
      return {
        type: 'descriptionUpdate',
        permission: 'EDIT_DESCRIPTION',
        fieldPathField: 'fieldPath',
        valueField: 'newDescription',
      };
    case TaskEntityType.TagUpdate:
      return {
        type: 'tagUpdate',
        permission: 'EDIT_TAGS',
        fieldPathField: 'fieldPath',
        currentTagsField: 'currentTags',
        addTagsField: 'tagsToAdd',
        removeTagsField: 'tagsToRemove',
      };
    case TaskEntityType.GlossaryApproval:
    case TaskEntityType.RequestApproval:
      return {
        type: 'approval',
        permission: 'EDIT_ALL',
        ...DEFAULT_APPROVAL_VALUES,
      };
    case TaskEntityType.TestCaseResolution:
    case TaskEntityType.IncidentResolution:
      return {
        type: 'incident',
      };
    case TaskEntityType.OwnershipUpdate:
      return {
        type: 'ownershipUpdate',
        permission: 'EDIT_OWNERS',
      };
    case TaskEntityType.TierUpdate:
      return {
        type: 'tierUpdate',
        permission: 'EDIT_TIER',
      };
    case TaskEntityType.DomainUpdate:
      return {
        type: 'domainUpdate',
        permission: 'EDIT_ALL',
      };
    case TaskEntityType.Suggestion:
      return {
        type: 'suggestion',
      };
    default:
      return {
        type: 'custom',
      };
  }
};

export const getTaskFormHandlerConfig = (
  task: Task,
  uiSchema?: JsonSchemaObject
): TaskFormHandlerConfig => {
  const defaults = getDefaultTaskFormHandler(task);
  const configured =
    (uiSchema?.['ui:handler'] as Partial<TaskFormHandlerConfig> | undefined) ??
    {};

  return {
    ...defaults,
    ...configured,
    type: configured.type ?? defaults.type,
    approvedValue:
      configured.approvedValue ?? defaults.approvedValue ?? 'approved',
    rejectedValue:
      configured.rejectedValue ?? defaults.rejectedValue ?? 'rejected',
  };
};

type TaskResolutionConfig = {
  mode?: 'field' | 'tagMerge';
  valueField?: string;
  currentField?: string;
  addField?: string;
  removeField?: string;
};

type EditablePayloadConfig = {
  fieldPathField?: string;
  currentValueField?: string;
  editedValueField?: string;
  currentTagsField?: string;
  addTagsField?: string;
  removeTagsField?: string;
};

const getResolutionConfig = (uiSchema?: JsonSchemaObject) =>
  (uiSchema?.['ui:resolution'] as TaskResolutionConfig | undefined) ?? {};

const getEditablePayloadConfig = (uiSchema?: JsonSchemaObject) =>
  (uiSchema?.['ui:editablePayload'] as EditablePayloadConfig | undefined) ?? {};

const getSchemaPropertyDefaults = (schema?: JsonSchemaObject) => {
  const properties =
    (schema?.properties as Record<string, JsonSchemaObject> | undefined) ?? {};

  return Object.entries(properties).reduce<Record<string, unknown>>(
    (acc, [fieldName, fieldSchema]) => {
      if (Object.prototype.hasOwnProperty.call(fieldSchema, 'default')) {
        acc[fieldName] = cloneDeep(fieldSchema.default);
      }

      return acc;
    },
    {}
  );
};

export const applyTaskFormSchemaDefaults = (
  payload: Record<string, unknown>,
  schema?: JsonSchemaObject
) => ({
  ...getSchemaPropertyDefaults(schema),
  ...payload,
});

export const getEditableTaskPayload = (
  task: Task,
  uiSchema?: JsonSchemaObject
): TaskPayload => {
  const normalizedPayload = getNormalizedTaskPayload(task);
  const payload = cloneDeep(task.payload ?? {});
  const editableConfig = getEditablePayloadConfig(uiSchema);
  const fieldPathField = editableConfig.fieldPathField ?? 'fieldPath';
  const currentValueField =
    editableConfig.currentValueField ?? 'currentDescription';
  const editedValueField = editableConfig.editedValueField ?? 'newDescription';
  const currentTagsField = editableConfig.currentTagsField ?? 'currentTags';
  const addTagsField = editableConfig.addTagsField ?? 'tagsToAdd';
  const removeTagsField = editableConfig.removeTagsField ?? 'tagsToRemove';

  if (editableConfig.currentValueField || editableConfig.editedValueField) {
    return {
      ...payload,
      [fieldPathField]:
        payload[fieldPathField] ??
        payload.fieldPath ??
        payload.field ??
        normalizedPayload.fieldPath,
      [currentValueField]:
        payload[currentValueField] ??
        payload.currentDescription ??
        payload.currentValue,
      [editedValueField]:
        payload[editedValueField] ??
        payload.newDescription ??
        payload.suggestedValue,
    };
  }

  if (
    editableConfig.currentTagsField ||
    editableConfig.addTagsField ||
    editableConfig.removeTagsField
  ) {
    const currentTags =
      (payload[currentTagsField] as TagLabel[] | undefined) ??
      (payload.currentTags as TagLabel[] | undefined) ??
      normalizedPayload.currentTags;
    const tagsToAdd =
      (payload[addTagsField] as TagLabel[] | undefined) ??
      (payload.tagsToAdd as TagLabel[] | undefined) ??
      normalizedPayload.suggestedTags.filter(
        (tag) =>
          !currentTags.some((currentTag) => currentTag.tagFQN === tag.tagFQN)
      );
    const tagsToRemove =
      (payload[removeTagsField] as TagLabel[] | undefined) ??
      (payload.tagsToRemove as TagLabel[] | undefined) ??
      currentTags.filter(
        (tag) =>
          !normalizedPayload.suggestedTags.some(
            (suggestedTag) => suggestedTag.tagFQN === tag.tagFQN
          )
      );

    return {
      ...payload,
      [fieldPathField]:
        payload[fieldPathField] ??
        payload.fieldPath ??
        payload.field ??
        normalizedPayload.fieldPath,
      [currentTagsField]: currentTags,
      [addTagsField]: tagsToAdd,
      [removeTagsField]: tagsToRemove,
    };
  }

  if (task.type === TaskEntityType.DescriptionUpdate) {
    return {
      ...payload,
      [fieldPathField]:
        payload[fieldPathField] ??
        payload.fieldPath ??
        payload.field ??
        normalizedPayload.fieldPath,
      [currentValueField]:
        payload[currentValueField] ??
        payload.currentDescription ??
        payload.currentValue ??
        normalizedPayload.currentDescription,
      [editedValueField]:
        payload[editedValueField] ??
        payload.newDescription ??
        payload.suggestedValue ??
        normalizedPayload.newDescription,
    };
  }

  if (task.type === TaskEntityType.TagUpdate) {
    const currentTags =
      (payload[currentTagsField] as TagLabel[] | undefined) ??
      (payload.currentTags as TagLabel[] | undefined) ??
      normalizedPayload.currentTags;
    const tagsToAdd =
      (payload[addTagsField] as TagLabel[] | undefined) ??
      (payload.tagsToAdd as TagLabel[] | undefined) ??
      normalizedPayload.suggestedTags.filter(
        (tag) => !currentTags.some((currentTag) => currentTag.tagFQN === tag.tagFQN)
      );
    const tagsToRemove =
      (payload[removeTagsField] as TagLabel[] | undefined) ??
      (payload.tagsToRemove as TagLabel[] | undefined) ??
      currentTags.filter(
        (tag) =>
          !normalizedPayload.suggestedTags.some(
            (suggestedTag) => suggestedTag.tagFQN === tag.tagFQN
          )
      );

    return {
      ...payload,
      [fieldPathField]:
        payload[fieldPathField] ??
        payload.fieldPath ??
        payload.field ??
        normalizedPayload.fieldPath,
      [currentTagsField]: currentTags,
      [addTagsField]: tagsToAdd,
      [removeTagsField]: tagsToRemove,
    };
  }

  return payload;
};

export const getTaskResolutionNewValue = (
  task: Task,
  payload: TaskPayload,
  uiSchema?: JsonSchemaObject
) => {
  const resolutionConfig = getResolutionConfig(uiSchema);

  if (resolutionConfig.mode === 'field') {
    return String(
      payload[resolutionConfig.valueField ?? 'newDescription'] ??
        payload.suggestedValue ??
        ''
    );
  }

  if (resolutionConfig.mode === 'tagMerge') {
    const currentTags =
      (payload[resolutionConfig.currentField ?? 'currentTags'] as TagLabel[] | undefined) ??
      [];
    const tagsToAdd =
      (payload[resolutionConfig.addField ?? 'tagsToAdd'] as TagLabel[] | undefined) ??
      [];
    const tagsToRemove =
      (payload[resolutionConfig.removeField ?? 'tagsToRemove'] as TagLabel[] | undefined) ??
      [];
    const removedTagFqns = new Set(tagsToRemove.map((tag) => tag.tagFQN));
    const updatedTags = uniqBy(
      [
        ...currentTags.filter((tag) => !removedTagFqns.has(tag.tagFQN)),
        ...tagsToAdd,
      ],
      'tagFQN'
    );

    return JSON.stringify(updatedTags);
  }

  if (task.type === TaskEntityType.DescriptionUpdate) {
    return String(payload.newDescription ?? payload.suggestedValue ?? '');
  }

  if (task.type === TaskEntityType.TagUpdate) {
    const currentTags = (payload.currentTags as TagLabel[] | undefined) ?? [];
    const tagsToAdd = (payload.tagsToAdd as TagLabel[] | undefined) ?? [];
    const tagsToRemove = (payload.tagsToRemove as TagLabel[] | undefined) ?? [];
    const removedTagFqns = new Set(tagsToRemove.map((tag) => tag.tagFQN));
    const updatedTags = uniqBy(
      [
        ...currentTags.filter((tag) => !removedTagFqns.has(tag.tagFQN)),
        ...tagsToAdd,
      ],
      'tagFQN'
    );

    return JSON.stringify(updatedTags);
  }

  if (typeof payload.suggestedValue === 'string') {
    return payload.suggestedValue;
  }

  return undefined;
};
