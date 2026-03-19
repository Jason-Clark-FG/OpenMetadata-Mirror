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

import { isEmpty } from 'lodash';
import { useCallback, useEffect, useMemo, useState } from 'react';
import RGL, { ReactGridLayoutProps, WidthProvider } from 'react-grid-layout';
import marketplaceBg from '../../assets/img/widgets/marketplace-bg.png';
import Loader from '../../components/common/Loader/Loader';
import AnnouncementsWidgetV2 from '../../components/DataMarketplace/AnnouncementsWidgetV2/AnnouncementsWidgetV2.component';
import MarketplaceGreetingBanner from '../../components/DataMarketplace/MarketplaceGreetingBanner/MarketplaceGreetingBanner.component';
import MarketplaceSearchBar from '../../components/DataMarketplace/MarketplaceSearchBar/MarketplaceSearchBar.component';
import { TAB_GRID_MAX_COLUMNS } from '../../constants/CustomizeWidgets.constants';
import { EntityTabs, EntityType } from '../../enums/entity.enum';
import { Page, PageType } from '../../generated/system/ui/page';
import { useApplicationStore } from '../../hooks/useApplicationStore';
import { useGridLayoutDirection } from '../../hooks/useGridLayoutDirection';
import { getDocumentByFQN } from '../../rest/DocStoreAPI';
import {
  getLayoutFromCustomizedPage,
  getWidgetsFromKey,
} from '../../utils/CustomizePage/CustomizePageUtils';
import dataMarketplaceClassBase from '../../utils/DataMarketplace/DataMarketplaceClassBase';
import { WidgetConfig } from '../CustomizablePage/CustomizablePage.interface';
import './data-marketplace-page.less';

const ReactGridLayout = WidthProvider(RGL) as React.ComponentType<
  ReactGridLayoutProps & { children?: React.ReactNode }
>;

const DataMarketplacePage = () => {
  const { selectedPersona } = useApplicationStore();

  const defaultLayout = dataMarketplaceClassBase.getDefaultLayout(
    EntityTabs.OVERVIEW
  );

  const [isLoading, setIsLoading] = useState(true);
  const [layout, setLayout] = useState<Array<WidgetConfig>>(() => [
    ...defaultLayout,
  ]);

  useGridLayoutDirection(false);

  const fetchDocument = useCallback(async () => {
    try {
      setIsLoading(true);
      if (selectedPersona) {
        const pageFQN = `${EntityType.PERSONA}.${selectedPersona.fullyQualifiedName}`;
        const docData = await getDocumentByFQN(pageFQN);

        const pageData = docData.data?.pages?.find(
          (p: Page) => p.pageType === PageType.DataMarketplace
        );

        const tabLayout = getLayoutFromCustomizedPage(
          PageType.DataMarketplace,
          EntityTabs.OVERVIEW,
          pageData
        ) as WidgetConfig[];

        const normalizeLayout = (l: WidgetConfig[]) =>
          l
            .map((widget) => ({
              ...widget,
              w: TAB_GRID_MAX_COLUMNS,
              x: 0,
            }))
            .sort((a, b) => a.y - b.y);

        if (!isEmpty(tabLayout)) {
          setLayout(normalizeLayout(tabLayout));
        } else if (!isEmpty(pageData?.layout)) {
          setLayout(normalizeLayout(pageData?.layout as WidgetConfig[]));
        } else {
          setLayout(defaultLayout);
        }
      } else {
        setLayout(defaultLayout);
      }
    } catch (error) {
      setLayout(defaultLayout);
    } finally {
      setIsLoading(false);
    }
  }, [selectedPersona]);

  useEffect(() => {
    fetchDocument();
  }, [fetchDocument]);

  const widgets = useMemo(
    () =>
      layout.map((widget) => (
        <div data-grid={widget} key={widget.i}>
          {getWidgetsFromKey(PageType.DataMarketplace, widget)}
        </div>
      )),
    [layout]
  );

  if (isLoading) {
    return <Loader />;
  }

  return (
    <>
      <div
        className="marketplace-header-bg"
        style={
          { '--marketplace-bg': `url(${marketplaceBg})` } as React.CSSProperties
        }>
        <div className="marketplace-grid-wrapper" dir="ltr">
          <div className="p-x-box">
            <MarketplaceGreetingBanner />
            <MarketplaceSearchBar />
          </div>
        </div>
      </div>
      <div className="marketplace-grid-wrapper" dir="ltr">
        <div className="p-x-box">
          <AnnouncementsWidgetV2 widgetKey="announcements" />
        </div>
        <ReactGridLayout
          className="grid-container p-x-box"
          cols={TAB_GRID_MAX_COLUMNS}
          containerPadding={[0, 0]}
          isDraggable={false}
          isResizable={false}
          margin={[16, 30]}
          rowHeight={156}
          style={{ marginTop: 8 }}>
          {widgets}
        </ReactGridLayout>
      </div>
    </>
  );
};

export default DataMarketplacePage;
