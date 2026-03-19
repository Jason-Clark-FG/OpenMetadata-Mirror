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

import type {
  NavItemDividerType,
  NavItemType,
} from '@openmetadata/ui-core-components';
import { NavList } from '@openmetadata/ui-core-components';
import classNames from 'classnames';
import { ReactNode } from 'react';
import './app-sidebar.less';

export interface SidebarProps {
  items: (NavItemType | NavItemDividerType)[];
  bottomItems?: (NavItemType | NavItemDividerType)[];
  activeUrl?: string;
  collapsed?: boolean;
  collapsedWidth?: number;
  expandedWidth?: number;
  logo?: ReactNode;
  collapsedLogo?: ReactNode;
  className?: string;
}

const Sidebar = ({
  items,
  bottomItems,
  activeUrl,
  collapsed = false,
  collapsedWidth = 72,
  expandedWidth = 197,
  logo,
  collapsedLogo,
  className,
}: SidebarProps) => {
  return (
    <aside
      className={classNames(
        'tw:flex tw:h-full tw:flex-col tw:bg-[#f8f9fc] tw:overflow-hidden',
        'tw:transition-[width] tw:duration-300 tw:ease-in-out',
        className
      )}
      data-testid="app-sidebar"
      style={{ width: collapsed ? collapsedWidth : expandedWidth }}>
      {(logo || collapsedLogo) && (
        <div
          className={classNames(
            'tw:flex tw:items-center tw:my-5',
            collapsed ? 'tw:justify-center' : 'tw:pl-6'
          )}>
          {collapsed ? collapsedLogo ?? logo : logo}
        </div>
      )}

      <NavList activeUrl={activeUrl} items={items} />

      {bottomItems && (
        <>
          <div className="tw:flex-1" />
          <NavList activeUrl={activeUrl} items={bottomItems} />
        </>
      )}
    </aside>
  );
};

export default Sidebar;
