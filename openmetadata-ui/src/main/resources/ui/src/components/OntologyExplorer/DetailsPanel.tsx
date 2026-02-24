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
  AimOutlined,
  ApartmentOutlined,
  CloseOutlined,
  ExportOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  PlusOutlined,
  RightOutlined,
} from '@ant-design/icons';
import {
  Breadcrumb,
  Button,
  Empty,
  List,
  Space,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { startCase } from 'lodash';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EntityType } from '../../enums/entity.enum';
import { GlossaryTermRelationType } from '../../rest/settingConfigAPI';
import {
  getEntityDetailsPath,
  getGlossaryTermDetailsPath,
} from '../../utils/RouterUtils';
import RichTextEditorPreviewer from '../common/RichTextEditor/RichTextEditorPreviewer';
import {
  DetailsPanelProps,
  OntologyEdge,
  OntologyNode,
} from './OntologyExplorer.interface';

interface EnhancedDetailsPanelProps extends DetailsPanelProps {
  edges?: OntologyEdge[];
  nodes?: OntologyNode[];
  relationTypes?: GlossaryTermRelationType[];
  onNodeClick?: (nodeId: string) => void;
  onFocusNode?: () => void;
}

const DetailsPanel: React.FC<EnhancedDetailsPanelProps> = ({
  node,
  edges = [],
  nodes = [],
  relationTypes = [],
  onClose,
  onAddRelation,
  onNodeClick,
  onFocusNode,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('summary');

  const entityPath = useMemo(() => {
    if (!node?.fullyQualifiedName) {
      return '';
    }

    if (node.entityRef?.type && node.entityRef?.fullyQualifiedName) {
      return getEntityDetailsPath(
        node.entityRef.type as EntityType,
        node.entityRef.fullyQualifiedName
      );
    }

    if (node.type === 'metric') {
      return getEntityDetailsPath(EntityType.METRIC, node.fullyQualifiedName);
    }

    return getGlossaryTermDetailsPath(node.fullyQualifiedName);
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

  const relationTypeMap = useMemo(() => {
    const map = new Map<string, GlossaryTermRelationType>();
    relationTypes.forEach((relationType) => {
      map.set(relationType.name, relationType);
    });

    return map;
  }, [relationTypes]);

  const relationLabelOverrides = useMemo<Record<string, string>>(
    () => ({
      metricFor: `${t('label.metric')} ${t('label.for-lowercase')}`,
      hasGlossaryTerm: t('label.tagged-with'),
    }),
    [t]
  );

  const cardinalityLabels = useMemo(
    () => ({
      ONE_TO_ONE: t('label.one-to-one'),
      ONE_TO_MANY: t('label.one-to-many'),
      MANY_TO_ONE: t('label.many-to-one'),
      MANY_TO_MANY: t('label.many-to-many'),
      CUSTOM: t('label.custom'),
    }),
    [t]
  );

  const deriveCardinality = useCallback(
    (relationType?: GlossaryTermRelationType) => {
      if (!relationType) {
        return undefined;
      }
      const sourceMax = relationType.sourceMax;
      const targetMax = relationType.targetMax;
      if (sourceMax == null && targetMax == null) {
        return 'MANY_TO_MANY';
      }
      if (sourceMax === 1 && targetMax === 1) {
        return 'ONE_TO_ONE';
      }
      if (sourceMax === 1 && targetMax == null) {
        return 'ONE_TO_MANY';
      }
      if (sourceMax == null && targetMax === 1) {
        return 'MANY_TO_ONE';
      }

      return 'CUSTOM';
    },
    []
  );

  const formatCardinality = useCallback(
    (relationType?: GlossaryTermRelationType) => {
      if (!relationType) {
        return null;
      }
      const cardinality =
        relationType.cardinality ?? deriveCardinality(relationType);
      if (cardinality && cardinality !== 'CUSTOM') {
        return cardinalityLabels[cardinality] ?? cardinality;
      }

      const source =
        relationType.sourceMax == null ? '*' : relationType.sourceMax;
      const target =
        relationType.targetMax == null ? '*' : relationType.targetMax;
      const customLabel = cardinalityLabels.CUSTOM;

      return `${customLabel} - ${t('label.source')}: ${source}, ${t(
        'label.target'
      )}: ${target}`;
    },
    [cardinalityLabels, deriveCardinality, t]
  );

  const handleRelatedNodeClick = useCallback(
    (nodeId: string) => {
      onNodeClick?.(nodeId);
    },
    [onNodeClick]
  );

  const getReadableType = useCallback(
    (type: string) => {
      if (node?.entityRef?.type) {
        return startCase(node.entityRef.type);
      }
      const typeMap: Record<string, string> = {
        glossary: t('label.glossary'),
        glossaryTerm: t('label.glossary-term'),
        glossaryTermIsolated: t('label.glossary-term'),
        metric: t('label.metric'),
        dataAsset: t('label.data-asset'),
      };

      return typeMap[type] ?? type;
    },
    [t]
  );

  const breadcrumbItems = useMemo(() => {
    if (!node?.fullyQualifiedName) {
      return [];
    }

    const parts = node.fullyQualifiedName.split('.');

    return parts.map((part, index) => ({
      key: index.toString(),
      title:
        index === parts.length - 1 ? (
          <Typography.Text strong>{part}</Typography.Text>
        ) : (
          <Typography.Text type="secondary">{part}</Typography.Text>
        ),
    }));
  }, [node?.fullyQualifiedName]);

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
          <Tag
            color={
              node.type === 'glossary'
                ? 'purple'
                : node.type === 'dataAsset'
                ? 'gold'
                : 'cyan'
            }>
            {getReadableType(node.type)}
          </Tag>
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
                {(() => {
                  const relationMeta = relationTypeMap.get(rel.relationType);
                  const displayName =
                    relationMeta?.displayName ??
                    relationLabelOverrides[rel.relationType] ??
                    rel.relationType;
                  const predicate = relationMeta?.rdfPredicate;
                  const cardinality = formatCardinality(relationMeta);

                  return (
                    <Space direction="vertical" size={2}>
                      <Space>
                        <Tag
                          style={
                            relationMeta?.color
                              ? {
                                  backgroundColor: relationMeta.color,
                                  borderColor: relationMeta.color,
                                  color: '#ffffff',
                                }
                              : undefined
                          }>
                          {displayName}
                        </Tag>
                        <Typography.Text>
                          {rel.relatedNode?.originalLabel ??
                            rel.relatedNode?.label ??
                            rel.to}
                        </Typography.Text>
                      </Space>
                      {(predicate || cardinality) && (
                        <Typography.Text type="secondary">
                          {predicate ? predicate : ''}
                          {predicate && cardinality ? ' • ' : ''}
                          {cardinality ? cardinality : ''}
                        </Typography.Text>
                      )}
                    </Space>
                  );
                })()}
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
                {(() => {
                  const relationMeta = relationTypeMap.get(rel.relationType);
                  const displayName =
                    relationMeta?.displayName ??
                    relationLabelOverrides[rel.relationType] ??
                    rel.relationType;
                  const predicate = relationMeta?.rdfPredicate;
                  const cardinality = formatCardinality(relationMeta);

                  return (
                    <Space direction="vertical" size={2}>
                      <Space>
                        <Tag
                          style={
                            relationMeta?.color
                              ? {
                                  backgroundColor: relationMeta.color,
                                  borderColor: relationMeta.color,
                                  color: '#ffffff',
                                }
                              : undefined
                          }>
                          {displayName}
                        </Tag>
                        <Typography.Text>
                          {rel.relatedNode?.originalLabel ??
                            rel.relatedNode?.label ??
                            rel.from}
                        </Typography.Text>
                      </Space>
                      {(predicate || cardinality) && (
                        <Typography.Text type="secondary">
                          {predicate ? predicate : ''}
                          {predicate && cardinality ? ' • ' : ''}
                          {cardinality ? cardinality : ''}
                        </Typography.Text>
                      )}
                    </Space>
                  );
                })()}
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
          <Tooltip title={node.originalLabel ?? node.label}>
            <Typography.Text ellipsis className="title-text">
              {node.originalLabel ?? node.label}
            </Typography.Text>
          </Tooltip>
        </div>
        <Space size={4}>
          {onFocusNode && (
            <Tooltip title={t('label.focus-selected')}>
              <Button
                icon={<AimOutlined />}
                size="small"
                type="text"
                onClick={onFocusNode}
              />
            </Tooltip>
          )}
          <Button
            icon={<CloseOutlined />}
            size="small"
            type="text"
            onClick={onClose}
          />
        </Space>
      </div>

      {breadcrumbItems.length > 1 && (
        <div className="details-breadcrumb">
          <Breadcrumb separator={<RightOutlined style={{ fontSize: 10 }} />}>
            {breadcrumbItems.map((item) => (
              <Breadcrumb.Item key={item.key}>{item.title}</Breadcrumb.Item>
            ))}
          </Breadcrumb>
        </div>
      )}

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
