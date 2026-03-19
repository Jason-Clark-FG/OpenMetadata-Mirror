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

import { Typography } from '@openmetadata/ui-core-components';
import { ArrowRight, Asterisk01 } from '@untitledui/icons';
import { Thread } from '../../../generated/entity/feed/thread';
import { getTextFromHtmlString } from '../../../utils/BlockEditorUtils';

interface AnnouncementItemV2Props {
  announcement: Thread;
  onClick: () => void;
}

const AnnouncementItemV2 = ({
  announcement,
  onClick,
}: AnnouncementItemV2Props) => {
  return (
    <div
      className="tw:flex tw:items-start tw:gap-3 tw:py-3 tw:cursor-pointer tw:group"
      data-testid={`announcement-item-${announcement.id}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onClick();
        }
      }}>
      <Asterisk01 className="tw:size-[7px] tw:shrink-0 tw:self-center tw:text-text-primary" />
      <div className="tw:flex-1 tw:min-w-0">
        <Typography
          as="span"
          className="tw:block tw:text-xs tw:font-semibold tw:text-text-primary tw:truncate">
          {announcement.message}
        </Typography>
        {announcement.announcement?.description && (
          <Typography
            as="span"
            className="tw:block tw:text-xs tw:text-text-tertiary tw:truncate tw:mt-0.5">
            {getTextFromHtmlString(announcement.announcement.description)}
          </Typography>
        )}
      </div>
      <ArrowRight className="tw:size-4 tw:shrink-0 tw:mt-1 tw:text-text-tertiary tw:group-hover:text-text-primary tw:transition-colors" />
    </div>
  );
};

export default AnnouncementItemV2;
