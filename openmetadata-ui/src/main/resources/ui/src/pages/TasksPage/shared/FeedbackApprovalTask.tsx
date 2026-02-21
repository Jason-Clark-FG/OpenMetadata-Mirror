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

import { BadgeWithDot } from '@openmetadata/ui-core-components';
import {
  Clock,
  CpuChip02,
  Database01,
  Flag04,
  MessageTextSquare01,
  UsersRight,
} from '@untitledui/icons';
import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import UserPopOverCard from '../../../components/common/PopOverCard/UserPopOverCard';
import RichTextEditorPreviewerNew from '../../../components/common/RichTextEditor/RichTextEditorPreviewNew';
import { EntityType } from '../../../enums/entity.enum';
import {
  FeedbackType,
  RecognizerFeedback,
  TaskDetails,
} from '../../../generated/entity/feed/thread';
import { formatDateTime } from '../../../utils/date-time/DateTimeUtils';
import EntityLink from '../../../utils/EntityLink';
import { getEntityName } from '../../../utils/EntityUtils';
import { getEntityDetailsPath } from '../../../utils/RouterUtils';

interface FeedbackApprovalTaskProps {
  task: TaskDetails;
}

const FeedbackApprovalTask: FC<FeedbackApprovalTaskProps> = ({ task }) => {
  const { t } = useTranslation();
  const feedback: RecognizerFeedback | undefined = task?.feedback;
  const recognizerName = task?.recognizer?.recognizerName || '';

  const feedbackTypeLabel = useMemo(() => {
    if (!feedback?.feedbackType) {
      return '';
    }

    const typeMap: Record<FeedbackType, string> = {
      [FeedbackType.FalsePositive]: t('label.feedback-type-false-positive'),
      [FeedbackType.IncorrectClassification]: t(
        'label.feedback-type-incorrect-classification'
      ),
      [FeedbackType.OverlyBroad]: t('label.feedback-type-overly-broad'),
      [FeedbackType.ContextSpecific]: t('label.feedback-type-context-specific'),
    };

    return typeMap[feedback.feedbackType] || feedback.feedbackType;
  }, [feedback?.feedbackType, t]);

  const entityLinkData = useMemo(() => {
    if (!feedback?.entityLink) {
      return null;
    }

    const entityType = EntityLink.getEntityType(feedback.entityLink);
    const entityFqn = EntityLink.getEntityFqn(feedback.entityLink);

    if (!entityType || !entityFqn) {
      return null;
    }

    return {
      entityPath: getEntityDetailsPath(entityType as EntityType, entityFqn),
      entityName: EntityLink.getEntityColumnFqn(feedback.entityLink),
    };
  }, [feedback?.entityLink]);

  if (!feedback) {
    return <div />;
  }

  return (
    <div
      className="feedback-approval-task tw:flex tw:flex-col tw:gap-4 tw:-mt-1.5"
      data-testid="feedback-approval-task">
      {recognizerName && (
        <div className="tw:flex tw:items-start tw:gap-3">
          <div className="prose tw:flex-[0_0_32%] tw:max-w-[32%]">
            <p className="tw:flex tw:items-center tw:gap-2 tw:text-grey-muted tw:min-w-0">
              <CpuChip02 className="tw:text-grey-muted tw:shrink-0" size={16} />
              {t('label.recognizer')}
            </p>
          </div>
          <div className="prose">
            <p className="tw:text-grey-muted">{recognizerName}</p>
          </div>
        </div>
      )}

      <div className="tw:flex tw:items-start tw:gap-3">
        <div className="prose tw:flex-[0_0_32%] tw:max-w-[32%]">
          <p className="tw:flex tw:items-center tw:gap-2 tw:text-grey-muted tw:min-w-0">
            <Flag04 className="tw:text-grey-muted tw:shrink-0" size={16} />
            {t('label.feedback-type')}
          </p>
        </div>
        <BadgeWithDot color="error" size="sm" type="pill-color">
          {feedbackTypeLabel}
        </BadgeWithDot>
      </div>

      {feedback.userComments && (
        <div className="tw:flex tw:items-start tw:gap-3">
          <div className="prose tw:flex-[0_0_32%] tw:max-w-[32%]">
            <p className="tw:flex tw:items-center tw:gap-2 tw:text-grey-muted tw:min-w-0">
              <MessageTextSquare01
                className="tw:text-grey-muted tw:shrink-0"
                size={16}
              />
              {t('label.comment-plural')}
            </p>
          </div>
          <RichTextEditorPreviewerNew
            className="text-grey-700 tw:text-xs"
            markdown={feedback.userComments}
            maxLength={100}
          />
        </div>
      )}

      {feedback.createdBy && (
        <div className="tw:flex tw:items-start tw:gap-3">
          <div className="prose tw:flex-[0_0_32%] tw:max-w-[32%]">
            <p className="tw:flex tw:items-center tw:gap-2 tw:text-grey-muted tw:min-w-0">
              <UsersRight
                className="tw:text-grey-muted tw:shrink-0"
                size={16}
              />
              {t('label.submitted-by')}
            </p>
          </div>
          <UserPopOverCard
            showUserName
            displayName={getEntityName(feedback.createdBy)}
            profileWidth={22}
            userName={feedback.createdBy.name || '-'}
          />
        </div>
      )}

      {feedback.createdAt && (
        <div className="tw:flex tw:items-start tw:gap-3">
          <div className="prose tw:flex-[0_0_32%] tw:max-w-[32%]">
            <p className="tw:flex tw:items-center tw:gap-2 tw:text-grey-muted tw:min-w-0">
              <Clock className="tw:text-grey-muted tw:shrink-0" size={16} />
              {t('label.submitted-on')}
            </p>
          </div>
          <div className="prose">
            <p className="tw:text-grey-muted tw:text-xs">
              {formatDateTime(feedback.createdAt)}
            </p>
          </div>
        </div>
      )}

      {entityLinkData && (
        <div className="tw:flex tw:items-start tw:gap-3">
          <div className="prose tw:flex-[0_0_32%] tw:max-w-[32%]">
            <p className="tw:flex tw:items-center tw:gap-2 tw:text-grey-muted tw:min-w-0">
              <Database01
                className="tw:text-grey-muted tw:shrink-0"
                size={16}
              />
              {t('label.entity-link')}
            </p>
          </div>
          <Link to={entityLinkData.entityPath}>
            <div className="prose">
              <p className="tw:text-primary tw:text-xs tw:font-medium tw:break-all">
                {entityLinkData.entityName}
              </p>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
};

export default FeedbackApprovalTask;
