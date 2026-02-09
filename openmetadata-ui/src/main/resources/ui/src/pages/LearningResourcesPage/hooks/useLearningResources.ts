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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getLearningResourcesList,
  LearningResource,
} from '../../../rest/learningResourceAPI';
import { showErrorToast } from '../../../utils/ToastUtils';
import type { LearningResourceFilterState } from './useLearningResourceFilters';

const matchesSearch = (
  resource: LearningResource,
  searchText: string,
): boolean => {
  if (!searchText) {
    return true;
  }
  const q = searchText.toLowerCase();
  const nameMatch = resource.name?.toLowerCase().includes(q) ?? false;
  const displayNameMatch = resource.displayName?.toLowerCase().includes(q) ?? false;
  const descriptionMatch = resource.description?.toLowerCase().includes(q) ?? false;

  return nameMatch || displayNameMatch || descriptionMatch;
};

const matchesFilters = (
  resource: LearningResource,
  filters: LearningResourceFilterState,
): boolean => {
  const { type, category, context, status } = filters;

  if (type?.length && !type.includes(resource.resourceType)) {
    return false;
  }

  if (category?.length) {
    const resourceCategories = resource.categories || [];
    const hasMatchingCategory = resourceCategories.some((c) =>
      category.includes(c),
    );
    if (!hasMatchingCategory) {
      return false;
    }
  }

  if (context?.length) {
    const resourceContexts = resource.contexts || [];
    const hasMatchingContext = resourceContexts.some((c) =>
      context.includes(c.pageId),
    );
    if (!hasMatchingContext) {
      return false;
    }
  }

  if (status?.length) {
    const resourceStatus = resource.status || 'Active';
    if (!status.includes(resourceStatus)) {
      return false;
    }
  }

  return true;
};

interface UseLearningResourcesParams {
  searchText: string;
  filterState: LearningResourceFilterState;
}

interface UseLearningResourcesReturn {
  resources: LearningResource[];
  filteredResources: LearningResource[];
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export const useLearningResources = ({
  searchText,
  filterState,
}: UseLearningResourcesParams): UseLearningResourcesReturn => {
  const { t } = useTranslation();
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchResources = useCallback(async () => {
    setIsLoading(true);
    try {
      const apiParams: Parameters<typeof getLearningResourcesList>[0] = {
        limit: 1000,
        fields: 'categories,contexts,difficulty,estimatedDuration,owners',
      };

      const response = await getLearningResourcesList(apiParams);
      setResources(response.data ?? []);
    } catch (error) {
      showErrorToast(
        error as AxiosError,
        t('server.learning-resources-fetch-error'),
      );
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const filteredResources = useMemo(
    () =>
      resources.filter(
        (r) => matchesSearch(r, searchText) && matchesFilters(r, filterState),
      ),
    [resources, searchText, filterState],
  );

  return {
    resources,
    filteredResources,
    isLoading,
    refetch: fetchResources,
  };
};
