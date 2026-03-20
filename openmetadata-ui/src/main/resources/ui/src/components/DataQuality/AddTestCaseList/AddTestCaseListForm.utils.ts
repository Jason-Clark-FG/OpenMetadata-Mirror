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
import { TestCase } from '../../../generated/tests/testCase';
import { getEntityName } from '../../../utils/EntityUtils';
import { AddTestCaseListChangePayload } from './AddTestCaseList.interface';

/**
 * Normalizes the value Ant Design Form may pass as `selectedTest` (string[] or,
 * incorrectly, an AddTestCaseListChangePayload after onChange) into test case names.
 */
export function normalizeSelectedTestProp(selectedTest: unknown): string[] {
  if (selectedTest == null) {
    return [];
  }
  if (Array.isArray(selectedTest)) {
    return selectedTest
      .map((item) =>
        typeof item === 'string' ? item : getEntityName(item as TestCase)
      )
      .filter(Boolean);
  }
  if (
    typeof selectedTest === 'object' &&
    selectedTest !== null &&
    'testCases' in selectedTest
  ) {
    const p = selectedTest as AddTestCaseListChangePayload;

    return (p.testCases ?? []).map((tc) => getEntityName(tc)).filter(Boolean);
  }

  return [];
}
