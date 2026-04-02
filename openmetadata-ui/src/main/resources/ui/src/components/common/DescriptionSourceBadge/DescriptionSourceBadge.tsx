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
import classNames from 'classnames';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactComponent as AutomatedTagIcon } from '../../../assets/svg/automated-tag.svg';
import { ReactComponent as AutomatorBotIcon } from '../../../assets/svg/automator-bot.svg';
import { ReactComponent as CheckCircleIcon } from '../../../assets/svg/ic-check-circle-colored.svg';
import { ReactComponent as StarIcon } from '../../../assets/svg/ic-suggestions-coloured.svg';
import { ChangeSource } from '../../../generated/type/changeSummaryMap';
import {
  formatDate,
  formatDateTime,
  getShortRelativeTime,
} from '../../../utils/date-time/DateTimeUtils';
import './description-source-badge.less';
import { DescriptionSourceBadgeProps } from './DescriptionSourceBadge.interface';

interface BadgeConfig {
  labelKey: string;
  tooltipKey: string;
  icon: React.ReactNode;
  className: string;
  testId: string;
  iconOnly?: boolean;
}

const BADGE_CONFIG: Partial<Record<ChangeSource, BadgeConfig>> = {
  [ChangeSource.Suggested]: {
    labelKey: 'label.ai',
    tooltipKey: 'label.ai-suggested',
    icon: <StarIcon width={16} />,
    className: 'badge-suggested',
    testId: 'ai-suggested-badge',
    iconOnly: true,
  },
  [ChangeSource.Automated]: {
    labelKey: 'label.automated',
    tooltipKey: 'label.automated',
    icon: <AutomatorBotIcon height={12} width={12} />,
    className: 'badge-automated',
    testId: 'automated-badge',
  },
  [ChangeSource.Propagated]: {
    labelKey: 'label.propagated',
    tooltipKey: 'label.propagated',
    icon: <AutomatedTagIcon height={12} width={12} />,
    className: 'badge-propagated',
    testId: 'propagated-badge',
  },
};

const DescriptionSourceBadge = ({
  changeSummaryEntry,
  showAcceptedBy = true,
  showBadge = true,
  showTimestamp = true,
}: DescriptionSourceBadgeProps) => {
  const { t } = useTranslation();

  const config = useMemo(() => {
    if (!changeSummaryEntry?.changeSource) {
      return null;
    }

    return BADGE_CONFIG[changeSummaryEntry.changeSource] ?? null;
  }, [changeSummaryEntry?.changeSource]);

  const isManualChange =
    changeSummaryEntry?.changeSource === ChangeSource.Manual;

  if (!config && !isManualChange) {
    return null;
  }

  const tooltipContent = changeSummaryEntry?.changedAt
    ? formatDateTime(changeSummaryEntry.changedAt)
    : undefined;

  const actorLabel = config ? t('label.accepted-by') : t('label.authored-by');

  const relativeTime = changeSummaryEntry?.changedAt
    ? getShortRelativeTime(changeSummaryEntry.changedAt) ||
      formatDate(changeSummaryEntry.changedAt)
    : '';

  const actorInfo =
    showAcceptedBy && changeSummaryEntry?.changedBy ? (
      <span
        className={classNames('description-source-text', {
          'description-source-text-success': Boolean(config),
        })}
        data-testid="source-actor">
        {config ? <CheckCircleIcon height={14} width={14} /> : null}
        <span>
          {actorLabel} {changeSummaryEntry.changedBy}
        </span>
      </span>
    ) : null;

  const timestampInfo =
    showTimestamp && relativeTime ? (
      <span className="description-source-time" data-testid="source-timestamp">
        {relativeTime}
      </span>
    ) : null;

  if (!showBadge && !actorInfo && !timestampInfo) {
    return null;
  }

  return (
    <div
      className="description-source-container"
      data-testid="description-source-container">
      {showBadge && config ? (
        config.iconOnly ? (
          <Tooltip title={t(config.tooltipKey)}>
            <span data-testid={config.testId} role="status" tabIndex={0}>
              {config.icon}
            </span>
          </Tooltip>
        ) : (
          <Tooltip title={tooltipContent}>
            <Tag
              className={classNames(
                'description-source-badge',
                config.className
              )}
              data-testid={config.testId}
              role="status"
              tabIndex={0}>
              {config.icon}
              <span>{t(config.labelKey)}</span>
            </Tag>
          </Tooltip>
        )
      ) : null}
      {(actorInfo || timestampInfo) && (
        <div className="description-source-metadata">
          {actorInfo}
          {actorInfo && timestampInfo ? (
            <span className="description-source-separator">•</span>
          ) : null}
          {timestampInfo}
        </div>
      )}
    </div>
  );
};

export default DescriptionSourceBadge;
