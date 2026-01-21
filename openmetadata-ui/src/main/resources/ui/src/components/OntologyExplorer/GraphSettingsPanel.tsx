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

import { SettingOutlined } from '@ant-design/icons';
import {
  Button,
  Divider,
  Popover,
  Select,
  Space,
  Switch,
  Typography,
} from 'antd';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GraphSettings,
  LayoutAlgorithm,
  NodeColorMode,
  NodeSizeMode,
} from './OntologyExplorer.interface';

interface GraphSettingsPanelProps {
  settings: GraphSettings;
  onSettingsChange: (settings: GraphSettings) => void;
}

const GraphSettingsPanel: React.FC<GraphSettingsPanelProps> = ({
  settings,
  onSettingsChange,
}) => {
  const { t } = useTranslation();

  const handleLayoutChange = useCallback(
    (layout: LayoutAlgorithm) => {
      onSettingsChange({ ...settings, layout });
    },
    [settings, onSettingsChange]
  );

  const handleNodeColorModeChange = useCallback(
    (nodeColorMode: NodeColorMode) => {
      onSettingsChange({ ...settings, nodeColorMode });
    },
    [settings, onSettingsChange]
  );

  const handleNodeSizeModeChange = useCallback(
    (nodeSizeMode: NodeSizeMode) => {
      onSettingsChange({ ...settings, nodeSizeMode });
    },
    [settings, onSettingsChange]
  );

  const handleToggle = useCallback(
    (key: keyof GraphSettings, value: boolean) => {
      onSettingsChange({ ...settings, [key]: value });
    },
    [settings, onSettingsChange]
  );

  const content = (
    <div className="graph-settings-content" style={{ width: 280 }}>
      <Typography.Text strong className="d-block m-b-sm">
        {t('label.layout')}
      </Typography.Text>
      <Select
        className="w-full m-b-md"
        options={[
          { value: 'force', label: t('label.force-directed') },
          { value: 'hierarchical', label: t('label.hierarchical') },
          { value: 'radial', label: t('label.radial') },
          { value: 'circular', label: t('label.circular') },
        ]}
        value={settings.layout}
        onChange={handleLayoutChange}
      />

      <Divider className="m-y-sm" />

      <Typography.Text strong className="d-block m-b-sm">
        {t('label.node-color')}
      </Typography.Text>
      <Select
        className="w-full m-b-md"
        options={[
          { value: 'glossary', label: t('label.by-glossary') },
          { value: 'relationType', label: t('label.by-relation-type') },
          { value: 'hierarchyLevel', label: t('label.by-hierarchy-level') },
          { value: 'connectionCount', label: t('label.by-connection-count') },
        ]}
        value={settings.nodeColorMode}
        onChange={handleNodeColorModeChange}
      />

      <Typography.Text strong className="d-block m-b-sm">
        {t('label.node-size')}
      </Typography.Text>
      <Select
        className="w-full m-b-md"
        options={[
          { value: 'uniform', label: t('label.uniform') },
          { value: 'connectionCount', label: t('label.by-connection-count') },
          { value: 'childCount', label: t('label.by-child-count') },
        ]}
        value={settings.nodeSizeMode}
        onChange={handleNodeSizeModeChange}
      />

      <Divider className="m-y-sm" />

      <Space className="w-full" direction="vertical">
        <div className="d-flex justify-between align-center">
          <Typography.Text>{t('label.edge-labels')}</Typography.Text>
          <Switch
            checked={settings.showEdgeLabels}
            size="small"
            onChange={(checked) => handleToggle('showEdgeLabels', checked)}
          />
        </div>

        <div className="d-flex justify-between align-center">
          <Typography.Text>{t('label.highlight-on-hover')}</Typography.Text>
          <Switch
            checked={settings.highlightOnHover}
            size="small"
            onChange={(checked) => handleToggle('highlightOnHover', checked)}
          />
        </div>

        <div className="d-flex justify-between align-center">
          <Typography.Text>{t('label.animate-transitions')}</Typography.Text>
          <Switch
            checked={settings.animateTransitions}
            size="small"
            onChange={(checked) => handleToggle('animateTransitions', checked)}
          />
        </div>

        <div className="d-flex justify-between align-center">
          <Typography.Text>{t('label.physics-simulation')}</Typography.Text>
          <Switch
            checked={settings.physicsEnabled}
            size="small"
            onChange={(checked) => handleToggle('physicsEnabled', checked)}
          />
        </div>
      </Space>
    </div>
  );

  return (
    <Popover
      content={content}
      placement="bottomRight"
      title={t('label.graph-settings')}
      trigger="click">
      <Button icon={<SettingOutlined />} size="small">
        {t('label.settings')}
      </Button>
    </Popover>
  );
};

export default GraphSettingsPanel;
