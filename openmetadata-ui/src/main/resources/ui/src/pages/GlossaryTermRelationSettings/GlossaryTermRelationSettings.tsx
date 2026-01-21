/*
 *  Copyright 2024 Collate.
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

import { CheckOutlined, CloseOutlined, LockOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Skeleton,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { ColumnsType } from 'antd/lib/table';
import { AxiosError } from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TitleBreadcrumb from '../../components/common/TitleBreadcrumb/TitleBreadcrumb.component';
import { TitleBreadcrumbProps } from '../../components/common/TitleBreadcrumb/TitleBreadcrumb.interface';
import PageHeader from '../../components/PageHeader/PageHeader.component';
import PageLayoutV1 from '../../components/PageLayoutV1/PageLayoutV1';
import { GlobalSettingsMenuCategory } from '../../constants/GlobalSettings.constants';
import { useAuth } from '../../hooks/authHooks';
import {
  getGlossaryTermRelationSettings,
  updateGlossaryTermRelationSettings,
} from '../../rest/glossaryAPI';
import { getSettingPageEntityBreadCrumb } from '../../utils/GlobalSettingsUtils';
import { showErrorToast, showSuccessToast } from '../../utils/ToastUtils';

interface GlossaryTermRelationType {
  name: string;
  displayName: string;
  description: string;
  inverseRelation?: string;
  rdfPredicate?: string;
  isSymmetric: boolean;
  isTransitive: boolean;
  isCrossGlossaryAllowed: boolean;
  category: 'hierarchical' | 'associative' | 'equivalence';
  isSystemDefined: boolean;
  color?: string;
}

interface GlossaryTermRelationSettings {
  relationTypes: GlossaryTermRelationType[];
}

const CATEGORY_OPTIONS = [
  { label: 'Hierarchical', value: 'hierarchical' },
  { label: 'Associative', value: 'associative' },
  { label: 'Equivalence', value: 'equivalence' },
];

const CATEGORY_COLORS: Record<string, string> = {
  hierarchical: 'green',
  associative: 'blue',
  equivalence: 'purple',
};

function GlossaryTermRelationSettingsPage() {
  const { t } = useTranslation();
  const { isAdminUser } = useAuth();
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [settings, setSettings] = useState<GlossaryTermRelationSettings | null>(
    null
  );
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingRelation, setEditingRelation] =
    useState<GlossaryTermRelationType | null>(null);
  const [form] = Form.useForm();

  const breadcrumbs: TitleBreadcrumbProps['titleLinks'] = useMemo(
    () =>
      getSettingPageEntityBreadCrumb(
        GlobalSettingsMenuCategory.GOVERNANCE,
        t('label.glossary-term-relation-plural')
      ),
    [t]
  );

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getGlossaryTermRelationSettings();
      setSettings(data as GlossaryTermRelationSettings);
    } catch (error) {
      showErrorToast(
        error as AxiosError,
        t('server.entity-fetch-error', {
          entity: t('label.glossary-term-relation-plural'),
        })
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleAddNew = useCallback(() => {
    setEditingRelation(null);
    form.resetFields();
    form.setFieldsValue({
      isSymmetric: false,
      isTransitive: false,
      isCrossGlossaryAllowed: true,
      category: 'associative',
    });
    setIsModalOpen(true);
  }, [form]);

  const handleEdit = useCallback(
    (relation: GlossaryTermRelationType) => {
      if (relation.isSystemDefined) {
        return;
      }
      setEditingRelation(relation);
      form.setFieldsValue(relation);
      setIsModalOpen(true);
    },
    [form]
  );

  const handleDelete = useCallback(
    async (relationName: string) => {
      if (!settings) {
        return;
      }

      try {
        setSaving(true);
        const updatedRelationTypes = settings.relationTypes.filter(
          (r) => r.name !== relationName
        );
        await updateGlossaryTermRelationSettings({
          relationTypes: updatedRelationTypes,
        });
        setSettings({ relationTypes: updatedRelationTypes });
        showSuccessToast(
          t('server.delete-entity-success', {
            entity: t('label.relation-type'),
          })
        );
      } catch (error) {
        showErrorToast(
          error as AxiosError,
          t('server.delete-entity-error', {
            entity: t('label.relation-type'),
          })
        );
      } finally {
        setSaving(false);
      }
    },
    [settings, t]
  );

  const handleModalOk = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const newRelation: GlossaryTermRelationType = {
        ...values,
        isSystemDefined: false,
      };

      let updatedRelationTypes: GlossaryTermRelationType[];

      if (editingRelation) {
        updatedRelationTypes = (settings?.relationTypes || []).map((r) =>
          r.name === editingRelation.name ? newRelation : r
        );
      } else {
        updatedRelationTypes = [
          ...(settings?.relationTypes || []),
          newRelation,
        ];
      }

      await updateGlossaryTermRelationSettings({
        relationTypes: updatedRelationTypes,
      });
      setSettings({ relationTypes: updatedRelationTypes });
      setIsModalOpen(false);
      showSuccessToast(
        t('server.update-entity-success', {
          entity: t('label.relation-type'),
        })
      );
    } catch (error) {
      if ((error as { errorFields?: unknown[] }).errorFields) {
        return;
      }
      showErrorToast(
        error as AxiosError,
        t('server.update-entity-error', {
          entity: t('label.relation-type'),
        })
      );
    } finally {
      setSaving(false);
    }
  }, [form, editingRelation, settings, t]);

  const handleModalCancel = useCallback(() => {
    setIsModalOpen(false);
    setEditingRelation(null);
    form.resetFields();
  }, [form]);

  const columns: ColumnsType<GlossaryTermRelationType> = useMemo(
    () => [
      {
        title: t('label.name'),
        dataIndex: 'name',
        key: 'name',
        render: (name: string, record) => (
          <div className="d-flex items-center gap-2">
            <Typography.Text strong>{name}</Typography.Text>
            {record.isSystemDefined && (
              <Tooltip title={t('label.system-defined')}>
                <LockOutlined className="text-grey-muted" />
              </Tooltip>
            )}
          </div>
        ),
      },
      {
        title: t('label.display-name'),
        dataIndex: 'displayName',
        key: 'displayName',
      },
      {
        title: t('label.category'),
        dataIndex: 'category',
        key: 'category',
        render: (category: string) => (
          <Tag color={CATEGORY_COLORS[category]}>{category}</Tag>
        ),
      },
      {
        title: t('label.inverse'),
        dataIndex: 'inverseRelation',
        key: 'inverseRelation',
        render: (inverse?: string) => inverse || '-',
      },
      {
        title: t('label.symmetric'),
        dataIndex: 'isSymmetric',
        key: 'isSymmetric',
        render: (isSymmetric: boolean) =>
          isSymmetric ? (
            <CheckOutlined className="text-success" />
          ) : (
            <CloseOutlined className="text-grey-muted" />
          ),
      },
      {
        title: t('label.transitive'),
        dataIndex: 'isTransitive',
        key: 'isTransitive',
        render: (isTransitive: boolean) =>
          isTransitive ? (
            <CheckOutlined className="text-success" />
          ) : (
            <CloseOutlined className="text-grey-muted" />
          ),
      },
      {
        title: t('label.cross-glossary'),
        dataIndex: 'isCrossGlossaryAllowed',
        key: 'isCrossGlossaryAllowed',
        render: (allowed: boolean) =>
          allowed ? (
            <CheckOutlined className="text-success" />
          ) : (
            <CloseOutlined className="text-grey-muted" />
          ),
      },
      {
        title: t('label.color'),
        dataIndex: 'color',
        key: 'color',
        render: (color?: string) =>
          color ? (
            <div className="d-flex items-center gap-2">
              <div
                style={{
                  width: 20,
                  height: 20,
                  backgroundColor: color,
                  borderRadius: 4,
                  border: '1px solid #d9d9d9',
                }}
              />
              <Typography.Text code>{color}</Typography.Text>
            </div>
          ) : (
            '-'
          ),
      },
      {
        title: t('label.action-plural'),
        key: 'actions',
        render: (_, record) => (
          <div className="d-flex gap-2">
            <Button
              disabled={record.isSystemDefined}
              size="small"
              type="link"
              onClick={() => handleEdit(record)}>
              {t('label.edit')}
            </Button>
            {!record.isSystemDefined && (
              <Button
                danger
                disabled={saving}
                size="small"
                type="link"
                onClick={() => handleDelete(record.name)}>
                {t('label.delete')}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, handleEdit, handleDelete, saving]
  );

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return (
    <PageLayoutV1 pageTitle={t('label.glossary-term-relation-plural')}>
      <Row
        align="middle"
        className="p-lg bg-white border-radius-sm"
        gutter={[0, 16]}>
        <Col span={24}>
          <TitleBreadcrumb titleLinks={breadcrumbs} />
        </Col>
        <Col span={24}>
          <Row align="top" justify="space-between">
            <Col>
              <PageHeader
                data={{
                  header: t('label.glossary-term-relation-plural'),
                  subHeader: t(
                    'message.glossary-term-relation-settings-description'
                  ),
                }}
              />
            </Col>
            <Col>
              {isAdminUser && (
                <Button type="primary" onClick={handleAddNew}>
                  {t('label.add-entity', {
                    entity: t('label.relation-type'),
                  })}
                </Button>
              )}
            </Col>
          </Row>
        </Col>
        <Col span={24}>
          <Card>
            {loading ? (
              <Skeleton active paragraph={{ rows: 6 }} />
            ) : (
              <Table
                columns={columns}
                dataSource={settings?.relationTypes || []}
                pagination={false}
                rowKey="name"
                size="middle"
              />
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        destroyOnClose
        footer={[
          <Button key="cancel" onClick={handleModalCancel}>
            {t('label.cancel')}
          </Button>,
          <Button
            key="submit"
            loading={saving}
            type="primary"
            onClick={handleModalOk}>
            {editingRelation ? t('label.update') : t('label.add')}
          </Button>,
        ]}
        open={isModalOpen}
        title={
          editingRelation
            ? t('label.edit-entity', { entity: t('label.relation-type') })
            : t('label.add-entity', { entity: t('label.relation-type') })
        }
        width={600}
        onCancel={handleModalCancel}>
        <Form form={form} layout="vertical">
          <Form.Item
            label={t('label.name')}
            name="name"
            rules={[
              {
                required: true,
                message: t('label.field-required', { field: t('label.name') }),
              },
              {
                pattern: /^[a-zA-Z][a-zA-Z0-9]*$/,
                message: t('message.must-start-with-letter-alphanumeric'),
              },
            ]}>
            <Input
              disabled={Boolean(editingRelation)}
              placeholder={t('label.enter-entity', { entity: t('label.name') })}
            />
          </Form.Item>

          <Form.Item
            label={t('label.display-name')}
            name="displayName"
            rules={[
              {
                required: true,
                message: t('label.field-required', {
                  field: t('label.display-name'),
                }),
              },
            ]}>
            <Input
              placeholder={t('label.enter-entity', {
                entity: t('label.display-name'),
              })}
            />
          </Form.Item>

          <Form.Item label={t('label.description')} name="description">
            <Input.TextArea
              placeholder={t('label.enter-entity', {
                entity: t('label.description'),
              })}
              rows={3}
            />
          </Form.Item>

          <Form.Item
            label={t('label.category')}
            name="category"
            rules={[{ required: true }]}>
            <Select options={CATEGORY_OPTIONS} />
          </Form.Item>

          <Form.Item
            label={t('label.inverse-relation')}
            name="inverseRelation"
            tooltip={t('message.inverse-relation-tooltip')}>
            <Input
              placeholder={t('label.enter-entity', {
                entity: t('label.inverse-relation'),
              })}
            />
          </Form.Item>

          <Form.Item
            label={t('label.rdf-predicate')}
            name="rdfPredicate"
            tooltip={t('message.rdf-predicate-tooltip')}>
            <Input placeholder="skos:broader" />
          </Form.Item>

          <Form.Item
            label={t('label.color')}
            name="color"
            tooltip={t('message.relation-color-tooltip')}>
            <Input
              placeholder="#1890ff"
              style={{ width: 150 }}
              suffix={
                <Form.Item noStyle shouldUpdate>
                  {({ getFieldValue }) => (
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        backgroundColor: getFieldValue('color') || '#d9d9d9',
                        borderRadius: 2,
                        border: '1px solid #d9d9d9',
                      }}
                    />
                  )}
                </Form.Item>
              }
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label={t('label.symmetric')}
                name="isSymmetric"
                valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label={t('label.transitive')}
                name="isTransitive"
                valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label={t('label.cross-glossary')}
                name="isCrossGlossaryAllowed"
                valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </PageLayoutV1>
  );
}

export default GlossaryTermRelationSettingsPage;
