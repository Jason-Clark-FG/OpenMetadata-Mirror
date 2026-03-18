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

import { Sidebar } from '@openmetadata/ui-core-components';
import { useLocation } from 'react-router-dom';
import { CUSTOM_SIDEBAR_ROUTES } from '../../constants/CustomSidebar.constants';
import { useCurrentUserPreferences } from '../../hooks/currentUserStore/useCurrentUserStore';
import { useSidebarStore } from '../../hooks/useSidebarStore';
import BrandImage from '../common/BrandImage/BrandImage';
import LeftSidebar from '../MyData/LeftSidebar/LeftSidebar.component';

const AppSidebar = () => {
  const { customItems, customBottomItems } = useSidebarStore();
  const { pathname } = useLocation();
  const {
    preferences: { isSidebarCollapsed },
  } = useCurrentUserPreferences();

  const isCustomRoute = CUSTOM_SIDEBAR_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  if (!customItems && !isCustomRoute) {
    return <LeftSidebar />;
  }

  if (!customItems) {
    return null;
  }

  return (
    <Sidebar
      activeUrl={pathname}
      bottomItems={customBottomItems ?? undefined}
      collapsed={isSidebarCollapsed}
      collapsedLogo={
        <BrandImage
          isMonoGram
          className="tw:h-10 tw:w-auto"
          dataTestId="image"
          height={40}
          width="auto"
        />
      }
      items={customItems}
      logo={
        <BrandImage
          className="tw:h-10 tw:w-auto"
          dataTestId="image"
          height={40}
          width="auto"
        />
      }
    />
  );
};

export default AppSidebar;
