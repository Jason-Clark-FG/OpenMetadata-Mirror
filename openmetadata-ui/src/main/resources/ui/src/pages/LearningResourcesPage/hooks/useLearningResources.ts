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
import {
  getLearningResourcesList,
  LearningResource,
} from '../../../rest/learningResourceAPI';
import { showErrorToast } from '../../../utils/ToastUtils';
import type { LearningResourceFilterState } from './useLearningResourceFilters';

interface UseLearningResourcesParams {
  searchText: string;
  filterState: LearningResourceFilterState;
}

interface UseLearningResourcesReturn {
  resources: LearningResource[];
  isLoading: boolean;
  refetch: () => Promise<void>;
}

const isAbortError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'CanceledError' || error.name === 'AbortError');

export const useLearningResources = ({
  searchText,
  filterState,
}: UseLearningResourcesParams): UseLearningResourcesReturn => {
  const { t } = useTranslation();
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchResources = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    try {
      const apiParams: Parameters<typeof getLearningResourcesList>[0] = {
        limit: 1000,
        fields: 'categories,contexts,difficulty,estimatedDuration,owners',
        q: searchText || undefined,
        category: filterState.category?.length
          ? filterState.category
          : undefined,
        pageId: filterState.context?.length ? filterState.context : undefined,
        type: filterState.type?.length ? filterState.type : undefined,
        status: filterState.status?.length ? filterState.status : undefined,
      };

      const response = await getLearningResourcesList(apiParams, {
        signal: controller.signal,
      });

      setResources(response.data ?? []);
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
  }, [t, searchText, filterState]);

  useEffect(() => {
    fetchResources();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchResources]);

  return {
    resources,
    isLoading,
    refetch: fetchResources,
  };
};
