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

import {
  Cube01,
  Globe01,
  Home02,
  Settings01,
  ShoppingBag01,
} from '@untitledui/icons';
import { isEmpty } from 'lodash';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import RGL, { ReactGridLayoutProps, WidthProvider } from 'react-grid-layout';
import { useTranslation } from 'react-i18next';
import marketplaceBg from '../../assets/img/widgets/marketplace-bg.png';
import Loader from '../../components/common/Loader/Loader';
import MarketplaceGreetingBanner from '../../components/DataMarketplace/MarketplaceGreetingBanner/MarketplaceGreetingBanner.component';
import MarketplaceSearchBar from '../../components/DataMarketplace/MarketplaceSearchBar/MarketplaceSearchBar.component';
import PageLayoutV2 from '../../components/PageLayoutV2/PageLayoutV2';
import { ROUTES } from '../../constants/constants';
import { TAB_GRID_MAX_COLUMNS } from '../../constants/CustomizeWidgets.constants';
import { EntityTabs, EntityType } from '../../enums/entity.enum';
import { Page, PageType } from '../../generated/system/ui/page';
import { useApplicationStore } from '../../hooks/useApplicationStore';
import { useGridLayoutDirection } from '../../hooks/useGridLayoutDirection';
import { useSidebarStore } from '../../hooks/useSidebarStore';
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
  const { t } = useTranslation();
  const { selectedPersona } = useApplicationStore();
  const { setCustomItems, clearCustomItems } = useSidebarStore();

  const sidebarItems = useMemo(
    () => [
      { label: t('label.home'), href: ROUTES.MY_DATA, icon: Home02 },
      {
        label: t('label.data-marketplace'),
        href: ROUTES.DATA_MARKETPLACE,
        icon: ShoppingBag01,
      },
      {
        label: t('label.data-product-plural'),
        href: ROUTES.DATA_PRODUCT,
        icon: Cube01,
      },
      { label: t('label.domain-plural'), href: ROUTES.DOMAIN, icon: Globe01 },
    ],
    [t]
  );

  const sidebarBottomItems = useMemo(
    () => [
      {
        label: t('label.setting-plural'),
        href: ROUTES.SETTINGS,
        icon: Settings01,
      },
    ],
    [t]
  );

  useLayoutEffect(() => {
    setCustomItems(sidebarItems, sidebarBottomItems);

    return () => clearCustomItems();
  }, [sidebarItems, sidebarBottomItems]);

  const defaultLayout = dataMarketplaceClassBase.getDefaultLayout(
    EntityTabs.OVERVIEW
  );

  const [isLoading, setIsLoading] = useState(true);
  const [layout, setLayout] = useState<Array<WidgetConfig>>(defaultLayout);

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

        // Try tab-based layout first (new format)
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
    <PageLayoutV2 pageTitle={t('label.data-marketplace')}>
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
        <ReactGridLayout
          className="grid-container p-x-box"
          cols={TAB_GRID_MAX_COLUMNS}
          containerPadding={[0, 0]}
          isDraggable={false}
          isResizable={false}
          margin={[16, 24]}
          rowHeight={156}
          style={{ marginTop: 8 }}>
          {widgets}
        </ReactGridLayout>
      </div>
    </PageLayoutV2>
  );
};

export default DataMarketplacePage;
