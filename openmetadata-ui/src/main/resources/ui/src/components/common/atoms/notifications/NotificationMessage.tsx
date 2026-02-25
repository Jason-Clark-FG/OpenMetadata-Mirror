/*
 *  Copyright 2025 Collate.
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

import { iconRingVariants } from '@openmetadata/ui-core-components';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  InfoCircle,
} from '@untitledui/icons';
import { VariantType } from 'notistack';
import React from 'react';

interface NotificationMessageProps {
  message: string | React.ReactNode;
  variant: VariantType;
}

const NotificationMessage: React.FC<NotificationMessageProps> = ({
  message,
  variant,
}) => {
  const getIcon = () => {
    const iconProps = {
      size: 20,
      color: 'currentColor',
    };

    switch (variant) {
      case 'success':
        return <CheckCircle {...iconProps} />;
      case 'error':
        return <AlertCircle {...iconProps} />;
      case 'warning':
        return <AlertTriangle {...iconProps} />;
      case 'info':
        return <InfoCircle {...iconProps} />;
      default:
        return null;
    }
  };

  const getIconColor = () => {
    switch (variant) {
      case 'success':
        return '#079455';
      case 'error':
        return '#D92D20';
      case 'warning':
        return '#DC6803';
      case 'info':
        return '#1570EF';
      default:
        return '#344054';
    }
  };

  const icon = getIcon();
  if (!icon) {
    return <>{message}</>;
  }

  return (
    <div className="flex items-center">
      <div
        data-testid="alert-icon"
        style={{
          ...(iconRingVariants.notification as React.CSSProperties),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: getIconColor(),
          flexShrink: 0,
          margin: '0 19px 0 5px',
        }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>{message}</div>
    </div>
  );
};

export default NotificationMessage;
