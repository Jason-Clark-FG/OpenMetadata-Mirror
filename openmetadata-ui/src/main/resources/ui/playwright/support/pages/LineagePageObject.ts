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
import { expect, Page } from '@playwright/test';
import { get } from 'lodash';
import { EntityClass } from '../entity/EntityClass';

export class LineagePageObject {
  constructor(private page: Page) {}

  async activateColumnLayer() {
    await this.page.click('[data-testid="lineage-layer-btn"]');

    const isColumnLayerSelected = await this.page
      .locator('[data-testid="lineage-layer-column-btn"]')
      .evaluate((el) => el.classList.contains('Mui-selected'));

    if (isColumnLayerSelected) {
      await this.page.keyboard.press('Escape');

      return;
    }

    await this.page.click('[data-testid="lineage-layer-column-btn"]');
    await this.page.keyboard.press('Escape');

    await this.zoomOut();
  }

  async deactivateColumnLayer() {
    await this.page.click('[data-testid="lineage-layer-btn"]');

    const isColumnLayerSelected = await this.page
      .locator('[data-testid="lineage-layer-column-btn"]')
      .evaluate((el) => el.classList.contains('Mui-selected'));

    if (!isColumnLayerSelected) {
      await this.page.keyboard.press('Escape');

      return;
    }

    await this.page.click('[data-testid="lineage-layer-column-btn"]');
    await this.page.keyboard.press('Escape');
  }

  async verifyColumnLayerActive() {
    await this.page.click('[data-testid="lineage-layer-btn"]');

    const columnLayerBtn = this.page.locator(
      '[data-testid="lineage-layer-column-btn"]'
    );
    await expect(columnLayerBtn).toHaveClass(/Mui-selected/);

    await this.page.keyboard.press('Escape');
  }

  async verifyColumnLayerInactive() {
    await this.page.click('[data-testid="lineage-layer-btn"]');

    const columnLayerBtn = this.page.locator(
      '[data-testid="lineage-layer-column-btn"]'
    );
    await expect(columnLayerBtn).not.toHaveClass(/Mui-selected/);

    await this.page.keyboard.press('Escape');
  }

  async verifyColumnsVisible(entity: EntityClass, columnNames: string[]) {
    const entityFqn = get(entity, 'entityResponseData.fullyQualifiedName');

    for (const columnName of columnNames) {
      const columnLocator = this.page.locator(
        `[data-testid="column-${entityFqn}.${columnName}"]`
      );
      await expect(columnLocator).toBeVisible();

      const columnDisplayName = columnLocator.locator(
        '[data-testid="column-name"]'
      );
      await expect(columnDisplayName).toContainText(columnName);
    }
  }

  async verifyColumnsHidden(entity: EntityClass, columnNames: string[]) {
    const entityFqn = get(entity, 'entityResponseData.fullyQualifiedName');

    for (const columnName of columnNames) {
      const columnLocator = this.page.locator(
        `[data-testid="column-${entityFqn}.${columnName}"]`
      );
      await expect(columnLocator).not.toBeVisible();
    }
  }

  async verifyColumnEdgeRendered(
    sourceEntityFqn: string,
    sourceColumnName: string,
    targetEntityFqn: string,
    targetColumnName: string
  ) {
    const edgeTestId = `column-edge-${sourceEntityFqn}.${sourceColumnName}-${targetEntityFqn}.${targetColumnName}`;
    const edgeLocator = this.page.locator(`[data-testid="${edgeTestId}"]`);

    await expect(edgeLocator).toBeVisible();

    const fromNodeAttr = await edgeLocator.getAttribute('data-fromnode');
    const toNodeAttr = await edgeLocator.getAttribute('data-tonode');

    expect(fromNodeAttr).toBe(`${sourceEntityFqn}.${sourceColumnName}`);
    expect(toNodeAttr).toBe(`${targetEntityFqn}.${targetColumnName}`);
  }

  async verifyColumnEdgeHidden(
    sourceEntityFqn: string,
    sourceColumnName: string,
    targetEntityFqn: string,
    targetColumnName: string
  ) {
    const edgeTestId = `column-edge-${sourceEntityFqn}.${sourceColumnName}-${targetEntityFqn}.${targetColumnName}`;
    const edgeLocator = this.page.locator(`[data-testid="${edgeTestId}"]`);

    await expect(edgeLocator).not.toBeVisible();
  }

  async verifyColumnHighlighted(
    entityFqn: string,
    columnName: string,
    shouldBeHighlighted = true
  ) {
    const columnLocator = this.page.locator(
      `[data-testid="column-${entityFqn}.${columnName}"]`
    );

    if (shouldBeHighlighted) {
      await expect(columnLocator).toHaveClass(
        /custom-node-header-column-tracing/
      );
    } else {
      await expect(columnLocator).not.toHaveClass(
        /custom-node-header-column-tracing/
      );
    }
  }

  async hoverColumn(entityFqn: string, columnName: string) {
    const columnLocator = this.page.locator(
      `[data-testid="column-${entityFqn}.${columnName}"]`
    );
    await columnLocator.hover();
  }

  async clickColumn(entityFqn: string, columnName: string) {
    const columnLocator = this.page.locator(
      `[data-testid="column-${entityFqn}.${columnName}"]`
    );
    await columnLocator.click();
  }

  async verifyNodeVisible(entity: EntityClass) {
    const nodeFqn = get(entity, 'entityResponseData.fullyQualifiedName');
    const displayName = get(entity, 'entityResponseData.displayName');

    const nodeLocator = this.page.locator(
      `[data-testid="lineage-node-${nodeFqn}"]`
    );

    await nodeLocator.waitFor({ state: 'attached' });
    await nodeLocator.scrollIntoViewIfNeeded();

    await expect(nodeLocator).toBeVisible();

    const nodeDisplayName = nodeLocator.locator(
      '[data-testid="entity-header-display-name"]'
    );
    await expect(nodeDisplayName).toHaveText(displayName);
  }

  async verifyNodeHidden(entity: EntityClass) {
    const nodeFqn = get(entity, 'entityResponseData.fullyQualifiedName');
    const nodeLocator = this.page.locator(
      `[data-testid="lineage-node-${nodeFqn}"]`
    );

    await expect(nodeLocator).not.toBeVisible();
  }

  async verifyEdgeRendered(
    sourceEntity: EntityClass,
    targetEntity: EntityClass
  ) {
    const sourceFqn = get(
      sourceEntity,
      'entityResponseData.fullyQualifiedName'
    );
    const targetFqn = get(
      targetEntity,
      'entityResponseData.fullyQualifiedName'
    );

    const edgeLocator = this.page.locator(
      `[data-testid="edge-${sourceFqn}-${targetFqn}"]`
    );

    await expect(edgeLocator).toBeVisible();
  }

  async verifyEdgeHidden(sourceEntity: EntityClass, targetEntity: EntityClass) {
    const sourceFqn = get(
      sourceEntity,
      'entityResponseData.fullyQualifiedName'
    );
    const targetFqn = get(
      targetEntity,
      'entityResponseData.fullyQualifiedName'
    );

    const edgeLocator = this.page.locator(
      `[data-testid="edge-${sourceFqn}-${targetFqn}"]`
    );

    await expect(edgeLocator).not.toBeVisible();
  }

  async activatePlatformView(viewType: 'service' | 'domain' | 'dataProduct') {
    await this.page.click('[data-testid="lineage-layer-btn"]');

    const viewBtn = this.page.locator(
      `[data-testid="lineage-layer-${viewType}-btn"]`
    );
    await expect(viewBtn).toBeVisible();

    await viewBtn.click();
    await this.page.keyboard.press('Escape');

    await this.page.waitForTimeout(500);
  }

  async verifyPlatformNodeVisible(
    platformFqn: string,
    platformName: string,
    nodeType: 'service' | 'domain' | 'dataProduct'
  ) {
    const nodeLocator = this.page.locator(
      `[data-testid="lineage-node-${platformFqn}"]`
    );

    await expect(nodeLocator).toBeVisible();

    const nodeDisplayName = nodeLocator.locator(
      '[data-testid="entity-header-display-name"]'
    );
    await expect(nodeDisplayName).toContainText(platformName);

    const nodeTypeIndicator = nodeLocator.locator(
      `[data-testid="entity-type-${nodeType}"]`
    );
    if ((await nodeTypeIndicator.count()) > 0) {
      await expect(nodeTypeIndicator).toBeVisible();
    }
  }

  async verifyPlatformEdgeRendered(
    sourcePlatformFqn: string,
    targetPlatformFqn: string
  ) {
    const edgeLocator = this.page.locator(
      `[data-testid="edge-${sourcePlatformFqn}-${targetPlatformFqn}"]`
    );

    await expect(edgeLocator).toBeVisible();
  }

  async verifyNodeCountReduction(
    beforeCount: number,
    afterCount: number,
    message?: string
  ) {
    const defaultMessage = `Expected node count to reduce from ${beforeCount} to ${afterCount} after platform view activation`;
    expect(afterCount, message ?? defaultMessage).toBeLessThan(beforeCount);
  }

  async getVisibleNodeCount(): Promise<number> {
    const nodes = this.page.locator('[data-testid^="lineage-node-"]');

    return await nodes.count();
  }

  async clickNode(entity: EntityClass) {
    const nodeFqn = get(entity, 'entityResponseData.fullyQualifiedName');
    const nodeLocator = this.page.locator(
      `[data-testid="lineage-node-${nodeFqn}"]`
    );

    await nodeLocator.click();
  }

  async verifyNodePanelOpen(entity: EntityClass) {
    const displayName = get(entity, 'entityResponseData.displayName');

    const panel = this.page.locator('[role="dialog"]');
    await expect(panel).toBeVisible();

    const panelTitle = panel.getByTestId('entity-header-title');
    await expect(panelTitle).toHaveText(displayName);
  }

  async closeNodePanel() {
    const closeBtn = this.page.getByLabel('Close').first();
    await closeBtn.click();

    const panel = this.page.locator('[role="dialog"]');
    await expect(panel).not.toBeVisible();
  }

  async expandNode(entity: EntityClass, direction: 'upstream' | 'downstream') {
    const nodeFqn = get(entity, 'entityResponseData.fullyQualifiedName');
    const handleDirection = direction === 'upstream' ? 'left' : 'right';

    const expandHandle = this.page
      .locator(`[data-testid="lineage-node-${nodeFqn}"]`)
      .locator(`.react-flow__handle-${handleDirection}`)
      .getByTestId('plus-icon');

    if ((await expandHandle.count()) > 0) {
      const lineageRes = this.page.waitForResponse('/api/v1/lineage/**');
      await expandHandle.click();
      await lineageRes;
    }
  }

  async collapseNode(
    entity: EntityClass,
    direction: 'upstream' | 'downstream'
  ) {
    const nodeFqn = get(entity, 'entityResponseData.fullyQualifiedName');
    const handleDirection = direction === 'upstream' ? 'left' : 'right';

    const collapseHandle = this.page
      .locator(`[data-testid="lineage-node-${nodeFqn}"]`)
      .locator(`.react-flow__handle-${handleDirection}`)
      .getByTestId('minus-icon');

    if ((await collapseHandle.count()) > 0) {
      await collapseHandle.click();
      await this.page.waitForTimeout(300);
    }
  }

  async scrollColumnsPagination(entity: EntityClass, direction: 'up' | 'down') {
    const nodeFqn = get(entity, 'entityResponseData.fullyQualifiedName');
    const buttonTestId =
      direction === 'down' ? 'column-scroll-down' : 'column-scroll-up';

    const scrollBtn = this.page
      .locator(`[data-testid="lineage-node-${nodeFqn}"]`)
      .getByTestId(buttonTestId);

    if (await scrollBtn.isVisible()) {
      await scrollBtn.click();
      await this.page.waitForTimeout(300);
    }
  }

  async toggleLineageFilter(entityFqn: string) {
    const filterBtn = this.page
      .locator(`[data-testid="lineage-node-${entityFqn}"]`)
      .getByTestId('lineage-column-filter-toggle');

    await filterBtn.click();
    await this.page.waitForTimeout(300);
  }

  async enterEditMode() {
    const editBtn = this.page.getByTestId('edit-lineage');
    await editBtn.click();

    await expect(editBtn).toHaveClass(/active/);
  }

  async exitEditMode() {
    const editBtn = this.page.getByTestId('edit-lineage');
    await editBtn.click();

    await expect(editBtn).not.toHaveClass(/active/);
  }

  async verifyEditModeActive() {
    const editBtn = this.page.getByTestId('edit-lineage');
    await expect(editBtn).toHaveClass(/active/);
  }

  async verifyConnectionHandlesVisible(entity: EntityClass) {
    const nodeFqn = get(entity, 'entityResponseData.fullyQualifiedName');
    const nodeLocator = this.page.locator(
      `[data-testid="lineage-node-${nodeFqn}"]`
    );

    const handles = nodeLocator.locator('.react-flow__handle');
    await expect(handles.first()).toBeVisible();
  }

  async zoomOut(times = 10) {
    const zoomOutBtn = this.page.getByTestId('zoom-out');

    for (let i = 0; i < times; i++) {
      await zoomOutBtn.click();
      await this.page.waitForTimeout(100);
    }
  }

  async zoomIn(times = 3) {
    const zoomInBtn = this.page.getByTestId('zoom-in');

    for (let i = 0; i < times; i++) {
      await zoomInBtn.click();
      await this.page.waitForTimeout(100);
    }
  }

  async fitToScreen() {
    await this.page.getByTestId('fit-screen').click();
    await this.page.getByRole('menuitem', { name: 'Fit to screen' }).click();
    await this.page.waitForTimeout(300);
  }
}
