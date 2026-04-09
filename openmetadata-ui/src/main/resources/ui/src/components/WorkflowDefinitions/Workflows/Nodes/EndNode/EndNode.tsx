import { StopOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { Handle, Position } from 'reactflow';

const EndNode = () => {
  const { t } = useTranslation();

  return (
    <div className="end-node">
      <StopOutlined />
      <Typography.Text className="text-white">{t('label.end')}</Typography.Text>
      <Handle isConnectable={false} position={Position.Top} type="target" />
    </div>
  );
};

export default EndNode;
