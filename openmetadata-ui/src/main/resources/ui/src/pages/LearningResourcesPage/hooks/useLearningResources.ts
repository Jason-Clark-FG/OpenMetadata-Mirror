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

import { AxiosError } from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Paging } from '../../../generated/type/paging';
import {
  getLearningResourcesList,
  LearningResource,
} from '../../../rest/learningResourceAPI';
import { showErrorToast } from '../../../utils/ToastUtils';
import type { LearningResourceFilterState } from './useLearningResourceFilters';

const FIELDS = 'categories,contexts,difficulty,estimatedDuration,owners';

const INITIAL_PAGING: Paging = { total: 0 };

const isAbortError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'CanceledError' || error.name === 'AbortError');

interface UseLearningResourcesParams {
  searchText: string;
  filterState: LearningResourceFilterState;
  pageSize: number;
  currentPage: number;
}

interface UseLearningResourcesReturn {
  resources: LearningResource[];
  paging: Paging;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export const useLearningResources = ({
  searchText,
  filterState,
  pageSize,
  currentPage,
}: UseLearningResourcesParams): UseLearningResourcesReturn => {
  const { t } = useTranslation();
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [paging, setPaging] = useState<Paging>(INITIAL_PAGING);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastPagingRef = useRef<Paging | null>(null);
  const prevRequestKeyRef = useRef<string>('');

  const fetchResources = useCallback(async () => {
    const requestKey = JSON.stringify({ searchText, filterState });
    if (prevRequestKeyRef.current !== requestKey) {
      lastPagingRef.current = null;
      prevRequestKeyRef.current = requestKey;
    }

    const cursor =
      currentPage === 1
        ? lastPagingRef.current?.before
          ? { before: lastPagingRef.current.before }
          : {}
        : lastPagingRef.current?.after
        ? { after: lastPagingRef.current.after }
        : {};

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    try {
      const apiParams: Parameters<typeof getLearningResourcesList>[0] = {
        limit: pageSize,
        fields: FIELDS,
        q: searchText || undefined,
        category: filterState.category?.length
          ? filterState.category
          : undefined,
        pageId: filterState.context?.length ? filterState.context : undefined,
        type: filterState.type?.length ? filterState.type : undefined,
        status: filterState.status?.length ? filterState.status : undefined,
        ...cursor,
      };

      const response = await getLearningResourcesList(apiParams, {
        signal: controller.signal,
      });

      if (abortControllerRef.current !== controller) {
        return;
      }

      const list = response?.data ?? [];
      const nextPaging = response?.paging ?? INITIAL_PAGING;
      setResources(list);
      setPaging(nextPaging);
      lastPagingRef.current = nextPaging;
    } catch (error) {
      if (!isAbortError(error)) {
        showErrorToast(
          error as AxiosError,
          t('server.learning-resources-fetch-error')
        );
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
      }
    }
  }, [t, searchText, filterState, pageSize, currentPage]);

  useEffect(() => {
    fetchResources();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchResources]);

  return {
    resources,
    paging,
    isLoading,
    refetch: fetchResources,
  };
};
