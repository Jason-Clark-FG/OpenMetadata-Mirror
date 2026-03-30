/*
 *  Copyright 2026 Collate.
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

import { Button, Card, Form, Input, List, Space, Spin, Typography } from 'antd';
import { AxiosError } from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TitleBreadcrumb from '../../components/common/TitleBreadcrumb/TitleBreadcrumb.component';
import CodeEditor from '../../components/Database/SchemaEditor/CodeEditor';
import PageLayoutV1 from '../../components/PageLayoutV1/PageLayoutV1';
import {
  GlobalSettingOptions,
  GlobalSettingsMenuCategory,
} from '../../constants/GlobalSettings.constants';
import {
  createTaskFormSchema,
  listTaskFormSchemas,
  TaskFormSchema,
  updateTaskFormSchema,
} from '../../rest/taskFormSchemasAPI';
import {
  createOrUpdateWorkflowDefinition,
  getWorkflowDefinitionByName,
} from '../../rest/workflowDefinitionsAPI';
import { getSettingPageEntityBreadCrumb } from '../../utils/GlobalSettingsUtils';
import { showErrorToast, showSuccessToast } from '../../utils/ToastUtils';

const EMPTY_SCHEMA: TaskFormSchema = {
  name: '',
  displayName: '',
  description: '',
  taskType: '',
  taskCategory: '',
  formSchema: {
    type: 'object',
    properties: {},
  },
  uiSchema: {},
  createFormSchema: {
    type: 'object',
    properties: {},
  },
  createUiSchema: {},
  transitionForms: {},
  defaultStageMappings: {},
};

const stringifyJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2);

const getDefaultWorkflowDefinitionRef = (taskType?: string) => {
  switch (taskType) {
    case 'DescriptionUpdate':
      return 'DescriptionUpdateTaskWorkflow';
    case 'TagUpdate':
      return 'TagUpdateTaskWorkflow';
    case 'OwnershipUpdate':
      return 'OwnershipUpdateTaskWorkflow';
    case 'TierUpdate':
      return 'TierUpdateTaskWorkflow';
    case 'DomainUpdate':
      return 'DomainUpdateTaskWorkflow';
    case 'GlossaryApproval':
      return 'GlossaryApprovalTaskWorkflow';
    case 'RequestApproval':
      return 'RequestApprovalTaskWorkflow';
    case 'Suggestion':
      return 'SuggestionTaskWorkflow';
    case 'TestCaseResolution':
      return 'TestCaseResolutionTaskWorkflow';
    case 'IncidentResolution':
      return 'IncidentResolutionTaskWorkflow';
    case 'CustomTask':
      return 'CustomTaskWorkflow';
    default:
      return undefined;
  }
};

const TaskFormSettingsPage = () => {
  const { t } = useTranslation();
  const [form] = Form.useForm<TaskFormSchema>();
  const [schemas, setSchemas] = useState<TaskFormSchema[]>([]);
  const [selectedSchema, setSelectedSchema] =
    useState<TaskFormSchema>(EMPTY_SCHEMA);
  const [formSchemaValue, setFormSchemaValue] = useState(
    stringifyJson(EMPTY_SCHEMA.formSchema)
  );
  const [uiSchemaValue, setUiSchemaValue] = useState(
    stringifyJson(EMPTY_SCHEMA.uiSchema)
  );
  const [createFormSchemaValue, setCreateFormSchemaValue] = useState(
    stringifyJson(EMPTY_SCHEMA.createFormSchema)
  );
  const [createUiSchemaValue, setCreateUiSchemaValue] = useState(
    stringifyJson(EMPTY_SCHEMA.createUiSchema)
  );
  const [transitionFormsValue, setTransitionFormsValue] = useState(
    stringifyJson(EMPTY_SCHEMA.transitionForms)
  );
  const [defaultStageMappingsValue, setDefaultStageMappingsValue] = useState(
    stringifyJson(EMPTY_SCHEMA.defaultStageMappings)
  );
  const [workflowDefinitionValue, setWorkflowDefinitionValue] = useState('{}');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const breadcrumbs = useMemo(
    () =>
      getSettingPageEntityBreadCrumb(
        GlobalSettingsMenuCategory.GOVERNANCE,
        'Task Forms',
        GlobalSettingOptions.TASK_FORMS
      ),
    []
  );

  const setSchemaEditors = (schema: TaskFormSchema) => {
    const workflowDefinitionRef =
      schema.workflowDefinitionRef ??
      getDefaultWorkflowDefinitionRef(schema.taskType);
    setSelectedSchema(schema);
    form.setFieldsValue({
      ...schema,
      workflowDefinitionRef,
    });
    setFormSchemaValue(stringifyJson(schema.formSchema));
    setUiSchemaValue(stringifyJson(schema.uiSchema));
    setCreateFormSchemaValue(
      stringifyJson(schema.createFormSchema ?? schema.formSchema)
    );
    setCreateUiSchemaValue(
      stringifyJson(schema.createUiSchema ?? schema.uiSchema)
    );
    setTransitionFormsValue(stringifyJson(schema.transitionForms ?? {}));
    setDefaultStageMappingsValue(
      stringifyJson(schema.defaultStageMappings ?? {})
    );
    setWorkflowDefinitionValue('{}');
    if (workflowDefinitionRef) {
      void getWorkflowDefinitionByName(workflowDefinitionRef)
        .then((workflow) => setWorkflowDefinitionValue(stringifyJson(workflow)))
        .catch(() => setWorkflowDefinitionValue('{}'));
    }
  };

  const loadSchemas = async () => {
    setLoading(true);
    try {
      const response = await listTaskFormSchemas({ limit: 100 });
      const data = response.data ?? [];
      setSchemas(data);
      if (!selectedSchema.id && data.length > 0) {
        setSchemaEditors(data[0]);
      }
    } catch (error) {
      showErrorToast(error as AxiosError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchemas();
  }, []);

  const handleSelectSchema = (schema: TaskFormSchema) => {
    setSchemaEditors(schema);
  };

  const handleCreateNew = () => {
    form.resetFields();
    setSchemaEditors(EMPTY_SCHEMA);
  };

  const handleSave = async (values: TaskFormSchema) => {
    let parsedFormSchema;
    let parsedUiSchema;
    let parsedCreateFormSchema;
    let parsedCreateUiSchema;
    let parsedTransitionForms;
    let parsedDefaultStageMappings;
    let parsedWorkflowDefinition;

    try {
      parsedFormSchema = JSON.parse(formSchemaValue);
      parsedUiSchema = JSON.parse(uiSchemaValue);
      parsedCreateFormSchema = JSON.parse(createFormSchemaValue);
      parsedCreateUiSchema = JSON.parse(createUiSchemaValue);
      parsedTransitionForms = JSON.parse(transitionFormsValue);
      parsedDefaultStageMappings = JSON.parse(defaultStageMappingsValue);
      parsedWorkflowDefinition = JSON.parse(workflowDefinitionValue);
    } catch {
      showErrorToast('Task form settings JSON is invalid');

      return;
    }

    setSaving(true);
    try {
      const payload: TaskFormSchema = {
        ...selectedSchema,
        ...values,
        formSchema: parsedFormSchema,
        uiSchema: parsedUiSchema,
        createFormSchema: parsedCreateFormSchema,
        createUiSchema: parsedCreateUiSchema,
        transitionForms: parsedTransitionForms,
        defaultStageMappings: parsedDefaultStageMappings,
      };

      if (
        parsedWorkflowDefinition &&
        typeof parsedWorkflowDefinition === 'object' &&
        Object.keys(parsedWorkflowDefinition).length > 0
      ) {
        const workflowName =
          parsedWorkflowDefinition.name ?? payload.workflowDefinitionRef;
        if (!workflowName) {
          showErrorToast('Workflow definition JSON must include a name');

          return;
        }

        const savedWorkflow = await createOrUpdateWorkflowDefinition({
          ...parsedWorkflowDefinition,
          name: workflowName,
        });
        payload.workflowDefinitionRef = savedWorkflow.name;
        payload.workflowVersion = savedWorkflow.version;
      }

      const savedSchema = payload.id
        ? await updateTaskFormSchema(payload)
        : await createTaskFormSchema(payload);

      showSuccessToast('Task form saved successfully');
      await loadSchemas();
      handleSelectSchema(savedSchema);
    } catch (error) {
      showErrorToast(error as AxiosError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageLayoutV1 pageTitle="Task Forms">
      <div className="d-grid gap-4" data-testid="task-form-settings-page">
        <TitleBreadcrumb titleLinks={breadcrumbs} />

        <div className="d-flex gap-4">
          <Card
            extra={
              <Button
                data-testid="task-form-add-button"
                size="small"
                type="primary"
                onClick={handleCreateNew}>
                {t('label.add')}
              </Button>
            }
            style={{ flex: '0 0 320px' }}
            title="Schemas">
            {loading ? (
              <div className="text-center p-y-lg">
                <Spin />
              </div>
            ) : (
              <List
                dataSource={schemas}
                renderItem={(schema) => (
                  <List.Item
                    className={
                      schema.id === selectedSchema.id ? 'bg-grey-1' : ''
                    }
                    data-testid={`task-form-list-item-${schema.name}`}
                    onClick={() => handleSelectSchema(schema)}>
                    <List.Item.Meta
                      description={`${schema.taskType} / ${
                        schema.taskCategory ?? '-'
                      }`}
                      title={schema.displayName ?? schema.name}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>

          <Card style={{ flex: 1 }} title="Editor">
            <Form<TaskFormSchema>
              form={form}
              layout="vertical"
              onFinish={handleSave}>
              <Form.Item
                label="Name"
                name="name"
                rules={[{ required: true, message: 'Name is required' }]}>
                <Input data-testid="task-form-name-input" />
              </Form.Item>
              <Form.Item label="Display Name" name="displayName">
                <Input data-testid="task-form-display-name-input" />
              </Form.Item>
              <Form.Item label="Description" name="description">
                <Input.TextArea
                  autoSize={{ minRows: 3, maxRows: 5 }}
                  data-testid="task-form-description-input"
                />
              </Form.Item>
              <Form.Item
                label="Task Type"
                name="taskType"
                rules={[{ required: true, message: 'Task type is required' }]}>
                <Input data-testid="task-form-type-input" />
              </Form.Item>
              <Form.Item label="Task Category" name="taskCategory">
                <Input data-testid="task-form-category-input" />
              </Form.Item>
              <Form.Item
                label="Workflow Definition"
                name="workflowDefinitionRef">
                <Input data-testid="task-form-workflow-definition-input" />
              </Form.Item>

              <Typography.Title className="m-b-sm m-t-md" level={5}>
                Form Schema
              </Typography.Title>
              <CodeEditor
                editorClass="task-form-schema-editor"
                value={formSchemaValue}
                onChange={(value) => setFormSchemaValue(value)}
              />

              <Typography.Title className="m-b-sm m-t-md" level={5}>
                UI Schema
              </Typography.Title>
              <CodeEditor
                editorClass="task-form-ui-schema-editor"
                value={uiSchemaValue}
                onChange={(value) => setUiSchemaValue(value)}
              />

              <Typography.Title className="m-b-sm m-t-md" level={5}>
                Create Form Schema
              </Typography.Title>
              <CodeEditor
                editorClass="task-form-create-schema-editor"
                value={createFormSchemaValue}
                onChange={(value) => setCreateFormSchemaValue(value)}
              />

              <Typography.Title className="m-b-sm m-t-md" level={5}>
                Create UI Schema
              </Typography.Title>
              <CodeEditor
                editorClass="task-form-create-ui-schema-editor"
                value={createUiSchemaValue}
                onChange={(value) => setCreateUiSchemaValue(value)}
              />

              <Typography.Title className="m-b-sm m-t-md" level={5}>
                Transition Forms
              </Typography.Title>
              <CodeEditor
                editorClass="task-form-transition-forms-editor"
                value={transitionFormsValue}
                onChange={(value) => setTransitionFormsValue(value)}
              />

              <Typography.Title className="m-b-sm m-t-md" level={5}>
                Default Stage Mappings
              </Typography.Title>
              <CodeEditor
                editorClass="task-form-stage-mappings-editor"
                value={defaultStageMappingsValue}
                onChange={(value) => setDefaultStageMappingsValue(value)}
              />

              <Typography.Title className="m-b-sm m-t-md" level={5}>
                Workflow Definition JSON
              </Typography.Title>
              <CodeEditor
                editorClass="task-form-workflow-definition-editor"
                value={workflowDefinitionValue}
                onChange={(value) => setWorkflowDefinitionValue(value)}
              />

              <Space className="w-full justify-end m-t-md">
                <Button
                  data-testid="task-form-cancel-button"
                  onClick={handleCreateNew}>
                  {t('label.cancel')}
                </Button>
                <Button
                  data-testid="task-form-save-button"
                  htmlType="submit"
                  loading={saving}
                  type="primary">
                  {t('label.save')}
                </Button>
              </Space>
            </Form>
          </Card>
        </div>
      </div>
    </PageLayoutV1>
  );
};

export default TaskFormSettingsPage;
