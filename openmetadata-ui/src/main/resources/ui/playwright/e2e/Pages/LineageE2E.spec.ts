/*
 *  Copyright 2025 Collate.
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
import { expect } from '@playwright/test';
import { get } from 'lodash';
import { ApiEndpointClass } from '../../support/entity/ApiEndpointClass';
import { ContainerClass } from '../../support/entity/ContainerClass';
import { DashboardClass } from '../../support/entity/DashboardClass';
import { EntityDataClass } from '../../support/entity/EntityDataClass';
import { TableClass } from '../../support/entity/TableClass';
import { TopicClass } from '../../support/entity/TopicClass';
import { LineagePageObject } from '../../support/pages/LineagePageObject';
import { performAdminLogin } from '../../utils/admin';
import { getApiContext, redirectToHomePage } from '../../utils/common';
import { waitForAllLoadersToDisappear } from '../../utils/entity';
import {
  connectEdgeBetweenNodesViaAPI,
  generateColumns,
  getEntityColumns,
  toggleLineageFilters,
  visitLineageTab,
} from '../../utils/lineage';
import { test } from '../fixtures/pages';

const entitiesForColumnLayer = [
  { EntityClass: TableClass, name: 'Table', hasColumns: true },
  {
    EntityClass: TopicClass,
    name: 'Topic',
    hasColumns: true,
    columnPath: 'messageSchema.schemaFields',
  },
  {
    EntityClass: DashboardClass,
    name: 'Dashboard',
    hasColumns: true,
    columnPath: 'charts[0].columns',
  },
  {
    EntityClass: ContainerClass,
    name: 'Container',
    hasColumns: true,
    columnPath: 'dataModel.columns',
  },
  {
    EntityClass: ApiEndpointClass,
    name: 'ApiEndpoint',
    hasColumns: true,
    columnPath: 'responseSchema.schemaFields',
  },
] as const;

test.describe('Lineage E2E - Column Layer Behavior', () => {
  test.beforeEach(async ({ page }) => {
    await redirectToHomePage(page);
  });

  for (const {
    EntityClass: Entity1Class,
    name: entity1Name,
  } of entitiesForColumnLayer) {
    for (const {
      EntityClass: Entity2Class,
      name: entity2Name,
    } of entitiesForColumnLayer) {
      test(`Verify column layer activation shows columns for ${entity1Name} -> ${entity2Name}`, async ({
        page,
      }) => {
        const { apiContext, afterAction } = await getApiContext(page);
        const lineagePage = new LineagePageObject(page);

        const entity1 = new Entity1Class();
        const entity2 = new Entity2Class();

        try {
          await Promise.all([
            entity1.create(apiContext),
            entity2.create(apiContext),
          ]);

          await entity1.patch({
            apiContext,
            patchData: [
              {
                op: 'add',
                path: '/owners/0',
                value: {
                  type: 'user',
                  id: EntityDataClass.user1.responseData.id,
                },
              },
            ],
          });

          await connectEdgeBetweenNodesViaAPI(
            apiContext,
            {
              id: entity1.entityResponseData.id,
              type: entity1.getType().toLowerCase(),
            },
            {
              id: entity2.entityResponseData.id,
              type: entity2.getType().toLowerCase(),
            }
          );

          await redirectToHomePage(page);
          await entity1.visitEntityPage(page);
          await visitLineageTab(page);
          await lineagePage.zoomOut();

          await test.step('Verify column layer is inactive initially', async () => {
            await lineagePage.verifyColumnLayerInactive();
          });

          await test.step('Activate column layer and verify columns become visible', async () => {
            await lineagePage.activateColumnLayer();

            const entity1Fqn = get(
              entity1,
              'entityResponseData.fullyQualifiedName',
              ''
            );
            const entity2Fqn = get(
              entity2,
              'entityResponseData.fullyQualifiedName',
              ''
            );

            const entity1Columns = getEntityColumns(entity1, entity1Name);
            const entity2Columns = getEntityColumns(entity2, entity2Name);

            await toggleLineageFilters(page, entity1Fqn);
            await toggleLineageFilters(page, entity2Fqn);

            if (entity1Columns.length > 0) {
              const firstColumn = entity1Columns[0];
              const columnLocator = page.locator(
                `[data-testid="column-${entity1Fqn}.${firstColumn.name}"]`
              );
              await expect(columnLocator).toBeVisible();
            }

            if (entity2Columns.length > 0) {
              const firstColumn = entity2Columns[0];
              const columnLocator = page.locator(
                `[data-testid="column-${entity2Fqn}.${firstColumn.name}"]`
              );
              await expect(columnLocator).toBeVisible();
            }
          });

          await test.step('Deactivate column layer and verify columns are hidden', async () => {
            await lineagePage.deactivateColumnLayer();

            await page.waitForTimeout(300);

            const entity1Columns = getEntityColumns(entity1, entity1Name);
            const entity2Columns = getEntityColumns(entity2, entity2Name);

            if (entity1Columns.length > 0) {
              await lineagePage.verifyColumnsHidden(entity1, [
                entity1Columns[0].name,
              ]);
            }

            if (entity2Columns.length > 0) {
              await lineagePage.verifyColumnsHidden(entity2, [
                entity2Columns[0].name,
              ]);
            }

            await lineagePage.verifyColumnLayerInactive();
          });
        } finally {
          await Promise.all([
            entity1.delete(apiContext),
            entity2.delete(apiContext),
          ]);
          await afterAction();
        }
      });
    }
  }
});

test.describe('Lineage E2E - Column Edge Rendering', () => {
  const table1 = new TableClass();
  const table2 = new TableClass();

  test.beforeAll(async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);

    await Promise.all([table1.create(apiContext), table2.create(apiContext)]);

    const table1Fqn = get(table1, 'entityResponseData.fullyQualifiedName');
    const table2Fqn = get(table2, 'entityResponseData.fullyQualifiedName');

    const sourceCol = `${table1Fqn}.${get(
      table1,
      'entityResponseData.columns[0].name'
    )}`;
    const targetCol = `${table2Fqn}.${get(
      table2,
      'entityResponseData.columns[0].name'
    )}`;

    await connectEdgeBetweenNodesViaAPI(
      apiContext,
      { id: table1.entityResponseData.id, type: 'table' },
      { id: table2.entityResponseData.id, type: 'table' },
      [
        {
          fromColumns: [sourceCol],
          toColumn: targetCol,
        },
      ]
    );

    await afterAction();
  });

  test.afterAll(async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);
    await Promise.all([table1.delete(apiContext), table2.delete(apiContext)]);
    await afterAction();
  });

  test.beforeEach(async ({ page }) => {
    await redirectToHomePage(page);
  });

  test('Verify column edges are rendered when column layer is active', async ({
    page,
  }) => {
    const lineagePage = new LineagePageObject(page);

    await table1.visitEntityPage(page);
    await visitLineageTab(page);
    await lineagePage.zoomOut();

    await test.step('Activate column layer', async () => {
      await lineagePage.activateColumnLayer();
      await page.waitForTimeout(500);
    });

    await test.step('Verify column edge is visible between connected columns', async () => {
      const table1Fqn = get(
        table1,
        'entityResponseData.fullyQualifiedName',
        ''
      );
      const table2Fqn = get(
        table2,
        'entityResponseData.fullyQualifiedName',
        ''
      );

      const sourceColName = get(
        table1,
        'entityResponseData.columns[0].name',
        ''
      );
      const targetColName = get(
        table2,
        'entityResponseData.columns[0].name',
        ''
      );

      await lineagePage.verifyColumnEdgeRendered(
        table1Fqn,
        sourceColName,
        table2Fqn,
        targetColName
      );
    });

    await test.step('Verify node-level edge is still visible', async () => {
      await lineagePage.verifyEdgeRendered(table1, table2);
    });
  });

  test('Verify column edges update when scrolling through paginated columns', async ({
    page,
  }) => {
    const { apiContext, afterAction } = await getApiContext(page);
    const lineagePage = new LineagePageObject(page);

    const largeTable1 = new TableClass();
    const largeTable2 = new TableClass();

    largeTable1.entity.columns = generateColumns(25, 't1');
    largeTable2.entity.columns = generateColumns(25, 't2');

    try {
      await Promise.all([
        largeTable1.create(apiContext),
        largeTable2.create(apiContext),
      ]);

      const table1Fqn = get(
        largeTable1,
        'entityResponseData.fullyQualifiedName'
      );
      const table2Fqn = get(
        largeTable2,
        'entityResponseData.fullyQualifiedName'
      );

      const table1Col0 = `${table1Fqn}.t1_column_0`;
      const table2Col0 = `${table2Fqn}.t2_column_0`;
      const table1Col15 = `${table1Fqn}.t1_column_15`;
      const table2Col15 = `${table2Fqn}.t2_column_15`;

      await connectEdgeBetweenNodesViaAPI(
        apiContext,
        { id: largeTable1.entityResponseData.id, type: 'table' },
        { id: largeTable2.entityResponseData.id, type: 'table' },
        [
          { fromColumns: [table1Col0], toColumn: table2Col0 },
          { fromColumns: [table1Col15], toColumn: table2Col15 },
        ]
      );

      await redirectToHomePage(page);
      await largeTable1.visitEntityPage(page);
      await visitLineageTab(page);
      await lineagePage.zoomOut();
      await lineagePage.activateColumnLayer();

      await test.step('Verify first column edge is visible on page 1', async () => {
        await lineagePage.verifyColumnEdgeRendered(
          table1Fqn,
          't1_column_0',
          table2Fqn,
          't2_column_0'
        );
      });

      await test.step('Scroll to page 2 and verify edge to column_15 appears', async () => {
        await lineagePage.scrollColumnsPagination(largeTable1, 'down');
        await lineagePage.scrollColumnsPagination(largeTable2, 'down');

        await lineagePage.verifyColumnEdgeRendered(
          table1Fqn,
          't1_column_15',
          table2Fqn,
          't2_column_15'
        );

        await lineagePage.verifyColumnEdgeHidden(
          table1Fqn,
          't1_column_0',
          table2Fqn,
          't2_column_0'
        );
      });
    } finally {
      await Promise.all([
        largeTable1.delete(apiContext),
        largeTable2.delete(apiContext),
      ]);
      await afterAction();
    }
  });
});

test.describe('Lineage E2E - Column Highlighting on Hover and Click', () => {
  const table1 = new TableClass();
  const table2 = new TableClass();
  const table3 = new TableClass();

  test.beforeAll(async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);

    await Promise.all([
      table1.create(apiContext),
      table2.create(apiContext),
      table3.create(apiContext),
    ]);

    const table1Fqn = get(table1, 'entityResponseData.fullyQualifiedName');
    const table2Fqn = get(table2, 'entityResponseData.fullyQualifiedName');
    const table3Fqn = get(table3, 'entityResponseData.fullyQualifiedName');

    const t1Col0 = `${table1Fqn}.${get(
      table1,
      'entityResponseData.columns[0].name'
    )}`;
    const t2Col0 = `${table2Fqn}.${get(
      table2,
      'entityResponseData.columns[0].name'
    )}`;
    const t2Col1 = `${table2Fqn}.${get(
      table2,
      'entityResponseData.columns[1].name'
    )}`;
    const t3Col0 = `${table3Fqn}.${get(
      table3,
      'entityResponseData.columns[0].name'
    )}`;

    await connectEdgeBetweenNodesViaAPI(
      apiContext,
      { id: table1.entityResponseData.id, type: 'table' },
      { id: table2.entityResponseData.id, type: 'table' },
      [{ fromColumns: [t1Col0], toColumn: t2Col0 }]
    );

    await connectEdgeBetweenNodesViaAPI(
      apiContext,
      { id: table2.entityResponseData.id, type: 'table' },
      { id: table3.entityResponseData.id, type: 'table' },
      [{ fromColumns: [t2Col1], toColumn: t3Col0 }]
    );

    await afterAction();
  });

  test.afterAll(async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);
    await Promise.all([
      table1.delete(apiContext),
      table2.delete(apiContext),
      table3.delete(apiContext),
    ]);
    await afterAction();
  });

  test.beforeEach(async ({ page }) => {
    await redirectToHomePage(page);
  });

  test('Verify hovering column highlights connected columns and edges', async ({
    page,
  }) => {
    const lineagePage = new LineagePageObject(page);

    await table2.visitEntityPage(page);
    await visitLineageTab(page);
    await lineagePage.zoomOut();
    await lineagePage.activateColumnLayer();

    const table1Fqn = get(table1, 'entityResponseData.fullyQualifiedName', '');
    const table2Fqn = get(table2, 'entityResponseData.fullyQualifiedName', '');

    const t1Col0Name = get(table1, 'entityResponseData.columns[0].name', '');
    const t2Col0Name = get(table2, 'entityResponseData.columns[0].name', '');
    const t2Col1Name = get(table2, 'entityResponseData.columns[1].name', '');

    await test.step('Hover on table2.column0 and verify highlighting', async () => {
      await lineagePage.hoverColumn(table2Fqn, t2Col0Name);

      await page.waitForTimeout(300);

      await lineagePage.verifyColumnHighlighted(table1Fqn, t1Col0Name, true);
      await lineagePage.verifyColumnHighlighted(table2Fqn, t2Col0Name, true);

      await lineagePage.verifyColumnHighlighted(table2Fqn, t2Col1Name, false);
    });
  });

  test('Verify clicking column highlights lineage path', async ({ page }) => {
    const lineagePage = new LineagePageObject(page);

    await table2.visitEntityPage(page);
    await visitLineageTab(page);
    await lineagePage.zoomOut();
    await lineagePage.activateColumnLayer();

    const table1Fqn = get(table1, 'entityResponseData.fullyQualifiedName', '');
    const table2Fqn = get(table2, 'entityResponseData.fullyQualifiedName', '');
    const table3Fqn = get(table3, 'entityResponseData.fullyQualifiedName', '');

    const t1Col0Name = get(table1, 'entityResponseData.columns[0].name', '');
    const t2Col0Name = get(table2, 'entityResponseData.columns[0].name', '');
    const t2Col1Name = get(table2, 'entityResponseData.columns[1].name', '');
    const t3Col0Name = get(table3, 'entityResponseData.columns[0].name', '');

    await test.step('Click table2.column1 and verify downstream path is highlighted', async () => {
      await lineagePage.clickColumn(table2Fqn, t2Col1Name);

      await page.waitForTimeout(300);

      await lineagePage.verifyColumnHighlighted(table2Fqn, t2Col1Name, true);
      await lineagePage.verifyColumnHighlighted(table3Fqn, t3Col0Name, true);

      await lineagePage.verifyColumnHighlighted(table1Fqn, t1Col0Name, false);
      await lineagePage.verifyColumnHighlighted(table2Fqn, t2Col0Name, false);
    });
  });
});

test.describe('Lineage E2E - Node Expand and Collapse', () => {
  const table1 = new TableClass();
  const table2 = new TableClass();
  const table3 = new TableClass();

  test.beforeAll(async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);

    await Promise.all([
      table1.create(apiContext),
      table2.create(apiContext),
      table3.create(apiContext),
    ]);

    await connectEdgeBetweenNodesViaAPI(
      apiContext,
      { id: table1.entityResponseData.id, type: 'table' },
      { id: table2.entityResponseData.id, type: 'table' }
    );

    await connectEdgeBetweenNodesViaAPI(
      apiContext,
      { id: table2.entityResponseData.id, type: 'table' },
      { id: table3.entityResponseData.id, type: 'table' }
    );

    await afterAction();
  });

  test.afterAll(async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);
    await Promise.all([
      table1.delete(apiContext),
      table2.delete(apiContext),
      table3.delete(apiContext),
    ]);
    await afterAction();
  });

  test.beforeEach(async ({ page }) => {
    await redirectToHomePage(page);
  });

  test('Verify expanding upstream shows new nodes', async ({ page }) => {
    const lineagePage = new LineagePageObject(page);

    await table3.visitEntityPage(page);
    await visitLineageTab(page);
    await lineagePage.zoomOut();

    await test.step('Initially only table3 and table2 are visible', async () => {
      await lineagePage.verifyNodeVisible(table3);
      await lineagePage.verifyNodeVisible(table2);
    });

    await test.step('Expand table2 upstream and verify table1 appears', async () => {
      await lineagePage.expandNode(table2, 'upstream');

      await waitForAllLoadersToDisappear(page);

      await lineagePage.verifyNodeVisible(table1);
      await lineagePage.verifyEdgeRendered(table1, table2);
    });
  });

  test('Verify collapsing hides downstream nodes', async ({ page }) => {
    const lineagePage = new LineagePageObject(page);

    await table1.visitEntityPage(page);
    await visitLineageTab(page);
    await lineagePage.zoomOut();

    await test.step('Initially table1, table2, and table3 are visible', async () => {
      await lineagePage.verifyNodeVisible(table1);
      await lineagePage.verifyNodeVisible(table2);
    });

    await test.step('Expand to show table3', async () => {
      await lineagePage.expandNode(table2, 'downstream');
      await waitForAllLoadersToDisappear(page);
      await lineagePage.verifyNodeVisible(table3);
    });

    await test.step('Collapse table2 downstream and verify table3 is hidden', async () => {
      await lineagePage.collapseNode(table2, 'downstream');

      await lineagePage.verifyNodeHidden(table3);
      await lineagePage.verifyEdgeHidden(table2, table3);
    });
  });
});

test.describe('Lineage E2E - Platform Lineage Views', () => {
  const table1 = new TableClass();
  const table2 = new TableClass();
  const topic = new TopicClass();

  test.beforeAll(async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);

    await Promise.all([
      table1.create(apiContext),
      table2.create(apiContext),
      topic.create(apiContext),
    ]);

    await table1.patch({
      apiContext,
      patchData: [
        {
          op: 'add',
          path: '/domains/0',
          value: {
            type: 'domain',
            id: EntityDataClass.domain1.responseData.id,
          },
        },
      ],
    });

    await table2.patch({
      apiContext,
      patchData: [
        {
          op: 'add',
          path: '/domains/0',
          value: {
            type: 'domain',
            id: EntityDataClass.domain1.responseData.id,
          },
        },
      ],
    });

    await topic.patch({
      apiContext,
      patchData: [
        {
          op: 'add',
          path: '/domains/0',
          value: {
            type: 'domain',
            id: EntityDataClass.domain2.responseData.id,
          },
        },
      ],
    });

    await connectEdgeBetweenNodesViaAPI(
      apiContext,
      { id: table1.entityResponseData.id, type: 'table' },
      { id: table2.entityResponseData.id, type: 'table' }
    );

    await connectEdgeBetweenNodesViaAPI(
      apiContext,
      { id: table2.entityResponseData.id, type: 'table' },
      { id: topic.entityResponseData.id, type: 'topic' }
    );

    await afterAction();
  });

  test.afterAll(async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);
    await Promise.all([
      table1.delete(apiContext),
      table2.delete(apiContext),
      topic.delete(apiContext),
    ]);
    await afterAction();
  });

  test.beforeEach(async ({ page }) => {
    await redirectToHomePage(page);
  });

  test('Verify service platform view aggregates entities by service', async ({
    page,
  }) => {
    const lineagePage = new LineagePageObject(page);

    await table1.visitEntityPage(page);
    await visitLineageTab(page);
    await lineagePage.zoomOut();

    await test.step('Count nodes before platform view activation', async () => {
      const beforeCount = await lineagePage.getVisibleNodeCount();
      expect(beforeCount).toBeGreaterThanOrEqual(3);
    });

    await test.step('Activate service platform view', async () => {
      await lineagePage.activatePlatformView('service');
      await waitForAllLoadersToDisappear(page);
    });

    await test.step('Verify service nodes are displayed instead of entity nodes', async () => {
      const tableServiceFqn = get(
        table1,
        'entityResponseData.service.fullyQualifiedName',
        ''
      );
      const topicServiceFqn = get(
        topic,
        'entityResponseData.service.fullyQualifiedName',
        ''
      );

      const tableServiceName = get(
        table1,
        'entityResponseData.service.name',
        ''
      );
      const topicServiceName = get(
        topic,
        'entityResponseData.service.name',
        ''
      );

      await lineagePage.verifyPlatformNodeVisible(
        tableServiceFqn,
        tableServiceName,
        'service'
      );
      await lineagePage.verifyPlatformNodeVisible(
        topicServiceFqn,
        topicServiceName,
        'service'
      );
    });

    await test.step('Verify node count reduced due to aggregation', async () => {
      const afterCount = await lineagePage.getVisibleNodeCount();

      lineagePage.verifyNodeCountReduction(
        3,
        afterCount,
        'Two tables from same service should collapse into one service node'
      );
    });

    await test.step('Verify edge between services is maintained', async () => {
      const tableServiceFqn = get(
        table1,
        'entityResponseData.service.fullyQualifiedName',
        ''
      );
      const topicServiceFqn = get(
        topic,
        'entityResponseData.service.fullyQualifiedName',
        ''
      );

      await lineagePage.verifyPlatformEdgeRendered(
        tableServiceFqn,
        topicServiceFqn
      );
    });
  });

  test('Verify domain platform view aggregates entities by domain', async ({
    page,
  }) => {
    const lineagePage = new LineagePageObject(page);

    await table1.visitEntityPage(page);
    await visitLineageTab(page);
    await lineagePage.zoomOut();

    await test.step('Activate domain platform view', async () => {
      await lineagePage.activatePlatformView('domain');
      await waitForAllLoadersToDisappear(page);
    });

    await test.step('Verify domain nodes are displayed', async () => {
      const domain1Fqn =
        EntityDataClass.domain1.responseData.fullyQualifiedName ?? '';
      const domain2Fqn =
        EntityDataClass.domain2.responseData.fullyQualifiedName ?? '';

      const domain1Name = EntityDataClass.domain1.responseData.name;
      const domain2Name = EntityDataClass.domain2.responseData.name;

      await lineagePage.verifyPlatformNodeVisible(
        domain1Fqn,
        domain1Name,
        'domain'
      );
      await lineagePage.verifyPlatformNodeVisible(
        domain2Fqn,
        domain2Name,
        'domain'
      );
    });

    await test.step('Verify edge between domains is maintained', async () => {
      const domain1Fqn =
        EntityDataClass.domain1.responseData.fullyQualifiedName ?? '';
      const domain2Fqn =
        EntityDataClass.domain2.responseData.fullyQualifiedName ?? '';

      await lineagePage.verifyPlatformEdgeRendered(domain1Fqn, domain2Fqn);
    });
  });

  test('Verify clicking platform node shows underlying entities', async ({
    page,
  }) => {
    const lineagePage = new LineagePageObject(page);

    await table1.visitEntityPage(page);
    await visitLineageTab(page);
    await lineagePage.zoomOut();

    await lineagePage.activatePlatformView('service');
    await waitForAllLoadersToDisappear(page);

    await test.step('Click service node to open panel', async () => {
      const tableServiceFqn = get(
        table1,
        'entityResponseData.service.fullyQualifiedName'
      );
      const serviceNodeLocator = page.locator(
        `[data-testid="lineage-node-${tableServiceFqn}"]`
      );

      await serviceNodeLocator.click();

      const panel = page.locator('[role="dialog"]');
      await expect(panel).toBeVisible();
    });

    await test.step('Verify panel shows service details', async () => {
      const tableServiceName = get(
        table1,
        'entityResponseData.service.name',
        ''
      );
      const panelTitle = page
        .locator('[role="dialog"]')
        .getByTestId('entity-header-title');
      await expect(panelTitle).toContainText(tableServiceName);
    });
  });
});

test.describe('Lineage E2E - Edit Mode Behavior', () => {
  const table = new TableClass();

  test.beforeAll(async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);
    await table.create(apiContext);
    await afterAction();
  });

  test.afterAll(async ({ browser }) => {
    const { apiContext, afterAction } = await performAdminLogin(browser);
    await table.delete(apiContext);
    await afterAction();
  });

  test.beforeEach(async ({ page }) => {
    await redirectToHomePage(page);
  });

  test('Verify entering edit mode activates column layer and shows connection handles', async ({
    page,
  }) => {
    const lineagePage = new LineagePageObject(page);

    await table.visitEntityPage(page);
    await visitLineageTab(page);
    await lineagePage.zoomOut();

    await test.step('Verify column layer is inactive before edit mode', async () => {
      await lineagePage.verifyColumnLayerInactive();
    });

    await test.step('Enter edit mode and verify column layer activates', async () => {
      await lineagePage.enterEditMode();

      await lineagePage.verifyColumnLayerActive();
    });

    await test.step('Verify connection handles are visible on nodes', async () => {
      await lineagePage.verifyConnectionHandlesVisible(table);
    });

    await test.step('Exit edit mode and verify column layer deactivates', async () => {
      await lineagePage.exitEditMode();

      await lineagePage.verifyColumnLayerInactive();
    });
  });

  test('Verify exiting edit mode clears node and column tracing', async ({
    page,
  }) => {
    const lineagePage = new LineagePageObject(page);

    await table.visitEntityPage(page);
    await visitLineageTab(page);
    await lineagePage.zoomOut();

    const tableFqn = get(table, 'entityResponseData.fullyQualifiedName', '');
    const firstColName = get(table, 'entityResponseData.columns[0].name', '');

    await test.step('Enter edit mode and click column to trace', async () => {
      await lineagePage.enterEditMode();

      await lineagePage.clickColumn(tableFqn, firstColName);

      await lineagePage.verifyColumnHighlighted(tableFqn, firstColName, true);
    });

    await test.step('Exit edit mode and verify column tracing is cleared', async () => {
      await lineagePage.exitEditMode();

      await page.waitForTimeout(300);

      await lineagePage.verifyColumnHighlighted(tableFqn, firstColName, false);
    });
  });
});
