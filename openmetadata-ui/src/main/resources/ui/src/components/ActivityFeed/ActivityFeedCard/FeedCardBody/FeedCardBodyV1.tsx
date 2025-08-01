/*
 *  Copyright 2023 Collate.
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

import { Button, Col, Row, Typography } from 'antd';
import classNames from 'classnames';
import { isUndefined } from 'lodash';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import ActivityFeedEditor from '../../../../components/ActivityFeed/ActivityFeedEditor/ActivityFeedEditor';
import { ASSET_CARD_STYLES } from '../../../../constants/Feeds.constants';
import { EntityType } from '../../../../enums/entity.enum';
import { CardStyle } from '../../../../generated/entity/feed/thread';
import {
  AlertType,
  EventSubscription,
} from '../../../../generated/events/eventSubscription';
import { formatDateTime } from '../../../../utils/date-time/DateTimeUtils';
import entityUtilClassBase from '../../../../utils/EntityUtilClassBase';
import {
  getEntityFQN,
  getEntityType,
  getFrontEndFormat,
  MarkdownToHTMLConverter,
} from '../../../../utils/FeedUtils';
import RichTextEditorPreviewerV1 from '../../../common/RichTextEditor/RichTextEditorPreviewerV1';
import ExploreSearchCard from '../../../ExploreV1/ExploreSearchCard/ExploreSearchCard';
import DescriptionFeed from '../../ActivityFeedCardV2/FeedCardBody/DescriptionFeed/DescriptionFeed';
import TagsFeed from '../../ActivityFeedCardV2/FeedCardBody/TagsFeed/TagsFeed';
import './feed-card-body-v1.less';
import { FeedCardBodyV1Props } from './FeedCardBodyV1.interface';

const FeedCardBodyV1 = ({
  isPost = false,
  feed,
  isEditPost,
  className,
  showSchedule = true,
  message,
  announcement,
  onUpdate,
  onEditCancel,
}: FeedCardBodyV1Props) => {
  const { t } = useTranslation();
  const [postMessage, setPostMessage] = useState<string>(message);

  const { entityFQN, entityType, cardStyle } = useMemo(() => {
    return {
      entityFQN: getEntityFQN(feed.about) ?? '',
      entityType: getEntityType(feed.about) ?? '',
      cardStyle: feed.cardStyle ?? '',
    };
  }, [feed]);

  const handleSave = useCallback(() => {
    onUpdate?.(postMessage ?? '');
  }, [onUpdate, postMessage]);

  const getDefaultValue = (defaultMessage: string) => {
    return MarkdownToHTMLConverter.makeHtml(getFrontEndFormat(defaultMessage));
  };

  const feedBodyStyleCardsRender = useMemo(() => {
    if (!isPost) {
      if (cardStyle === CardStyle.Description) {
        return <DescriptionFeed feed={feed} />;
      }

      if (cardStyle === CardStyle.Tags) {
        return <TagsFeed feed={feed} />;
      }

      if (ASSET_CARD_STYLES.includes(cardStyle as CardStyle)) {
        const entityInfo = feed.feedInfo?.entitySpecificInfo?.entity;
        const isExecutableTestSuite =
          entityType === EntityType.TEST_SUITE && entityInfo.basic;
        const isObservabilityAlert =
          entityType === EntityType.EVENT_SUBSCRIPTION &&
          (entityInfo as EventSubscription).alertType ===
            AlertType.Observability;

        const entityCard = (
          <ExploreSearchCard
            className="asset-info-card"
            id={`tabledatacard${entityInfo.id}`}
            showTags={false}
            source={{ ...entityInfo, entityType }}
          />
        );

        return cardStyle === CardStyle.EntityDeleted ? (
          <div className="deleted-entity">{entityCard}</div>
        ) : (
          <Link
            className="no-underline text-body text-hover-body"
            to={entityUtilClassBase.getEntityLink(
              entityType,
              entityFQN,
              '',
              '',
              isExecutableTestSuite,
              isObservabilityAlert
            )}>
            {entityCard}
          </Link>
        );
      }
    }

    return (
      <RichTextEditorPreviewerV1
        className="text-wrap"
        markdown={getFrontEndFormat(message)}
      />
    );
  }, [isPost, message, postMessage, cardStyle, feed, entityType, entityFQN]);

  const feedBodyRender = useMemo(() => {
    if (isEditPost) {
      return (
        <ActivityFeedEditor
          focused
          className="mb-8"
          defaultValue={getDefaultValue(message)}
          editAction={
            <div className="d-flex justify-end gap-2 m-r-xss">
              <Button
                className="border border-primary text-primary rounded-4"
                data-testid="cancel-button"
                size="small"
                onClick={onEditCancel}>
                {t('label.cancel')}
              </Button>
              <Button
                className="rounded-4"
                data-testid="save-button"
                disabled={!message.length}
                size="small"
                type="primary"
                onClick={handleSave}>
                {t('label.save')}
              </Button>
            </div>
          }
          editorClass="is_edit_post"
          onSave={handleSave}
          onTextChange={(message) => setPostMessage(message)}
        />
      );
    }

    return feedBodyStyleCardsRender;
  }, [isEditPost, message, feedBodyStyleCardsRender]);

  return (
    <div
      className={classNames('p-y-sm rounded-6', isEditPost ? '' : className)}>
      <div className="feed-message">
        {!isUndefined(announcement) ? (
          <>
            <Row>
              <Col span={24}>
                {showSchedule && (
                  <Typography.Text className="feed-body-schedule text-xs text-grey-muted">
                    {t('label.schedule')}{' '}
                    {formatDateTime(announcement.startTime)}{' '}
                    {t('label.to-lowercase')}{' '}
                    {formatDateTime(announcement.endTime)}
                  </Typography.Text>
                )}
              </Col>
            </Row>
            <Row>
              <Col span={24}>
                <Typography.Text className="font-semibold">
                  {message}
                </Typography.Text>
              </Col>
            </Row>
            <Row>
              <Col span={24}>
                <RichTextEditorPreviewerV1
                  className="text-wrap"
                  markdown={announcement.description ?? ''}
                />
              </Col>
            </Row>
          </>
        ) : (
          feedBodyRender
        )}
      </div>
    </div>
  );
};

export default FeedCardBodyV1;
