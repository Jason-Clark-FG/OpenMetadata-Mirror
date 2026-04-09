import { ForkOutlined } from '@ant-design/icons';
import { Space, Typography } from 'antd';
import classNames from 'classnames';
import { useWorkflowStore } from '../../useWorkflowStore';
import { getEntityName } from '../../../../../utils/EntityUtils';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Handle, Node, Position } from 'reactflow';
import './gateway-node.less';

const GatewayNode = ({ data }: Node['data']) => {
  const { t } = useTranslation();
  const { setDrawerVisible, setSelectedNode, selectedNode } =
    useWorkflowStore();

  const isActive = useMemo(() => {
    return selectedNode?.name === data.name;
  }, [selectedNode]);

  const handleNodeClick = () => {
    setSelectedNode(data);
    setDrawerVisible(true);
  };

  return (
    <div
      className={classNames('gateway-node', { active: isActive })}
      onClick={handleNodeClick}>
      <div className="gateway-node-header">
        <ForkOutlined style={{ fontSize: '24px' }} />
        <Space className="m-l-xs" direction="vertical" size={0}>
          <Typography.Text className="text-grey-muted gateway-node-action">
            {t('label.gateway')}
          </Typography.Text>
          <Typography.Text strong>{getEntityName(data)}</Typography.Text>
        </Space>
      </div>
      <Handle isConnectable={false} position={Position.Bottom} type="source" />
      <Handle isConnectable={false} position={Position.Top} type="target" />
    </div>
  );
};

export default GatewayNode;
