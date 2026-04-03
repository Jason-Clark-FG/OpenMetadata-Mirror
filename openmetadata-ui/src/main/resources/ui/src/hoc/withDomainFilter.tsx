import { InternalAxiosRequestConfig } from 'axios';
import { DEFAULT_DOMAIN_VALUE } from '../constants/constants';
import { SearchIndex } from '../enums/search.enum';
import { useDomainStore } from '../hooks/useDomainStore';
import {
  QueryFieldInterface,
  QueryFilterInterface,
} from '../pages/ExplorePage/ExplorePage.interface';
import { getBasePath } from '../utils/HistoryUtils';

export const getPathNameFromWindowLocation = () => {
  return window.location.pathname.replace(getBasePath() ?? '', '');
};

export const withDomainFilter = (
  config: InternalAxiosRequestConfig
): InternalAxiosRequestConfig => {
  const isGetRequest = config.method === 'get';
  const activeDomain = useDomainStore.getState().activeDomain;
  const hasActiveDomain = activeDomain !== DEFAULT_DOMAIN_VALUE;
  const currentPath = getPathNameFromWindowLocation();
  const shouldNotIntercept = [
    '/domain',
    '/auth/logout',
    '/auth/refresh',
  ].reduce((prev, curr) => {
    return prev || currentPath.startsWith(curr);
  }, false);

  if (shouldNotIntercept) {
    return config;
  }

  if (isGetRequest && hasActiveDomain) {
    if (config.url?.includes('/search/query')) {
      if (config.params?.index === SearchIndex.TAG) {
        return config;
      }

      const domainFilterField =
        config.params?.index === SearchIndex.DOMAIN
          ? 'fullyQualifiedName'
          : 'domains.fullyQualifiedName';
      let filter: QueryFilterInterface = { query: { bool: {} } };
      if (config.params?.query_filter) {
        try {
          const parsed = JSON.parse(config.params.query_filter as string);
          filter = parsed?.query ? parsed : { query: { bool: {} } };
        } catch {
          filter = { query: { bool: {} } };
        }
      }

      let mustArray: QueryFieldInterface[] = [];
      const existingMust = filter.query?.bool?.must;
      if (Array.isArray(existingMust)) {
        mustArray = [...existingMust];
      } else if (existingMust) {
        mustArray = [existingMust];
      }

      const { bool: existingBool, ...nonBoolClauses } = filter.query ?? {};
      for (const [key, value] of Object.entries(nonBoolClauses)) {
        mustArray.push({ [key]: value } as QueryFieldInterface);
      }

      filter.query = {
        bool: {
          ...existingBool,
          must: [
            ...mustArray,
            {
              bool: {
                should: [
                  {
                    term: {
                      [domainFilterField]: activeDomain,
                    },
                  },
                  {
                    prefix: {
                      [domainFilterField]: `${activeDomain}.`,
                    },
                  },
                ],
              },
            } as QueryFieldInterface,
          ],
        },
      };

      config.params = {
        ...config.params,
        query_filter: JSON.stringify(filter),
      };
    } else {
      config.params = {
        ...config.params,
        domain: activeDomain,
      };
    }
  }

  return config;
};
