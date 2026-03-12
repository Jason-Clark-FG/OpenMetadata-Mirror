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

import { Button } from '@openmetadata/ui-core-components';
import { Typography } from 'antd';
import { useForm } from 'antd/lib/form/Form';
import { isEmpty, noop } from 'lodash';
import { useSnackbar } from 'notistack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  INITIAL_PAGING_VALUE,
  ROUTES,
} from '../../../constants/constants';
import { DRAWER_HEADER_STYLING } from '../../../constants/DomainsListPage.constants';
import { usePermissionProvider } from '../../../context/PermissionProvider/PermissionProvider';
import { EntityType } from '../../../enums/entity.enum';
import { SearchIndex } from '../../../enums/search.enum';
import { CreateDataProduct } from '../../../generated/api/domains/createDataProduct';
import { CreateDomain } from '../../../generated/api/domains/createDomain';
import { DataProduct } from '../../../generated/entity/domains/dataProduct';
import { WidgetCommonProps } from '../../../pages/CustomizablePage/CustomizablePage.interface';
import { addDataProducts, patchDataProduct } from '../../../rest/dataProductAPI';
import { searchData } from '../../../rest/miscAPI';
import { getTextFromHtmlString } from '../../../utils/BlockEditorUtils';
import { createEntityWithCoverImage } from '../../../utils/CoverImageUploadUtils';
import dataMarketplaceClassBase from '../../../utils/DataMarketplace/DataMarketplaceClassBase';
import { getDataProductIconByUrl } from '../../../utils/DataProductUtils';
import { getEntityDetailsPath } from '../../../utils/RouterUtils';
import { useFormDrawerWithRef } from '../../common/atoms/drawer';
import Loader from '../../common/Loader/Loader';
import AddDomainForm from '../../Domain/AddDomainForm/AddDomainForm.component';
import { DomainFormType } from '../../Domain/DomainPage.interface';
import MarketplaceItemCard from '../MarketplaceItemCard/MarketplaceItemCard.component';
import './marketplace-data-products-widget.less';

const DISPLAY_COUNT = 3;

const MarketplaceDataProductsWidget = ({ isEditView }: WidgetCommonProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { permissions } = usePermissionProvider();
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const [form] = useForm();
  const [dataProducts, setDataProducts] = useState<DataProduct[]>(
    isEditView ? dataMarketplaceClassBase.getDummyDataProducts() : []
  );
  const [loading, setLoading] = useState(!isEditView);
  const [isFormLoading, setIsFormLoading] = useState(false);

  const fetchDataProducts = useCallback(async () => {
    if (isEditView) {
      return;
    }
    setLoading(true);
    try {
      const res = await searchData(
        '',
        INITIAL_PAGING_VALUE,
        DISPLAY_COUNT,
        '',
        'updatedAt',
        'desc',
        SearchIndex.DATA_PRODUCT
      );
      const products = res?.data?.hits?.hits.map(
        (hit) => hit._source
      ) as DataProduct[];
      setDataProducts(products ?? []);
    } catch {
      setDataProducts([]);
    } finally {
      setLoading(false);
    }
  }, [isEditView]);

  useEffect(() => {
    fetchDataProducts();
  }, [fetchDataProducts]);

  const { formDrawer, openDrawer, closeDrawer } = useFormDrawerWithRef({
    title: t('label.add-entity', { entity: t('label.data-product') }),
    anchor: 'right',
    width: 670,
    closeOnEscape: false,
    header: {
      sx: DRAWER_HEADER_STYLING,
    },
    onCancel: () => {
      form.resetFields();
    },
    form: (
      <AddDomainForm
        isFormInDialog
        formRef={form}
        loading={isFormLoading}
        type={DomainFormType.DATA_PRODUCT}
        onCancel={() => {
          // No-op: handled by useFormDrawerWithRef
        }}
        onSubmit={async (formData: CreateDomain | CreateDataProduct) => {
          setIsFormLoading(true);
          try {
            await createEntityWithCoverImage({
              formData: formData as CreateDataProduct,
              entityType: EntityType.DATA_PRODUCT,
              entityLabel: t('label.data-product'),
              entityPluralLabel: 'data-products',
              createEntity: addDataProducts,
              patchEntity: patchDataProduct,
              onSuccess: () => {
                closeDrawer();
                fetchDataProducts();
              },
              enqueueSnackbar,
              closeSnackbar,
              t,
            });
          } finally {
            setIsFormLoading(false);
          }
        }}
      />
    ),
    formRef: form,
    onSubmit: () => {
      form.submit();
    },
  });

  const handleClick = useCallback(
    (dp: DataProduct) => {
      if (isEditView) {
        return;
      }
      navigate(
        getEntityDetailsPath(EntityType.DATA_PRODUCT, dp.fullyQualifiedName ?? '')
      );
    },
    [navigate, isEditView]
  );

  const cardList = useMemo(
    () => (
      <div className="marketplace-widget-cards">
        {dataProducts.map((dp) => (
          <MarketplaceItemCard
            backgroundColor={dp.style?.color}
            dataTestId={`marketplace-dp-card-${dp.id}`}
            icon={getDataProductIconByUrl(dp.style?.iconURL)}
            key={dp.id}
            name={dp.displayName || dp.name}
            subtitle={getTextFromHtmlString(dp.description)}
            onClick={isEditView ? noop : () => handleClick(dp)}
          />
        ))}
      </div>
    ),
    [dataProducts, handleClick, isEditView]
  );

  if (loading) {
    return (
      <div className="marketplace-widget-section" data-testid="marketplace-dp-widget">
        <Loader size="small" />
      </div>
    );
  }

  return (
    <div
      className="marketplace-widget-section"
      data-testid="marketplace-dp-widget">
      <div className="marketplace-widget-header">
        <div>
          <Typography.Title
            className="marketplace-widget-title"
            level={5}>
            {t('label.new')} {t('label.data-product-plural')}
          </Typography.Title>
          <Typography.Text className="text-grey-muted text-xs">
            {t('label.recently-created-entity', {
              entity: t('label.data-product-plural'),
            })}
          </Typography.Text>
        </div>
        {!isEditView && (
          <div className="marketplace-widget-actions">
            {permissions.dataProduct?.Create && (
              <Button
                color="secondary"
                data-testid="add-data-product-btn"
                onPress={openDrawer}>
                + {t('label.add-entity', { entity: t('label.data-product') })}
              </Button>
            )}
            <Link
              className="view-all-link"
              data-testid="view-all-data-products"
              to={ROUTES.DATA_PRODUCT}>
              {t('label.view-all')} &rarr;
            </Link>
          </div>
        )}
      </div>
      {isEmpty(dataProducts) ? (
        <Typography.Text className="text-grey-muted">
          {t('label.no-entity', {
            entity: t('label.data-product-plural'),
          })}
        </Typography.Text>
      ) : (
        cardList
      )}
      {!isEditView && formDrawer}
    </div>
  );
};

export default MarketplaceDataProductsWidget;
