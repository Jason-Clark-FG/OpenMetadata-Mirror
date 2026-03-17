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

import { ReactNode } from 'react';
import './marketplace-item-card.less';

interface MarketplaceItemCardProps {
  icon: ReactNode;
  name: string;
  subtitle: string;
  backgroundColor?: string;
  onClick: () => void;
  dataTestId?: string;
}

const MarketplaceItemCard = ({
  icon,
  name,
  subtitle,
  backgroundColor,
  onClick,
  dataTestId,
}: MarketplaceItemCardProps) => {
  return (
    <div
      className="marketplace-item-card"
      data-testid={dataTestId}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onClick();
        }
      }}>
      <div
        className="marketplace-item-card-icon"
        style={{ backgroundColor: backgroundColor ?? '#E0E7FF' }}>
        {icon}
      </div>
      <div className="marketplace-item-card-content">
        <span
          className="marketplace-item-card-name tw:truncate tw:block"
          title={name}>
          {name}
        </span>
        <span
          className="marketplace-item-card-subtitle tw:truncate tw:block"
          title={subtitle}>
          {subtitle}
        </span>
      </div>
    </div>
  );
};

export default MarketplaceItemCard;
