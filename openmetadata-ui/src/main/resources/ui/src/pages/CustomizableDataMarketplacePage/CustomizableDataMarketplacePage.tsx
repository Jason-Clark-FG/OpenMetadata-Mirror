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

import { HolderOutlined } from '@ant-design/icons';
import { compare } from 'fast-json-patch';
import { isEmpty } from 'lodash';
import { useCallback, useMemo, useState } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { useTranslation } from 'react-i18next';
import MarketplaceGreetingBanner from '../../components/DataMarketplace/MarketplaceGreetingBanner/MarketplaceGreetingBanner.component';
import MarketplaceSearchBar from '../../components/DataMarketplace/MarketplaceSearchBar/MarketplaceSearchBar.component';
import { CustomizablePageHeader } from '../../components/MyData/CustomizableComponents/CustomizablePageHeader/CustomizablePageHeader';
import { CustomizeMyDataProps } from '../../components/MyData/CustomizableComponents/CustomizeMyData/CustomizeMyData.interface';
import PageLayoutV1 from '../../components/PageLayoutV1/PageLayoutV1';
import { EntityTabs } from '../../enums/entity.enum';
import { Page, PageType } from '../../generated/system/ui/page';
import dataMarketplaceClassBase from '../../utils/DataMarketplace/DataMarketplaceClassBase';
import { getDataMarketplaceWidgetsFromKey } from '../../utils/DataMarketplace/DataMarketplaceUtils';
import { getEntityName } from '../../utils/EntityUtils';
import { WidgetConfig } from '../CustomizablePage/CustomizablePage.interface';
import { useCustomizeStore } from '../CustomizablePage/CustomizeStore';
import '../DataMarketplacePage/data-marketplace-page.less';
import './customizable-data-marketplace-page.less';

const DRAG_TYPE = 'MARKETPLACE_WIDGET';

const DraggableWidgetCard = ({
  widget,
  index,
  moveWidget,
}: {
  widget: WidgetConfig;
  index: number;
  moveWidget: (from: number, to: number) => void;
}) => {
  const [{ isDragging }, drag, dragPreview] = useDrag({
    type: DRAG_TYPE,
    item: { index },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [, drop] = useDrop({
    accept: DRAG_TYPE,
    hover: (draggedItem: { index: number }) => {
      if (draggedItem.index !== index) {
        moveWidget(draggedItem.index, index);
        draggedItem.index = index;
      }
    },
  });

  const dragHandle = (
    <div className="marketplace-drag-handle" ref={drag}>
      <HolderOutlined />
    </div>
  );

  return (
    <div
      ref={(node) => dragPreview(drop(node))}
      style={{ opacity: isDragging ? 0.5 : 1 }}>
      {getDataMarketplaceWidgetsFromKey(widget, true, dragHandle)}
    </div>
  );
};

const CustomizableDataMarketplacePage = ({
  personaDetails,
  onSaveLayout,
}: CustomizeMyDataProps) => {
  const { t } = useTranslation();
  const { currentPage, currentPageType, getPage, updateCurrentPage } =
    useCustomizeStore();

  const defaultLayout = dataMarketplaceClassBase.getDefaultLayout(
    EntityTabs.OVERVIEW
  );

  const [layout, setLayout] = useState<WidgetConfig[]>(() => {
    const savedLayout = currentPage?.tabs?.[0]?.layout as WidgetConfig[];

    return isEmpty(savedLayout) ? defaultLayout : savedLayout;
  });

  const handleReset = useCallback(async () => {
    await onSaveLayout();
  }, [onSaveLayout]);

  const handleSave = async () => {
    await onSaveLayout(currentPage ?? ({ pageType: currentPageType } as Page));
  };

  const disableSave = useMemo(() => {
    if (!currentPageType) {
      return true;
    }

    const originalPage =
      getPage(currentPageType as string) ??
      ({
        pageType: currentPageType,
      } as Page);
    const editedPage =
      currentPage ??
      ({
        pageType: currentPageType,
      } as Page);

    const jsonPatch = compare(originalPage, editedPage);

    return jsonPatch.length === 0;
  }, [currentPage, currentPageType, getPage]);

  const moveWidget = useCallback(
    (fromIndex: number, toIndex: number) => {
      const newLayout = [...layout];
      const [moved] = newLayout.splice(fromIndex, 1);
      newLayout.splice(toIndex, 0, moved);

      let cumulativeY = 0;
      newLayout.forEach((widget) => {
        widget.y = cumulativeY;
        cumulativeY += widget.h;
      });

      setLayout(newLayout);

      const tabs = currentPage?.tabs ?? [
        {
          ...dataMarketplaceClassBase.getDataMarketplaceDetailPageTabsIds()[0],
        },
      ];

      const updatedPage = {
        ...currentPage,
        pageType: currentPageType as PageType,
        tabs: tabs.map((tab, i) =>
          i === 0 ? { ...tab, layout: newLayout } : tab
        ),
      } as Page;

      updateCurrentPage(updatedPage);
    },
    [layout, currentPage, currentPageType, updateCurrentPage]
  );

  return (
    <PageLayoutV1
      className="bg-grey"
      pageTitle={t('label.customize-entity', {
        entity: t('label.data-marketplace'),
      })}>
      <div className="customize-details-page">
        <CustomizablePageHeader
          disableSave={disableSave}
          personaName={getEntityName(personaDetails)}
          onReset={handleReset}
          onSave={handleSave}
        />
        <div className="marketplace-grid-wrapper" dir="ltr">
          <div className="p-x-box">
            <MarketplaceGreetingBanner />
            <MarketplaceSearchBar isEditView />
          </div>
          <div className="marketplace-customize-widgets p-x-box">
            {layout.map((widget, index) => (
              <DraggableWidgetCard
                index={index}
                key={widget.i}
                moveWidget={moveWidget}
                widget={widget}
              />
            ))}
          </div>
        </div>
      </div>
    </PageLayoutV1>
  );
};

export default CustomizableDataMarketplacePage;
