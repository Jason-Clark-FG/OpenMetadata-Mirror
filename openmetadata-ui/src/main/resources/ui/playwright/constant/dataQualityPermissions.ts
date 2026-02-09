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
import { uuid } from '../utils/common';

export const CREATE_TEST_CASE_POLICY = [
  {
    name: `create-test-case-policy-${uuid()}`,
    resources: ['testCase'],
    operations: ['Create', 'ViewAll', 'ViewBasic'],
    effect: 'allow',
  },
  {
    name: `view-table-policy-${uuid()}`,
    resources: ['table'],
    operations: [
      'ViewAll',
      'ViewBasic',
      'ViewTests',
      'CreateTests',
      'EditTests',
    ],
    effect: 'allow',
  },
  {
    name: `view-all-policy-${uuid()}`,
    resources: ['all'],
    operations: ['ViewBasic'],
    effect: 'allow',
  },
];

export const VIEW_INCIDENTS_POLICY = [
  {
    name: `view-incidents-tc-${uuid()}`,
    resources: ['testCase'],
    operations: ['ViewAll', 'ViewBasic'],
    effect: 'allow',
  },
  {
    name: `view-incidents-table-${uuid()}`,
    resources: ['table'],
    operations: ['ViewAll', 'ViewTests', 'ViewBasic'],
    effect: 'allow',
  },
  {
    name: `view-incidents-all-${uuid()}`,
    resources: ['all'],
    operations: ['ViewBasic'],
    effect: 'allow',
  },
];

export const EDIT_INCIDENTS_POLICY = [
  {
    name: `edit-incidents-tc-${uuid()}`,
    resources: ['testCase'],
    operations: ['EditTests', 'EditAll', 'ViewAll', 'ViewBasic'],
    effect: 'allow',
  },
  {
    name: `edit-incidents-table-${uuid()}`,
    resources: ['table'],
    operations: ['EditTests', 'EditAll', 'ViewAll', 'ViewTests', 'ViewBasic'],
    effect: 'allow',
  },
  {
    name: `edit-incidents-all-${uuid()}`,
    resources: ['all'],
    operations: ['ViewBasic'],
    effect: 'allow',
  },
];

export const TABLE_EDIT_INCIDENTS_POLICY = [
  {
    name: `table-edit-incidents-${uuid()}`,
    resources: ['table'],
    operations: ['EditTests', 'ViewAll', 'ViewTests', 'ViewBasic'],
    effect: 'allow',
  },
  {
    name: `table-edit-incidents-all-${uuid()}`,
    resources: ['all'],
    operations: ['ViewBasic'],
    effect: 'allow',
  },
];

export const CONSUMER_LIKE_POLICY = [
  {
    name: `consumer-like-tc-${uuid()}`,
    resources: ['testCase'],
    operations: ['ViewAll', 'ViewBasic'],
    effect: 'allow',
  },
  {
    name: `consumer-like-table-${uuid()}`,
    resources: ['table'],
    operations: ['ViewAll', 'ViewTests', 'ViewBasic'],
    effect: 'allow',
  },
  {
    name: `consumer-like-all-${uuid()}`,
    resources: ['all'],
    operations: ['ViewBasic'],
    effect: 'allow',
  },
];

export const DELETE_TEST_CASE_POLICY = [
  {
    name: `delete-test-case-policy-${uuid()}`,
    resources: ['testCase'],
    operations: ['Delete', 'ViewAll', 'ViewBasic'],
    effect: 'allow',
  },
  {
    name: `view-table-policy-${uuid()}`,
    resources: ['table'],
    operations: ['ViewAll', 'ViewBasic', 'ViewTests'],
    effect: 'allow',
  },
];

export const FAILED_ROWS_POLICY = [
  {
    name: `failed-rows-policy-${uuid()}`,
    resources: ['testCase'],
    operations: [
      'ViewTestCaseFailedRowsSample',
      'DeleteTestCaseFailedRowsSample',
    ],
    effect: 'allow',
  },
  {
    name: `view-basic-policy-${uuid()}`,
    resources: ['all'],
    operations: ['ViewAll'],
    effect: 'allow',
  },
];

export const TEST_SUITE_POLICY = [
  {
    name: `test-suite-policy-${uuid()}`,
    resources: ['testSuite'],
    operations: ['Create', 'Delete', 'EditAll', 'ViewAll'],
    effect: 'allow',
  },
  {
    name: `test-suite-view-basic-${uuid()}`,
    resources: ['all'],
    operations: ['ViewBasic'],
    effect: 'allow',
  },
];

export const TEST_CASE_VIEW_BASIC_POLICY = [
  {
    name: `test-case-view-basic-${uuid()}`,
    resources: ['testCase'],
    operations: ['ViewBasic'],
    effect: 'allow',
  },
  {
    name: `table-view-test-${uuid()}`,
    resources: ['table'],
    operations: ['ViewTests', 'ViewBasic'],
    effect: 'allow',
  },
  {
    name: `all-view-basic-${uuid()}`,
    resources: ['all'],
    operations: ['ViewAll'],
    effect: 'allow',
  },
];

export const TABLE_CREATE_TESTS_POLICY = [
  {
    name: `table-create-tests-policy-${uuid()}`,
    resources: ['table'],
    operations: [
      'CreateTests',
      'EditTests',
      'ViewAll',
      'ViewBasic',
      'ViewTests',
    ],
    effect: 'allow',
  },
  {
    name: `view-all-basic-${uuid()}`,
    resources: ['all'],
    operations: ['ViewBasic'],
    effect: 'allow',
  },
];

export const DELETE_FAILED_ROWS_POLICY = [
  {
    name: `delete-failed-rows-policy-${uuid()}`,
    resources: ['testCase'],
    operations: ['DeleteTestCaseFailedRowsSample', 'ViewAll', 'ViewBasic'],
    effect: 'allow',
  },
  {
    name: `view-all-basic-del-rows-${uuid()}`,
    resources: ['all'],
    operations: ['ViewBasic'],
    effect: 'allow',
  },
];

export const EDIT_TEST_CASE_POLICY = [
  {
    name: `edit-test-case-policy-${uuid()}`,
    resources: ['testCase'],
    operations: ['EditAll', 'ViewAll', 'ViewBasic'],
    effect: 'allow',
  },
  {
    name: `edit-view-table-policy-${uuid()}`,
    resources: ['table'],
    operations: ['ViewAll', 'ViewBasic', 'ViewTests', 'EditTests'],
    effect: 'allow',
  },
  {
    name: `edit-view-all-policy-${uuid()}`,
    resources: ['all'],
    operations: ['ViewBasic'],
    effect: 'allow',
  },
];

export const TABLE_EDIT_TESTS_POLICY = [
  {
    name: `table-edit-tests-policy-${uuid()}`,
    resources: ['table'],
    operations: ['EditTests', 'ViewAll', 'ViewBasic', 'ViewTests'],
    effect: 'allow',
  },
  {
    name: `table-edit-view-all-${uuid()}`,
    resources: ['all'],
    operations: ['ViewBasic'],
    effect: 'allow',
  },
];

export const EDIT_TESTS_ON_TEST_CASE_POLICY = [
  {
    name: `edit-tests-tc-policy-${uuid()}`,
    resources: ['testCase'],
    operations: ['EditTests', 'ViewAll', 'ViewBasic'],
    effect: 'allow',
  },
  {
    name: `edit-tests-tc-view-${uuid()}`,
    resources: ['table'],
    operations: ['ViewAll', 'ViewBasic', 'ViewTests'],
    effect: 'allow',
  },
  {
    name: `edit-tests-tc-all-${uuid()}`,
    resources: ['all'],
    operations: ['ViewBasic'],
    effect: 'allow',
  },
];

export const VIEW_ALL_TEST_CASE_POLICY = [
  {
    name: `view-all-tc-policy-${uuid()}`,
    resources: ['testCase'],
    operations: ['ViewAll', 'ViewBasic'],
    effect: 'allow',
  },
  {
    name: `view-all-tc-table-${uuid()}`,
    resources: ['table'],
    operations: ['ViewTests', 'ViewBasic'],
    effect: 'allow',
  },
  {
    name: `view-all-tc-all-${uuid()}`,
    resources: ['all'],
    operations: ['ViewBasic'],
    effect: 'allow',
  },
];

export const TEST_SUITE_EDIT_ONLY_POLICY = [
  {
    name: `suite-edit-only-policy-${uuid()}`,
    resources: ['testSuite'],
    operations: ['EditAll', 'ViewAll', 'ViewBasic'],
    effect: 'allow',
  },
  {
    name: `suite-edit-view-all-${uuid()}`,
    resources: ['all'],
    operations: ['ViewBasic'],
    effect: 'allow',
  },
];
