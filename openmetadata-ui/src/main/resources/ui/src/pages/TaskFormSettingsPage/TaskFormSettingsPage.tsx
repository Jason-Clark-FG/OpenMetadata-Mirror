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
};

const stringifyJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2);

const TaskFormSettingsPage = () => {
  const { t } = useTranslation();
  const [form] = Form.useForm<TaskFormSchema>();
  const [schemas, setSchemas] = useState<TaskFormSchema[]>([]);
  const [selectedSchema, setSelectedSchema] = useState<TaskFormSchema>(EMPTY_SCHEMA);
  const [formSchemaValue, setFormSchemaValue] = useState(stringifyJson(EMPTY_SCHEMA.formSchema));
  const [uiSchemaValue, setUiSchemaValue] = useState(stringifyJson(EMPTY_SCHEMA.uiSchema));
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

  const loadSchemas = async () => {
    setLoading(true);
    try {
      const response = await listTaskFormSchemas({ limit: 100 });
      const data = response.data ?? [];
      setSchemas(data);
      if (!selectedSchema.id && data.length > 0) {
        const firstSchema = data[0];
        setSelectedSchema(firstSchema);
        form.setFieldsValue(firstSchema);
        setFormSchemaValue(stringifyJson(firstSchema.formSchema));
        setUiSchemaValue(stringifyJson(firstSchema.uiSchema));
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
    setSelectedSchema(schema);
    form.setFieldsValue(schema);
    setFormSchemaValue(stringifyJson(schema.formSchema));
    setUiSchemaValue(stringifyJson(schema.uiSchema));
  };

  const handleCreateNew = () => {
    setSelectedSchema(EMPTY_SCHEMA);
    form.resetFields();
    form.setFieldsValue(EMPTY_SCHEMA);
    setFormSchemaValue(stringifyJson(EMPTY_SCHEMA.formSchema));
    setUiSchemaValue(stringifyJson(EMPTY_SCHEMA.uiSchema));
  };

  const handleSave = async (values: TaskFormSchema) => {
    let parsedFormSchema;
    let parsedUiSchema;

    try {
      parsedFormSchema = JSON.parse(formSchemaValue);
      parsedUiSchema = JSON.parse(uiSchemaValue);
    } catch {
      showErrorToast('Task form schema JSON is invalid');

      return;
    }

    setSaving(true);
    try {
      const payload: TaskFormSchema = {
        ...selectedSchema,
        ...values,
        formSchema: parsedFormSchema,
        uiSchema: parsedUiSchema,
      };

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
                    className={schema.id === selectedSchema.id ? 'bg-grey-1' : ''}
                    data-testid={`task-form-list-item-${schema.name}`}
                    onClick={() => handleSelectSchema(schema)}>
                    <List.Item.Meta
                      description={`${schema.taskType} / ${schema.taskCategory ?? '-'}`}
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

              <Space className="w-full justify-end m-t-md">
                <Button data-testid="task-form-cancel-button" onClick={handleCreateNew}>
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
