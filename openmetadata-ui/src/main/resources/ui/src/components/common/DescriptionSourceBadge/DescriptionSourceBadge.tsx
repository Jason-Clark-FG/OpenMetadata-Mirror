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

import { Tag, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { ReactComponent as AutomatedTagIcon } from '../../../assets/svg/automated-tag.svg';
import { ChangeSource } from '../../../generated/entity/classification/tag';
import { formatDateTime } from '../../../utils/date-time/DateTimeUtils';
import './description-source-badge.less';
import { DescriptionSourceBadgeProps } from './DescriptionSourceBadge.interface';

const AI_CHANGE_SOURCES: ChangeSource[] = [
  ChangeSource.Suggested,
  ChangeSource.Automated,
];

const DescriptionSourceBadge = ({
  changeSummaryEntry,
}: DescriptionSourceBadgeProps) => {
  const { t } = useTranslation();

  if (!changeSummaryEntry?.changeSource) {
    return null;
  }

  const isAIGenerated = AI_CHANGE_SOURCES.includes(
    changeSummaryEntry.changeSource
  );

  if (!isAIGenerated) {
    return null;
  }

  const tooltipContent = (
    <div className="description-source-tooltip">
      <div>
        {t('label.generated-by')} {t('label.automated')}
      </div>
      {changeSummaryEntry.changedBy && (
        <div>
          {t('label.accepted-by')}: {changeSummaryEntry.changedBy}
        </div>
      )}
      {changeSummaryEntry.changedAt && (
        <div>{formatDateTime(changeSummaryEntry.changedAt)}</div>
      )}
    </div>
  );

  return (
    <Tooltip title={tooltipContent}>
      <Tag
        className="description-source-badge"
        data-testid="ai-generated-badge">
        <AutomatedTagIcon height={12} width={12} />
        <span>{t('label.automated')}</span>
      </Tag>
    </Tooltip>
  );
};

export default DescriptionSourceBadge;
