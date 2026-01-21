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

import {
  ApartmentOutlined,
  CloseOutlined,
  ExportOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  Button,
  Empty,
  List,
  Space,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EntityType } from '../../enums/entity.enum';
import { getEntityDetailsPath } from '../../utils/RouterUtils';
import RichTextEditorPreviewer from '../common/RichTextEditor/RichTextEditorPreviewer';
import {
  DetailsPanelProps,
  OntologyEdge,
  OntologyNode,
} from './OntologyExplorer.interface';

interface EnhancedDetailsPanelProps extends DetailsPanelProps {
  edges?: OntologyEdge[];
  nodes?: OntologyNode[];
  onNodeClick?: (nodeId: string) => void;
}

const DetailsPanel: React.FC<EnhancedDetailsPanelProps> = ({
  node,
  edges = [],
  nodes = [],
  onClose,
  onAddRelation,
  onNodeClick,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('summary');

  const entityPath = useMemo(() => {
    if (!node?.fullyQualifiedName) {
      return '';
    }
    const entityType =
      node.type === 'glossary' ? EntityType.GLOSSARY : EntityType.GLOSSARY_TERM;

    return getEntityDetailsPath(entityType, node.fullyQualifiedName);
  }, [node]);

  const handleNavigateToEntity = useCallback(() => {
    if (entityPath) {
      window.open(entityPath, '_blank');
    }
  }, [entityPath]);

  const nodeRelations = useMemo(() => {
    if (!node) {
      return { incoming: [], outgoing: [] };
    }
    const incoming = edges
      .filter((e) => e.to === node.id)
      .map((e) => ({
        ...e,
        relatedNode: nodes.find((n) => n.id === e.from),
      }));
    const outgoing = edges
      .filter((e) => e.from === node.id)
      .map((e) => ({
        ...e,
        relatedNode: nodes.find((n) => n.id === e.to),
      }));

    return { incoming, outgoing };
  }, [node, edges, nodes]);

  const handleRelatedNodeClick = useCallback(
    (nodeId: string) => {
      onNodeClick?.(nodeId);
    },
    [onNodeClick]
  );

  if (!node) {
    return null;
  }

  const summaryContent = (
    <div className="details-tab-content">
      {node.fullyQualifiedName && (
        <div className="detail-section">
          <div className="section-label">{t('label.fully-qualified-name')}</div>
          <div className="section-value">
            <Typography.Text
              copyable={{ text: node.fullyQualifiedName }}
              ellipsis={{ tooltip: node.fullyQualifiedName }}>
              {node.fullyQualifiedName}
            </Typography.Text>
          </div>
        </div>
      )}

      {node.description && (
        <div className="detail-section">
          <div className="section-label">{t('label.description')}</div>
          <div className="section-value description-preview">
            <RichTextEditorPreviewer markdown={node.description} />
          </div>
        </div>
      )}

      {node.group && (
        <div className="detail-section">
          <div className="section-label">{t('label.glossary')}</div>
          <div className="section-value">
            <Tag color="blue">{node.group}</Tag>
          </div>
        </div>
      )}

      <div className="detail-section">
        <div className="section-label">{t('label.type')}</div>
        <div className="section-value">
          <Tag>{node.type}</Tag>
        </div>
      </div>
    </div>
  );

  const relationsContent = (
    <div className="details-tab-content">
      {nodeRelations.outgoing.length > 0 && (
        <div className="relations-section">
          <Typography.Text strong className="d-block m-b-xs">
            {t('label.outgoing-relation-plural')} (
            {nodeRelations.outgoing.length})
          </Typography.Text>
          <List
            dataSource={nodeRelations.outgoing}
            renderItem={(rel) => (
              <List.Item
                className="relation-item cursor-pointer"
                onClick={() =>
                  rel.relatedNode && handleRelatedNodeClick(rel.relatedNode.id)
                }>
                <Space>
                  <Tag color="green">{rel.relationType}</Tag>
                  <Typography.Text>
                    {rel.relatedNode?.label || rel.to}
                  </Typography.Text>
                </Space>
              </List.Item>
            )}
            size="small"
          />
        </div>
      )}

      {nodeRelations.incoming.length > 0 && (
        <div className="relations-section m-t-md">
          <Typography.Text strong className="d-block m-b-xs">
            {t('label.incoming-relation-plural')} (
            {nodeRelations.incoming.length})
          </Typography.Text>
          <List
            dataSource={nodeRelations.incoming}
            renderItem={(rel) => (
              <List.Item
                className="relation-item cursor-pointer"
                onClick={() =>
                  rel.relatedNode && handleRelatedNodeClick(rel.relatedNode.id)
                }>
                <Space>
                  <Tag color="blue">{rel.relationType}</Tag>
                  <Typography.Text>
                    {rel.relatedNode?.label || rel.from}
                  </Typography.Text>
                </Space>
              </List.Item>
            )}
            size="small"
          />
        </div>
      )}

      {nodeRelations.outgoing.length === 0 &&
        nodeRelations.incoming.length === 0 && (
          <Empty
            description={t('message.no-relations-found')}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
    </div>
  );

  const tabItems = [
    {
      key: 'summary',
      label: (
        <Space>
          <InfoCircleOutlined />
          {t('label.summary')}
        </Space>
      ),
      children: summaryContent,
    },
    {
      key: 'relations',
      label: (
        <Space>
          <LinkOutlined />
          {t('label.relation-plural')} (
          {nodeRelations.incoming.length + nodeRelations.outgoing.length})
        </Space>
      ),
      children: relationsContent,
    },
  ];

  return (
    <div className="ontology-explorer-details enhanced">
      <div className="details-header">
        <div className="details-title">
          <ApartmentOutlined className="m-r-xs" />
          <span>{node.label}</span>
        </div>
        <Button
          icon={<CloseOutlined />}
          size="small"
          type="text"
          onClick={onClose}
        />
      </div>

      <Tabs
        activeKey={activeTab}
        className="details-tabs"
        items={tabItems}
        size="small"
        onChange={setActiveTab}
      />

      <div className="details-actions">
        {entityPath && (
          <Tooltip title={t('label.view-in-new-tab')}>
            <Button
              icon={<ExportOutlined />}
              type="default"
              onClick={handleNavigateToEntity}>
              {t('label.view')}
            </Button>
          </Tooltip>
        )}
        {onAddRelation && (
          <Button
            icon={<PlusOutlined />}
            type="primary"
            onClick={() => onAddRelation(node)}>
            {t('label.add-entity', { entity: t('label.relation') })}
          </Button>
        )}
      </div>
    </div>
  );
};

export default DetailsPanel;
