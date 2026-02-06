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

import { Column } from '../../generated/entity/data/table';

export interface EntityChildrenItem {
  fullyQualifiedName?: string;
  children?: EntityChildrenItem[];
  [key: string]: unknown;
}

export type EntityChildren = (Column | EntityChildrenItem)[];

/**
 * Cache for storing flattened column FQNs to avoid repeated traversal
 * Uses WeakMap for automatic garbage collection when items are removed
 */
const flattenCache = new WeakMap<EntityChildrenItem, string[]>();

/**
 * Recursively flattens nested column structure to array of FQNs
 * Uses WeakMap cache to prevent repeated traversal of same items
 *
 * @param item - Column or entity children item to flatten
 * @returns Array of fully qualified names
 */
export const flattenNestedColumns = (item: EntityChildrenItem): string[] => {
  // Check WeakMap cache first
  if (flattenCache.has(item)) {
    return flattenCache.get(item)!;
  }

  const result: string[] = [];

  if (item.fullyQualifiedName) {
    result.push(item.fullyQualifiedName);
  }

  if (
    'children' in item &&
    Array.isArray(item.children) &&
    item.children.length > 0
  ) {
    for (const child of item.children) {
      result.push(...flattenNestedColumns(child));
    }
  }

  // Store in WeakMap for future use
  flattenCache.set(item, result);

  return result;
};

/**
 * Gets current page items from a list of columns
 *
 * @param columns - All columns to paginate
 * @param page - Current page number (1-indexed)
 * @param itemsPerPage - Number of items per page
 * @returns Slice of columns for current page
 */
export const getCurrentPageItems = <T>(
  columns: T[],
  page: number,
  itemsPerPage: number
): T[] => {
  const startIdx = (page - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;

  return columns.slice(startIdx, endIdx);
};

/**
 * Calculates total number of pages needed
 *
 * @param totalItems - Total number of items
 * @param itemsPerPage - Items per page
 * @returns Total page count
 */
export const calculateTotalPages = (
  totalItems: number,
  itemsPerPage: number
): number => {
  return Math.ceil(totalItems / itemsPerPage);
};

/**
 * Flattens array of entity children items to FQN array for current page only
 * More efficient than flattening all items then slicing
 *
 * @param items - Entity children items
 * @param page - Current page (1-indexed)
 * @param itemsPerPage - Items per page
 * @returns Flattened FQNs for current page only
 */
export const getFlattenedPageItems = (
  items: EntityChildren,
  page: number,
  itemsPerPage: number
): string[] => {
  const pageItems = getCurrentPageItems(items, page, itemsPerPage);

  return pageItems.flatMap((item) => flattenNestedColumns(item));
};

/**
 * Checks if two arrays of strings are equal (order matters)
 * More efficient than deep equality check
 *
 * @param arr1 - First array
 * @param arr2 - Second array
 * @returns True if arrays contain same values in same order
 */
export const areStringArraysEqual = (
  arr1: string[] | undefined,
  arr2: string[]
): boolean => {
  if (!arr1 || arr1.length !== arr2.length) {
    return false;
  }

  return arr1.every((v, i) => v === arr2[i]);
};

/**
 * Clears the flatten cache
 * Call this when column structure changes significantly
 */
export const clearFlattenCache = (): void => {
  // WeakMap doesn't have clear method, but cache will be GC'd when items are removed
  // This is just a placeholder for explicit cache management if needed
};
