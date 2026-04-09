import { CaretRightOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { Handle, Position } from 'reactflow';

const StartNode = () => {
  const { t } = useTranslation();

  return (
    <div className="start-node">
      <CaretRightOutlined />
      <Typography.Text className="text-white">
        {t('label.start')}
      </Typography.Text>
      <Handle isConnectable={false} position={Position.Bottom} type="source" />
    </div>
  );
};

export default StartNode;
