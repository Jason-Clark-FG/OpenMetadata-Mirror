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

import {
  Button,
  ButtonUtility,
  defaultColors,
  FeaturedIcon,
  Typography,
} from '@openmetadata/ui-core-components';
import { ArrowRight } from '@untitledui/icons';
import { Popover } from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactComponent as LearningIconSvg } from '../../../assets/svg/ic-learning.svg';
import { getLearningResourcesByContext } from '../../../rest/learningResourceAPI';
import { LearningDrawer } from '../LearningDrawer/LearningDrawer.component';
import { LearningIconProps } from './LearningIcon.interface';

export const LearningIcon: React.FC<LearningIconProps> = ({
  pageId,
  title,
  className = '',
}) => {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resourceCount, setResourceCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const fetchResourceCount = useCallback(async () => {
    if (resourceCount > 0 || hasError) {
      return;
    }
    setIsLoading(true);
    try {
      const response = await getLearningResourcesByContext(pageId, {
        limit: 1,
      });
      setResourceCount(response.paging?.total ?? 0);
    } catch {
      setHasError(true);
      setResourceCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [pageId, resourceCount, hasError]);

  useEffect(() => {
    fetchResourceCount();
  }, []);

  const handleClick = useCallback(() => {
    setDrawerOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  if (hasError || (resourceCount === 0 && !isLoading)) {
    return null;
  }

  const popoverContent = (
    <div className="tw:flex tw:items-center tw:gap-2">
      <Typography as="span" className="tw:whitespace-nowrap">
        {t('label.learn-how-this-feature-works')}
      </Typography>
      <Button
        color="secondary"
        iconTrailing={ArrowRight}
        size="sm"
        onClick={handleClick}>
        {resourceCount} {t('label.tutorial-plural').toLowerCase()}
      </Button>
    </div>
  );

  return (
    <>
      <Popover
        content={popoverContent}
        overlayInnerStyle={{
          borderRadius: '8px',
          background: `linear-gradient(180deg, ${defaultColors.gray[50]} 0%, ${defaultColors.gray[50]} 100%)`,
          padding: '2px 6px',
        }}
        placement="bottomLeft"
        showArrow={false}
        trigger="hover">
        <ButtonUtility
          className={className}
          color="tertiary"
          data-testid="learning-icon"
          icon={
            <FeaturedIcon
              className="tw:hover:text-brand-700"
              color="brand"
              icon={
                <LearningIconSvg className="tw:w-4.5 tw:h-4.5 tw:hover:h-5 tw:hover:w-5" />
              }
            />
          }
          onClick={handleClick}
        />
      </Popover>

      <LearningDrawer
        open={drawerOpen}
        pageId={pageId}
        title={title}
        onClose={handleClose}
      />
    </>
  );
};
