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

import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { EntityTabs } from '../../enums/entity.enum';
import { getEncodedFqn } from '../../utils/StringsUtils';

interface NavigationContextValue {
  domainBasePath: string;
  dataProductBasePath: string;
  isMarketplace: boolean;
  getDomainPath: (fqn?: string) => string;
  getDomainDetailsPath: (fqn: string, tab?: string, subTab?: string) => string;
  getDataProductDetailsPath: (
    fqn: string,
    tab?: string,
    subTab?: string
  ) => string;
}

const buildDomainPath = (basePath: string, fqn?: string): string => {
  if (fqn) {
    return `${basePath}/${getEncodedFqn(fqn)}`;
  }

  return basePath;
};

const buildEntityDetailsPath = (
  basePath: string,
  fqn: string,
  tab?: string,
  subTab = 'all'
): string => {
  const encodedFqn = getEncodedFqn(fqn);

  if (tab === EntityTabs.ACTIVITY_FEED) {
    return `${basePath}/${encodedFqn}/${tab}/${subTab}`;
  }

  if (tab) {
    return `${basePath}/${encodedFqn}/${tab}`;
  }

  return `${basePath}/${encodedFqn}`;
};

const defaultValue: NavigationContextValue = {
  domainBasePath: '/domain',
  dataProductBasePath: '/dataProduct',
  isMarketplace: false,
  getDomainPath: (fqn?: string) => buildDomainPath('/domain', fqn),
  getDomainDetailsPath: (fqn: string, tab?: string, subTab?: string) =>
    buildEntityDetailsPath('/domain', fqn, tab, subTab),
  getDataProductDetailsPath: (fqn: string, tab?: string, subTab?: string) =>
    buildEntityDetailsPath('/dataProduct', fqn, tab, subTab),
};

const NavigationContext = createContext<NavigationContextValue>(defaultValue);

interface NavigationContextProviderProps {
  domainBasePath: string;
  dataProductBasePath: string;
  isMarketplace?: boolean;
  children: React.ReactNode;
}

export const NavigationContextProvider = ({
  domainBasePath,
  dataProductBasePath,
  isMarketplace = false,
  children,
}: NavigationContextProviderProps) => {
  const getDomainPath = useCallback(
    (fqn?: string) => buildDomainPath(domainBasePath, fqn),
    [domainBasePath]
  );

  const getDomainDetailsPath = useCallback(
    (fqn: string, tab?: string, subTab?: string) =>
      buildEntityDetailsPath(domainBasePath, fqn, tab, subTab),
    [domainBasePath]
  );

  const getDataProductDetailsPath = useCallback(
    (fqn: string, tab?: string, subTab?: string) =>
      buildEntityDetailsPath(dataProductBasePath, fqn, tab, subTab),
    [dataProductBasePath]
  );

  const value = useMemo<NavigationContextValue>(
    () => ({
      domainBasePath,
      dataProductBasePath,
      isMarketplace,
      getDomainPath,
      getDomainDetailsPath,
      getDataProductDetailsPath,
    }),
    [
      domainBasePath,
      dataProductBasePath,
      isMarketplace,
      getDomainPath,
      getDomainDetailsPath,
      getDataProductDetailsPath,
    ]
  );

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigationContext = (): NavigationContextValue =>
  useContext(NavigationContext);
