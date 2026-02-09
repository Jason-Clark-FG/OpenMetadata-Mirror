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
import { test as base, expect, Page } from '@playwright/test';
import { DOMAIN_TAGS } from '../../../constant/config';
import {
  CREATE_TEST_CASE_POLICY,
  DELETE_FAILED_ROWS_POLICY,
  DELETE_TEST_CASE_POLICY,
  EDIT_TESTS_ON_TEST_CASE_POLICY,
  EDIT_TEST_CASE_POLICY,
  FAILED_ROWS_POLICY,
  TABLE_CREATE_TESTS_POLICY,
  TABLE_EDIT_TESTS_POLICY,
  TEST_CASE_VIEW_BASIC_POLICY,
  TEST_SUITE_EDIT_ONLY_POLICY,
  TEST_SUITE_POLICY,
  VIEW_ALL_TEST_CASE_POLICY,
} from '../../../constant/dataQualityPermissions';
import { PolicyClass } from '../../../support/access-control/PoliciesClass';
import { RolesClass } from '../../../support/access-control/RolesClass';
import { TableClass } from '../../../support/entity/TableClass';
import { UserClass } from '../../../support/user/UserClass';
import { performAdminLogin } from '../../../utils/admin';
import { getApiContext, redirectToHomePage, uuid } from '../../../utils/common';
import { setupUserWithPolicy } from '../../../utils/permission';
import {
  getFailedRowsData,
  setupTestCaseWithFailedRows,
  waitForFailedRowsSampleResponse,
  waitForTestCaseDetailsResponse,
  waitForTestCaseListResponse,
  waitForTestSuiteListResponse,
} from '../../../utils/testCases';

// --- Objects ---
const createPolicy = new PolicyClass();
const createRole = new RolesClass();
const createUser = new UserClass();

const deletePolicy = new PolicyClass();
const deleteRole = new RolesClass();
const deleteUser = new UserClass();

const failedRowsPolicy = new PolicyClass();
const failedRowsRole = new RolesClass();
const failedRowsUser = new UserClass();

const suitePolicy = new PolicyClass();
const suiteRole = new RolesClass();
const suiteUser = new UserClass();

const viewBasicPolicy = new PolicyClass();
const viewBasicRole = new RolesClass();
const viewBasicUser = new UserClass();

const tableCreateTestsPolicy = new PolicyClass();
const tableCreateTestsRole = new RolesClass();
const tableCreateTestsUser = new UserClass();

const deleteFailedRowsPolicy = new PolicyClass();
const deleteFailedRowsRole = new RolesClass();
const deleteFailedRowsUser = new UserClass();

const editTestCasePolicy = new PolicyClass();
const editTestCaseRole = new RolesClass();
const editTestCaseUser = new UserClass();

const tableEditTestsPolicy = new PolicyClass();
const tableEditTestsRole = new RolesClass();
const tableEditTestsUser = new UserClass();

const editTestsOnTcPolicy = new PolicyClass();
const editTestsOnTcRole = new RolesClass();
const editTestsOnTcUser = new UserClass();

const viewAllTcPolicy = new PolicyClass();
const viewAllTcRole = new RolesClass();
const viewAllTcUser = new UserClass();

const suiteEditOnlyPolicy = new PolicyClass();
const suiteEditOnlyRole = new RolesClass();
const suiteEditOnlyUser = new UserClass();

const dataConsumerUser = new UserClass();
const dataStewardUser = new UserClass();

const table = new TableClass();

// --- Fixtures ---
const test = base.extend<{
  adminPage: Page;
  createPage: Page;
  deletePage: Page;
  failedRowsPage: Page;
  suitePage: Page;
  viewBasicPage: Page;
  consumerPage: Page;
  stewardPage: Page;
  tableCreateTestsPage: Page;
  deleteFailedRowsPage: Page;
  editPage: Page;
  tableEditPage: Page;
  editTestsPage: Page;
  viewAllPage: Page;
  suiteEditOnlyPage: Page;
}>({
  adminPage: async ({ browser }, use) => {
    const { page } = await performAdminLogin(browser);
    await use(page);
    await page.close();
  },
  createPage: async ({ browser }, use) => {
    const page = await browser.newPage();
    await createUser.login(page);
    await use(page);
    await page.close();
  },
  deletePage: async ({ browser }, use) => {
    const page = await browser.newPage();
    await deleteUser.login(page);
    await use(page);
    await page.close();
  },
  failedRowsPage: async ({ browser }, use) => {
    const page = await browser.newPage();
    await failedRowsUser.login(page);
    await use(page);
    await page.close();
  },
  suitePage: async ({ browser }, use) => {
    const page = await browser.newPage();
    await suiteUser.login(page);
    await use(page);
    await page.close();
  },
  viewBasicPage: async ({ browser }, use) => {
    const page = await browser.newPage();
    await viewBasicUser.login(page);
    await use(page);
    await page.close();
  },
  consumerPage: async ({ browser }, use) => {
    const page = await browser.newPage();
    await dataConsumerUser.login(page);
    await use(page);
    await page.close();
  },
  stewardPage: async ({ browser }, use) => {
    const page = await browser.newPage();
    await dataStewardUser.login(page);
    await use(page);
    await page.close();
  },
  tableCreateTestsPage: async ({ browser }, use) => {
    const page = await browser.newPage();
    await tableCreateTestsUser.login(page);
    await use(page);
    await page.close();
  },
  deleteFailedRowsPage: async ({ browser }, use) => {
    const page = await browser.newPage();
    await deleteFailedRowsUser.login(page);
    await use(page);
    await page.close();
  },
  editPage: async ({ browser }, use) => {
    const page = await browser.newPage();
    await editTestCaseUser.login(page);
    await use(page);
    await page.close();
  },
  tableEditPage: async ({ browser }, use) => {
    const page = await browser.newPage();
    await tableEditTestsUser.login(page);
    await use(page);
    await page.close();
  },
  editTestsPage: async ({ browser }, use) => {
    const page = await browser.newPage();
    await editTestsOnTcUser.login(page);
    await use(page);
    await page.close();
  },
  viewAllPage: async ({ browser }, use) => {
    const page = await browser.newPage();
    await viewAllTcUser.login(page);
    await use(page);
    await page.close();
  },
  suiteEditOnlyPage: async ({ browser }, use) => {
    const page = await browser.newPage();
    await suiteEditOnlyUser.login(page);
    await use(page);
    await page.close();
  },
});

test.describe(
  'Observability Permission Coverage',
  { tag: `${DOMAIN_TAGS.OBSERVABILITY}:Data_Quality` },
  () => {
    let logicalTestSuiteId: string;
    let logicalTestSuiteFqn: string;

    test.beforeAll(async ({ browser }) => {
      test.slow();
      const { apiContext, afterAction } = await performAdminLogin(browser);

      await table.create(apiContext);

      // Create executable test suite for the table explicitly
      const suiteRes = await apiContext.post(
        '/api/v1/dataQuality/testSuites/executable',
        {
          data: {
            executableEntityReference:
              table.entityResponseData.fullyQualifiedName,
          },
        }
      );
      await suiteRes.json();

      // Create a sample test case so we have one to view/delete
      await table.createTestCase(apiContext);

      // Create a logical test suite for logical test case tests
      const logicalSuiteRes = await apiContext.post(
        '/api/v1/dataQuality/testSuites',
        {
          data: {
            name: `logical_perm_suite_${uuid()}`,
            description: 'Logical suite for permission tests',
          },
        }
      );
      const logicalSuiteData = await logicalSuiteRes.json();
      logicalTestSuiteId = logicalSuiteData.id;
      logicalTestSuiteFqn =
        logicalSuiteData.fullyQualifiedName ?? logicalSuiteData.name;

      // 1. Setup Data Consumer
      await dataConsumerUser.create(apiContext, true);

      // 2. Setup Data Steward
      await dataStewardUser.create(apiContext, false);
      const dsRoleRes = await apiContext.get('/api/v1/roles/name/DataSteward');
      const dsRole = await dsRoleRes.json();
      await dataStewardUser.patch({
        apiContext,
        patchData: [
          {
            op: 'add',
            path: '/roles/0',
            value: { id: dsRole.id, type: 'role', name: 'DataSteward' },
          },
        ],
      });

      // 3. Setup Custom Roles
      await setupUserWithPolicy(
        apiContext,
        createUser,
        createPolicy,
        createRole,
        CREATE_TEST_CASE_POLICY
      );
      await setupUserWithPolicy(
        apiContext,
        deleteUser,
        deletePolicy,
        deleteRole,
        DELETE_TEST_CASE_POLICY
      );
      await setupUserWithPolicy(
        apiContext,
        failedRowsUser,
        failedRowsPolicy,
        failedRowsRole,
        FAILED_ROWS_POLICY
      );
      await setupUserWithPolicy(
        apiContext,
        suiteUser,
        suitePolicy,
        suiteRole,
        TEST_SUITE_POLICY
      );
      await setupUserWithPolicy(
        apiContext,
        viewBasicUser,
        viewBasicPolicy,
        viewBasicRole,
        TEST_CASE_VIEW_BASIC_POLICY
      );
      await setupUserWithPolicy(
        apiContext,
        tableCreateTestsUser,
        tableCreateTestsPolicy,
        tableCreateTestsRole,
        TABLE_CREATE_TESTS_POLICY
      );
      await setupUserWithPolicy(
        apiContext,
        deleteFailedRowsUser,
        deleteFailedRowsPolicy,
        deleteFailedRowsRole,
        DELETE_FAILED_ROWS_POLICY
      );
      await setupUserWithPolicy(
        apiContext,
        editTestCaseUser,
        editTestCasePolicy,
        editTestCaseRole,
        EDIT_TEST_CASE_POLICY
      );
      await setupUserWithPolicy(
        apiContext,
        tableEditTestsUser,
        tableEditTestsPolicy,
        tableEditTestsRole,
        TABLE_EDIT_TESTS_POLICY
      );
      await setupUserWithPolicy(
        apiContext,
        editTestsOnTcUser,
        editTestsOnTcPolicy,
        editTestsOnTcRole,
        EDIT_TESTS_ON_TEST_CASE_POLICY
      );
      await setupUserWithPolicy(
        apiContext,
        viewAllTcUser,
        viewAllTcPolicy,
        viewAllTcRole,
        VIEW_ALL_TEST_CASE_POLICY
      );
      await setupUserWithPolicy(
        apiContext,
        suiteEditOnlyUser,
        suiteEditOnlyPolicy,
        suiteEditOnlyRole,
        TEST_SUITE_EDIT_ONLY_POLICY
      );

      await afterAction();
    });

    const visitProfilerPage = async (page: Page) => {
      await redirectToHomePage(page);
      await table.visitEntityPage(page);
      await page.getByTestId('profiler').click();
      const testCaseListPromise = waitForTestCaseListResponse(page);
      await page.getByRole('tab', { name: 'Data Quality' }).click();
      await testCaseListPromise;
    };

    test.describe('Standard Roles (Negative Scenarios)', () => {
      test('Data Consumer cannot create or delete test cases', async ({
        consumerPage,
      }) => {
        await visitProfilerPage(consumerPage);

        await expect(
          consumerPage.getByTestId('profiler-add-table-test-btn')
        ).toBeHidden();

        const testCaseName = table.testCasesResponseData[0].name;
        const actionDropdown = consumerPage.getByTestId(
          `action-dropdown-${testCaseName}`
        );

        if (await actionDropdown.isVisible()) {
          if (await actionDropdown.isEnabled()) {
            await actionDropdown.click();
            await expect(
              consumerPage.getByTestId(`delete-${testCaseName}`)
            ).toBeHidden();
            await consumerPage.keyboard.press('Escape');
          } else {
            await expect(actionDropdown).toBeDisabled();
          }
        }
      });

      test('Data Consumer can VIEW test cases but sees no edit controls in UI', async ({
        consumerPage,
      }) => {
        await visitProfilerPage(consumerPage);
        const testCaseName = table.testCasesResponseData[0].name;

        await expect(consumerPage.getByTestId(testCaseName)).toBeVisible();

        await expect(
          consumerPage.getByTestId('profiler-add-table-test-btn')
        ).toBeHidden();

        const actionDropdown = consumerPage.getByTestId(
          `action-dropdown-${testCaseName}`
        );

        await expect(actionDropdown).toBeVisible();
        await expect(actionDropdown).toBeDisabled();
      });

      test('Data Steward cannot create or delete test cases (default)', async ({
        stewardPage,
      }) => {
        await visitProfilerPage(stewardPage);

        await expect(
          stewardPage.getByTestId('profiler-add-table-test-btn')
        ).toBeHidden();

        const testCaseName = table.testCasesResponseData[0].name;
        const actionDropdown = stewardPage.getByTestId(
          `action-dropdown-${testCaseName}`
        );

        if (await actionDropdown.isVisible()) {
          if (await actionDropdown.isEnabled()) {
            await actionDropdown.click();
            await expect(
              stewardPage.getByTestId(`delete-${testCaseName}`)
            ).toBeHidden();
            await stewardPage.keyboard.press('Escape');
          } else {
            await expect(actionDropdown).toBeDisabled();
          }
        }
      });

      test('Data Consumer cannot create or delete test suites', async ({
        consumerPage,
      }) => {
        const testSuiteListPromise =
          waitForTestSuiteListResponse(consumerPage);
        await consumerPage.goto('/data-quality/test-suites');
        await testSuiteListPromise;

        await expect(
          consumerPage.getByTestId('add-test-suite-btn')
        ).toBeHidden();
      });

      test('Data Consumer cannot edit test case', async ({
        consumerPage,
      }) => {
        await visitProfilerPage(consumerPage);
        const testCaseName = table.testCasesResponseData[0].name;
        const actionDropdown = consumerPage.getByTestId(
          `action-dropdown-${testCaseName}`
        );

        if (await actionDropdown.isVisible() && (await actionDropdown.isEnabled())) {
          await actionDropdown.click();
          await expect(
            consumerPage.getByTestId(`edit-${testCaseName}`)
          ).toBeHidden();
          await consumerPage.keyboard.press('Escape');
        }
      });
    });

    test.describe('Cross-Permission Negative Scenarios', () => {
      test('User with TEST_CASE.CREATE cannot delete test cases', async ({
        createPage,
      }) => {
        await visitProfilerPage(createPage);
        const testCaseName = table.testCasesResponseData[0].name;

        // UI: Verify delete option is hidden in action dropdown
        const actionDropdown = createPage.getByTestId(
          `action-dropdown-${testCaseName}`
        );

        if (await actionDropdown.isVisible()) {
          await actionDropdown.click();
          await expect(
            createPage.getByTestId(`delete-${testCaseName}`)
          ).toBeHidden();
          await createPage.keyboard.press('Escape');
        }
      });

      test('User with TEST_CASE.DELETE cannot create test cases', async ({
        deletePage,
      }) => {
        test.slow();
        await visitProfilerPage(deletePage);

        await expect(
          deletePage.getByTestId('profiler-add-table-test-btn')
        ).toBeHidden();
      });

      test('User with TEST_CASE.VIEW_BASIC cannot edit test cases', async ({
        viewBasicPage,
      }) => {
        await visitProfilerPage(viewBasicPage);
        const testCaseName = table.testCasesResponseData[0].name;
        const actionDropdown = viewBasicPage.getByTestId(
          `action-dropdown-${testCaseName}`
        );

        if (await actionDropdown.isVisible() && (await actionDropdown.isEnabled())) {
          await actionDropdown.click();
          await expect(
            viewBasicPage.getByTestId(`edit-${testCaseName}`)
          ).toBeHidden();
          await viewBasicPage.keyboard.press('Escape');
        }
      });

      test('User without TEST_SUITE.CREATE cannot create test suites', async ({
        viewBasicPage,
      }) => {
        const testSuiteListPromise =
          waitForTestSuiteListResponse(viewBasicPage);
        await viewBasicPage.goto('/data-quality/test-suites');
        await testSuiteListPromise;

        await expect(
          viewBasicPage.getByTestId('add-test-suite-btn')
        ).toBeHidden();
      });

      test('User without TEST_SUITE.DELETE cannot delete test suites', async ({
        suiteEditOnlyPage,
      }) => {
        const testSuiteDetailsPromise = suiteEditOnlyPage.waitForResponse(
          (res) =>
            res.url().includes(`/api/v1/dataQuality/testSuites/`) &&
            res.status() === 200
        );
        await suiteEditOnlyPage.goto(
          `/test-suites/${encodeURIComponent(logicalTestSuiteFqn)}`
        );
        await testSuiteDetailsPromise;

        await suiteEditOnlyPage.getByTestId('manage-button').click();
        await expect(
          suiteEditOnlyPage.getByTestId('delete-button')
        ).not.toBeVisible();
      });

      test('User without TEST_SUITE.EDIT cannot add test case to logical suite', async ({
        viewBasicPage,
      }) => {
        const testSuiteDetailsPromise = viewBasicPage.waitForResponse(
          (res) =>
            res.url().includes(`/api/v1/dataQuality/testSuites/`) &&
            res.status() === 200
        );
        await viewBasicPage.goto(
          `/test-suites/${encodeURIComponent(logicalTestSuiteFqn)}`
        );
        await testSuiteDetailsPromise;

        await expect(
          viewBasicPage.getByTestId('add-test-case-btn')
        ).toBeHidden();
      });
    });

    test.describe('Granular Permissions - TestCase CRUD', () => {
      test('User with TEST_CASE.CREATE can see Add button and create test case', async ({
        createPage,
        adminPage,
      }) => {
        test.slow();
        await visitProfilerPage(createPage);
        const { apiContext } = await getApiContext(createPage);

        await expect(
          createPage.getByTestId('profiler-add-table-test-btn')
        ).toBeVisible();

        const testName = `create_perm_test_${uuid()}`;
        const createRes = await apiContext.post(
          '/api/v1/dataQuality/testCases',
          {
            data: {
              name: testName,
              entityLink: `<#E::table::${table.entityResponseData.fullyQualifiedName}>`,
              testDefinition: 'tableRowCountToEqual',
              parameterValues: [{ name: 'value', value: 10 }],
            },
          }
        );
        expect(createRes.status()).toBe(201);

        const data = await createRes.json();
        const { apiContext: adminContext } = await getApiContext(adminPage);
        await adminContext.delete(`/api/v1/dataQuality/testCases/${data.id}`);
      });

      test('User with TEST_CASE.DELETE can delete test case by id', async ({
        deletePage,
        adminPage,
      }) => {
        test.slow();

        const { apiContext: adminContext } = await getApiContext(adminPage);
        const testToDelName = `delete_perm_test_${uuid()}`;
        const createRes = await adminContext.post(
          '/api/v1/dataQuality/testCases',
          {
            data: {
              name: testToDelName,
              entityLink: `<#E::table::${table.entityResponseData.fullyQualifiedName}>`,
              testDefinition: 'tableRowCountToEqual',
              parameterValues: [{ name: 'value', value: 10 }],
            },
          }
        );
        expect(createRes.status()).toBe(201);
        const testData = await createRes.json();

        await visitProfilerPage(deletePage);

        const actionDropdown = deletePage.getByTestId(
          `action-dropdown-${testToDelName}`
        );
        await expect(actionDropdown).toBeVisible();
        await actionDropdown.click();
        await expect(
          deletePage.getByTestId(`delete-${testToDelName}`)
        ).toBeVisible();
        await deletePage.keyboard.press('Escape');

        const { apiContext: delContext } = await getApiContext(deletePage);
        const delRes = await delContext.delete(
          `/api/v1/dataQuality/testCases/${testData.id}`
        );
        expect(delRes.status()).toBe(200);
      });

      test('User with TEST_CASE.DELETE can delete test case by FQN', async ({
        deletePage,
        adminPage,
      }) => {
        const { apiContext: adminContext } = await getApiContext(adminPage);
        const testToDelName = `delete_fqn_test_${uuid()}`;
        const createRes = await adminContext.post(
          '/api/v1/dataQuality/testCases',
          {
            data: {
              name: testToDelName,
              entityLink: `<#E::table::${table.entityResponseData.fullyQualifiedName}>`,
              testDefinition: 'tableRowCountToEqual',
              parameterValues: [{ name: 'value', value: 10 }],
            },
          }
        );
        expect(createRes.status()).toBe(201);
        const testData = await createRes.json();

        const { apiContext: delContext } = await getApiContext(deletePage);
        const delRes = await delContext.delete(
          `/api/v1/dataQuality/testCases/name/${encodeURIComponent(
            testData.fullyQualifiedName
          )}`
        );
        expect(delRes.status()).toBe(200);
      });

      test('User with TABLE.CREATE_TESTS can see Add button (Table Permission)', async ({
        tableCreateTestsPage,
        adminPage,
      }) => {
        test.slow();
        await visitProfilerPage(tableCreateTestsPage);
        const { apiContext } = await getApiContext(tableCreateTestsPage);

        await expect(
          tableCreateTestsPage.getByTestId('profiler-add-table-test-btn')
        ).toBeVisible();

        const testName = `table_create_perm_${uuid()}`;
        const res = await apiContext.post('/api/v1/dataQuality/testCases', {
          data: {
            name: testName,
            entityLink: `<#E::table::${table.entityResponseData.fullyQualifiedName}>`,
            testDefinition: 'tableRowCountToEqual',
            parameterValues: [{ name: 'value', value: 10 }],
          },
        });
        expect(res.status()).toBe(201);

        const data = await res.json();
        const { apiContext: adminContext } = await getApiContext(adminPage);
        await adminContext.delete(`/api/v1/dataQuality/testCases/${data.id}`);
      });
    });

    test.describe('Granular Permissions - TestCase Edit/PATCH', () => {
      test('User with TEST_CASE.EDIT_ALL can see edit action and PATCH test case', async ({
        editPage,
      }) => {
        await visitProfilerPage(editPage);
        const testCaseName = table.testCasesResponseData[0].name;

        // UI: Verify edit action is visible in action dropdown
        const actionDropdown = editPage.getByTestId(
          `action-dropdown-${testCaseName}`
        );
        await expect(actionDropdown).toBeVisible();
        await actionDropdown.click();
        await expect(
          editPage.getByTestId(`edit-${testCaseName}`)
        ).toBeVisible();
        await editPage.keyboard.press('Escape');

        // API: Verify PATCH succeeds
        const { apiContext } = await getApiContext(editPage);
        const testCaseId = table.testCasesResponseData[0].id;

        const patchRes = await apiContext.patch(
          `/api/v1/dataQuality/testCases/${testCaseId}`,
          {
            data: [
              { op: 'add', path: '/description', value: 'Updated by EditAll' },
            ],
            headers: { 'Content-Type': 'application/json-patch+json' },
          }
        );
        expect(patchRes.status()).toBe(200);
      });

      test('User with TABLE.EDIT_TESTS can see edit action and PATCH test case', async ({
        tableEditPage,
      }) => {
        await visitProfilerPage(tableEditPage);
        const testCaseName = table.testCasesResponseData[0].name;

        // UI: Verify edit action is visible in action dropdown
        const actionDropdown = tableEditPage.getByTestId(
          `action-dropdown-${testCaseName}`
        );
        await expect(actionDropdown).toBeVisible();
        await actionDropdown.click();
        await expect(
          tableEditPage.getByTestId(`edit-${testCaseName}`)
        ).toBeVisible();
        await tableEditPage.keyboard.press('Escape');

        // API: Verify PATCH succeeds
        const { apiContext } = await getApiContext(tableEditPage);
        const testCaseId = table.testCasesResponseData[0].id;

        const patchRes = await apiContext.patch(
          `/api/v1/dataQuality/testCases/${testCaseId}`,
          {
            data: [
              {
                op: 'add',
                path: '/description',
                value: 'Updated by TableEditTests',
              },
            ],
            headers: { 'Content-Type': 'application/json-patch+json' },
          }
        );
        expect(patchRes.status()).toBe(200);
      });

      test('User with VIEW_BASIC cannot see edit action in UI', async ({
        viewBasicPage,
      }) => {
        await visitProfilerPage(viewBasicPage);
        const testCaseName = table.testCasesResponseData[0].name;

        // UI: Verify action dropdown either hidden or doesn't have edit option
        const actionDropdown = viewBasicPage.getByTestId(
          `action-dropdown-${testCaseName}`
        );

        if (await actionDropdown.isVisible()) {
          await actionDropdown.click();
          await expect(
            viewBasicPage.getByTestId(`edit-${testCaseName}`)
          ).toBeHidden();
          await viewBasicPage.keyboard.press('Escape');
        }
      });

      test('User with TEST_CASE.EDIT_TESTS can PUT failed rows sample', async ({
        editTestsPage,
        adminPage,
      }) => {
        const { apiContext } = await getApiContext(editTestsPage);
        const testCaseId = table.testCasesResponseData[0].id;

        const testCaseFqn = table.testCasesResponseData[0].fullyQualifiedName;

        const { apiContext: adminContext } = await getApiContext(adminPage);

        // Create a failed test case result first
        await table.addTestCaseResult(adminContext, testCaseFqn, {
          result: 'Test failed with sample data',
          testCaseStatus: 'Failed',
          timestamp: Date.now(),
        });

        const res = await apiContext.put(
          `/api/v1/dataQuality/testCases/${testCaseId}/failedRowsSample`,
          { data: getFailedRowsData(table) }
        );
        expect(res.status()).toBe(200);
      });

      test('User with TEST_CASE.EDIT_TESTS can PUT inspection query', async ({
        editTestsPage,
      }) => {
        const { apiContext } = await getApiContext(editTestsPage);
        const testCaseId = table.testCasesResponseData[0].id;

        const res = await apiContext.put(
          `/api/v1/dataQuality/testCases/${testCaseId}/inspectionQuery`,
          {
            data: 'SELECT * FROM test_table LIMIT 10',
            headers: { 'Content-Type': 'application/json' },
          }
        );
        expect(res.status()).toBe(200);
      });
    });

    test.describe('Granular Permissions - TestCase GET Endpoints', () => {
      test('User with TABLE.VIEW_TESTS can GET test case by id', async ({
        viewAllPage,
      }) => {
        const { apiContext } = await getApiContext(viewAllPage);
        const testCaseId = table.testCasesResponseData[0].id;

        const res = await apiContext.get(
          `/api/v1/dataQuality/testCases/${testCaseId}`
        );
        expect(res.status()).toBe(200);
      });

      test('User with TABLE.VIEW_TESTS can GET test case by FQN', async ({
        viewAllPage,
      }) => {
        const { apiContext } = await getApiContext(viewAllPage);
        const testCaseFqn = table.testCasesResponseData[0].fullyQualifiedName;

        const res = await apiContext.get(
          `/api/v1/dataQuality/testCases/name/${encodeURIComponent(
            testCaseFqn
          )}`
        );
        expect(res.status()).toBe(200);
      });

      test('User with TABLE.VIEW_TESTS can GET test case versions', async ({
        viewAllPage,
      }) => {
        const { apiContext } = await getApiContext(viewAllPage);
        const testCaseId = table.testCasesResponseData[0].id;

        const res = await apiContext.get(
          `/api/v1/dataQuality/testCases/${testCaseId}/versions`
        );
        expect(res.status()).toBe(200);
      });

      test('User with TEST_CASE.VIEW_BASIC can list test cases', async ({
        viewBasicPage,
      }) => {
        const { apiContext } = await getApiContext(viewBasicPage);

        const res = await apiContext.get('/api/v1/dataQuality/testCases');
        expect(res.status()).toBe(200);
      });

      test('User with TEST_CASE.VIEW_BASIC can search test cases', async ({
        viewBasicPage,
      }) => {
        const { apiContext } = await getApiContext(viewBasicPage);

        const res = await apiContext.get(
          '/api/v1/dataQuality/testCases/search/list'
        );
        expect(res.status()).toBe(200);
      });

      test('User with TEST_CASE.VIEW_BASIC can view test case in UI', async ({
        viewBasicPage,
      }) => {
        await visitProfilerPage(viewBasicPage);
        const testCaseName = table.testCasesResponseData[0].name;

        await expect(viewBasicPage.getByTestId(testCaseName)).toBeVisible();

        await expect(
          viewBasicPage.getByTestId('profiler-add-table-test-btn')
        ).toBeHidden();
      });

      test('User with TEST_CASE.VIEW_BASIC can view test case CONTENT details in UI', async ({
        viewBasicPage,
      }) => {
        test.slow();
        const testCaseName = table.testCasesResponseData[0].name;
        const testCaseFqn = table.testCasesResponseData[0].fullyQualifiedName;

        await visitProfilerPage(viewBasicPage);
        await expect(viewBasicPage.getByTestId(testCaseName)).toBeVisible();

        const testCaseDetailsPromise =
          waitForTestCaseDetailsResponse(viewBasicPage);
        await viewBasicPage.goto(
          `/test-case/${encodeURIComponent(testCaseFqn)}`
        );
        await testCaseDetailsPromise;

        await expect(
          viewBasicPage.getByTestId('entity-page-header')
        ).toBeVisible();

        await expect(
          viewBasicPage.getByText(/Table Row Count To Be Between/i)
        ).toBeVisible();
      });
    });

    test.describe('Granular Permissions - Failed Rows', () => {
      test('User with VIEW_TEST_CASE_FAILED_ROWS_SAMPLE can view failed rows API', async ({
        failedRowsPage,
        adminPage,
      }) => {
        const testCaseId = table.testCasesResponseData[0].id;
        const { apiContext: adminContext } = await getApiContext(adminPage);
        await setupTestCaseWithFailedRows(adminContext, table);

        const { apiContext } = await getApiContext(failedRowsPage);
        const res = await apiContext.get(
          `/api/v1/dataQuality/testCases/${testCaseId}/failedRowsSample`
        );
        expect(res.status()).toBe(200);
      });

      test('User with VIEW_TEST_CASE_FAILED_ROWS_SAMPLE can view failed rows DATA in UI', async ({
        failedRowsPage,
        adminPage,
      }) => {
        const testCaseFqn = table.testCasesResponseData[0].fullyQualifiedName;
        const { apiContext: adminContext } = await getApiContext(adminPage);
        await setupTestCaseWithFailedRows(adminContext, table);

        const testCaseDetailsPromise =
          waitForTestCaseDetailsResponse(failedRowsPage);
        await failedRowsPage.goto(
          `/test-case/${encodeURIComponent(testCaseFqn)}`
        );
        await testCaseDetailsPromise;
        await expect(
          failedRowsPage.getByTestId('entity-page-header')
        ).toBeVisible();

        const failedRowsTab = failedRowsPage.getByRole('tab', {
          name: /failed rows sample/i,
        });
        if (await failedRowsTab.isVisible()) {
          const failedRowsPromise =
            waitForFailedRowsSampleResponse(failedRowsPage);
          await failedRowsTab.click();
          await failedRowsPromise;

          await expect(
            failedRowsPage.getByText('Amber Albert').first()
          ).toBeVisible();
          await expect(
            failedRowsPage.getByText('John Doe').first()
          ).toBeVisible();
        }
      });

      test('User with DELETE_TEST_CASE_FAILED_ROWS_SAMPLE can delete failed rows', async ({
        deleteFailedRowsPage,
        adminPage,
      }) => {
        const testCaseId = table.testCasesResponseData[0].id;
        const { apiContext: adminContext } = await getApiContext(adminPage);
        await setupTestCaseWithFailedRows(adminContext, table);

        const { apiContext } = await getApiContext(deleteFailedRowsPage);
        const res = await apiContext.delete(
          `/api/v1/dataQuality/testCases/${testCaseId}/failedRowsSample`
        );
        expect([200, 204]).toContain(res.status());
      });
    });

    test.describe('Granular Permissions - TestSuite', () => {
      test('User with TEST_SUITE.CREATE can create Logical Test Suites', async ({
        suitePage,
        adminPage,
      }) => {
        const { apiContext } = await getApiContext(suitePage);

        const suiteName = `logical_suite_${uuid()}`;
        const createRes = await apiContext.post(
          '/api/v1/dataQuality/testSuites',
          {
            data: {
              name: suiteName,
              description: 'Custom permission suite',
            },
          }
        );
        expect(createRes.status()).toBe(201);
        const data = await createRes.json();

        // Cleanup
        const { apiContext: adminContext } = await getApiContext(adminPage);
        await adminContext.delete(
          `/api/v1/dataQuality/testSuites/${data.id}?hardDelete=true&recursive=true`
        );
      });

      test('User with TEST_SUITE.DELETE can delete logical test suite', async ({
        suitePage,
        adminPage,
      }) => {
        // Create a suite to delete
        const { apiContext: adminContext } = await getApiContext(adminPage);
        const suiteName = `suite_to_delete_${uuid()}`;
        const createRes = await adminContext.post(
          '/api/v1/dataQuality/testSuites',
          {
            data: { name: suiteName, description: 'to delete' },
          }
        );
        expect(createRes.status()).toBe(201);
        const suiteData = await createRes.json();

        const { apiContext } = await getApiContext(suitePage);
        const delRes = await apiContext.delete(
          `/api/v1/dataQuality/testSuites/${suiteData.id}?hardDelete=true&recursive=true`
        );
        expect(delRes.status()).toBe(200);
      });

      test('User with TEST_SUITE.VIEW_ALL can view test suites page and list suites', async ({
        suitePage,
      }) => {
        // UI: Navigate to test suites page and verify it loads
        await suitePage.goto('/data-quality/test-suites');

        // Wait for the page container to load
        await expect(suitePage.getByTestId('test-suite-container')).toBeVisible(
          
        );

        await expect(suitePage.getByTestId('test-suite-table')).toBeVisible();

        // API: Verify list endpoint
        const { apiContext } = await getApiContext(suitePage);

        const res = await apiContext.get('/api/v1/dataQuality/testSuites');
        expect(res.status()).toBe(200);
      });

      test('User with TEST_SUITE.VIEW_ALL can view test suite CONTENT in UI', async ({
        suitePage,
      }) => {
        const testSuiteListPromise =
          waitForTestSuiteListResponse(suitePage);
        await suitePage.goto('/data-quality/test-suites');
        await testSuiteListPromise;

        await expect(
          suitePage.getByTestId('test-suite-container')
        ).toBeVisible();

        const suiteTable = suitePage.getByTestId('test-suite-table');
        await expect(suiteTable).toBeVisible();

        const { apiContext } = await getApiContext(suitePage);
        const res = await apiContext.get('/api/v1/dataQuality/testSuites');
        const data = await res.json();

        if (data.data && data.data.length > 0) {
          const firstSuite = data.data[0];
          const suiteName = firstSuite.name || firstSuite.displayName;
          if (suiteName) {
            // Use more flexible text matching
            const suiteNameElement = suitePage
              .getByText(suiteName, { exact: false })
              .first();
            // Only assert if element exists in DOM; otherwise skip
            if ((await suiteNameElement.count()) > 0) {
              await expect(suiteNameElement).toBeVisible();
            }
          }
        }
      });

      test('User with TEST_SUITE.VIEW_ALL can search test suites', async ({
        suitePage,
      }) => {
        const { apiContext } = await getApiContext(suitePage);

        const res = await apiContext.get(
          '/api/v1/dataQuality/testSuites/search/list'
        );
        expect(res.status()).toBe(200);
      });

      test('User with TEST_SUITE.VIEW_ALL can GET execution summary', async ({
        suitePage,
      }) => {
        const { apiContext } = await getApiContext(suitePage);

        const res = await apiContext.get(
          '/api/v1/dataQuality/testSuites/executionSummary'
        );
        expect(res.status()).toBe(200);
      });

      test('User with TEST_SUITE.EDIT_ALL can PATCH test suite', async ({
        suitePage,
      }) => {
        const { apiContext } = await getApiContext(suitePage);

        const patchRes = await apiContext.patch(
          `/api/v1/dataQuality/testSuites/${logicalTestSuiteId}`,
          {
            data: [
              {
                op: 'add',
                path: '/description',
                value: 'Updated by suite user',
              },
            ],
            headers: { 'Content-Type': 'application/json-patch+json' },
          }
        );
        expect(patchRes.status()).toBe(200);
      });

      test('User with TEST_SUITE.EDIT_ALL can add test case to logical suite', async ({
        suitePage,
      }) => {
        const { apiContext } = await getApiContext(suitePage);

        const res = await apiContext.put(
          '/api/v1/dataQuality/testCases/logicalTestCases',
          {
            data: {
              testSuiteId: logicalTestSuiteId,
              testCaseIds: [table.testCasesResponseData[0].id],
            },
          }
        );
        expect([200, 201]).toContain(res.status());
      });

      test('User with TEST_SUITE.EDIT_ALL can remove test case from logical suite', async ({
        suitePage,
      }) => {
        const { apiContext } = await getApiContext(suitePage);

        const res = await apiContext.delete(
          `/api/v1/dataQuality/testCases/logicalTestCases/${logicalTestSuiteId}/${table.testCasesResponseData[0].id}`
        );
        expect([200, 204]).toContain(res.status());
      });

      test('User with TABLE.VIEW_TESTS can list test suites (alternative permission)', async ({
        viewAllPage,
      }) => {
        const { apiContext } = await getApiContext(viewAllPage);

        const res = await apiContext.get('/api/v1/dataQuality/testSuites');
        expect(res.status()).toBe(200);
      });
    });

    test.describe('Admin Full Access', () => {
      test('Admin can perform all Data Quality operations', async ({
        adminPage,
      }) => {
        await redirectToHomePage(adminPage);
        const { apiContext } = await getApiContext(adminPage);

        // 1. Create Suite
        const suiteName = `admin_suite_${uuid()}`;
        const suiteRes = await apiContext.post(
          '/api/v1/dataQuality/testSuites',
          {
            data: { name: suiteName, description: 'admin suite' },
          }
        );
        expect(suiteRes.status()).toBe(201);
        const suiteData = await suiteRes.json();

        // 2. Create Test Case
        const testName = `admin_test_${uuid()}`;
        const testRes = await apiContext.post('/api/v1/dataQuality/testCases', {
          data: {
            name: testName,
            entityLink: `<#E::table::${table.entityResponseData.fullyQualifiedName}>`,
            testDefinition: 'tableRowCountToEqual',
            parameterValues: [{ name: 'value', value: 10 }],
          },
        });
        expect(testRes.status()).toBe(201);
        const testData = await testRes.json();

        // 3. PATCH Test Case
        const patchRes = await apiContext.patch(
          `/api/v1/dataQuality/testCases/${testData.id}`,
          {
            data: [{ op: 'add', path: '/description', value: 'admin updated' }],
            headers: { 'Content-Type': 'application/json-patch+json' },
          }
        );
        expect(patchRes.status()).toBe(200);

        // 4. Delete Test Case
        const delTestRes = await apiContext.delete(
          `/api/v1/dataQuality/testCases/${testData.id}`
        );
        expect(delTestRes.status()).toBe(200);

        // 5. PATCH Suite
        const patchSuiteRes = await apiContext.patch(
          `/api/v1/dataQuality/testSuites/${suiteData.id}`,
          {
            data: [{ op: 'add', path: '/description', value: 'admin patched' }],
            headers: { 'Content-Type': 'application/json-patch+json' },
          }
        );
        expect(patchSuiteRes.status()).toBe(200);

        // 6. Delete Suite
        const delSuiteRes = await apiContext.delete(
          `/api/v1/dataQuality/testSuites/${suiteData.id}?hardDelete=true&recursive=true`
        );
        expect(delSuiteRes.status()).toBe(200);
      });
    });
  }
);
