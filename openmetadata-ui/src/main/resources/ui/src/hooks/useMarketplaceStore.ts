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

import { create } from 'zustand';

const DOMAIN_BASE_PATH = '/domain';
const DATA_PRODUCT_BASE_PATH = '/dataProduct';
const MARKETPLACE_DOMAIN_BASE_PATH = '/data-marketplace/domains';
const MARKETPLACE_DATA_PRODUCT_BASE_PATH = '/data-marketplace/data-products';

interface MarketplaceStore {
  isMarketplace: boolean;
  domainBasePath: string;
  dataProductBasePath: string;
  setMarketplaceContext: (enabled: boolean) => void;
}

export const useMarketplaceStore = create<MarketplaceStore>()((set) => ({
  isMarketplace: false,
  domainBasePath: DOMAIN_BASE_PATH,
  dataProductBasePath: DATA_PRODUCT_BASE_PATH,

  setMarketplaceContext: (enabled: boolean) => {
    set({
      isMarketplace: enabled,
      domainBasePath: enabled ? MARKETPLACE_DOMAIN_BASE_PATH : DOMAIN_BASE_PATH,
      dataProductBasePath: enabled
        ? MARKETPLACE_DATA_PRODUCT_BASE_PATH
        : DATA_PRODUCT_BASE_PATH,
    });
  },
}));
