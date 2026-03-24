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
/*
 *  Copyright 2026 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
import { expect, Locator, Page } from '@playwright/test';
import { clickOutside, descriptionBox } from './common';
import { waitForAllLoadersToDisappear } from './entity';
import {
  waitForTaskActionResponse,
  waitForTaskCommentResponse,
  waitForTaskCreateResponse,
  waitForTaskListResponse,
  waitForTaskResolveResponse,
} from './task';

type TaskRouteAction =
  | 'request-description'
  | 'request-tags'
  | 'update-description'
  | 'update-tags';

export interface CreatedTask {
  id: string;
  taskId: string;
  status?: string;
}

const TASK_CARD_SELECTOR = '[data-testid="task-feed-card"]';
const TASK_TAB_SELECTOR = '[data-testid="task-tab"]';
const TASK_PANEL_SELECTOR = '#task-panel';
const VISIBLE_TASK_MODAL_SELECTOR = '.ant-modal-wrap:visible';

const logTaskDebug = (...messages: Array<string | number | boolean>) => {
  if (process.env.PW_TASK_DEBUG) {
    // eslint-disable-next-line no-console -- opt-in playwright debug logging
    console.log('[PW_TASK_DEBUG]', ...messages);
  }
};

const getDropdownTrigger = (dropdown: Locator) =>
  dropdown.getByRole('button', { name: /down/i }).first();

const selectTagSuggestion = async ({
  page,
  root,
  searchText,
  tagTestId,
}: {
  page: Page;
  root: Page | Locator;
  searchText: string;
  tagTestId: string;
}) => {
  const tagSelector = root.locator('[data-testid="tag-selector"]').first();
  const tagsInput = tagSelector
    .locator(
      '.ant-select-selection-search-input, input[type="search"], .ant-select-selection-search input'
    )
    .first();
  const tagOption = page.getByTestId(tagTestId).first();
  const tagSearchResponse = page
    .waitForResponse(
      (response) =>
        response.url().includes('/api/v1/search/query') &&
        response.url().includes('tag_search_index'),
      { timeout: 5000 }
    )
    .catch(() => null);

  logTaskDebug('selectTagSuggestion:start', searchText, tagTestId);
  if (!(await tagsInput.isVisible().catch(() => false))) {
    await tagSelector.click({ force: true }).catch(() => undefined);
  }

  await expect(tagsInput).toBeVisible({ timeout: 5000 });
  await tagsInput.click().catch(() => undefined);
  await tagsInput.fill(searchText);
  logTaskDebug('selectTagSuggestion:filled', searchText);

  await Promise.race([
    tagSearchResponse,
    tagOption.waitFor({ state: 'visible', timeout: 5000 }),
  ]).catch(() => undefined);

  await expect(tagOption).toBeVisible({ timeout: 5000 });
  logTaskDebug('selectTagSuggestion:optionVisible', tagTestId);
  await tagOption.click();
  await page.keyboard.press('Escape');
  logTaskDebug('selectTagSuggestion:done', tagTestId);
};

const clickDropdownMenuItem = async ({
  dropdown,
  page,
  menuPattern,
}: {
  dropdown: Locator;
  page: Page;
  menuPattern: RegExp;
}) => {
  const dropdownTrigger = getDropdownTrigger(dropdown);
  const visibleDropdownMenu = page.locator('.task-action-dropdown').last();
  const roleMenuItem = page.getByRole('menuitem', { name: menuPattern }).first();
  const cssMenuItem = visibleDropdownMenu
    .locator('.ant-dropdown-menu-item')
    .filter({ hasText: menuPattern })
    .first();

  const isMenuItemVisible = async () =>
    (await roleMenuItem.isVisible().catch(() => false)) ||
    (await cssMenuItem.isVisible().catch(() => false));

  await expect(dropdownTrigger).toBeVisible();
  await dropdownTrigger.scrollIntoViewIfNeeded().catch(() => undefined);

  for (let attempt = 0; attempt < 3; attempt++) {
    logTaskDebug('clickDropdownMenuItem:openAttempt', attempt + 1);
    await dropdownTrigger.click().catch(() => undefined);

    if (await isMenuItemVisible()) {
      break;
    }

    await dropdownTrigger.focus().catch(() => undefined);
    await dropdownTrigger.press('ArrowDown').catch(() => undefined);

    if (await isMenuItemVisible()) {
      break;
    }

    await dropdownTrigger.press('Enter').catch(() => undefined);

    if (await isMenuItemVisible()) {
      break;
    }

    await dropdown
      .locator('button')
      .last()
      .click()
      .catch(() => undefined);

    if (await isMenuItemVisible()) {
      break;
    }
  }

  if (await roleMenuItem.isVisible().catch(() => false)) {
    await roleMenuItem.click({ force: true });

    return;
  }

  await expect(cssMenuItem).toBeVisible();
  await cssMenuItem.click({ force: true });
};

export const formatTaskFieldValue = (value: string) => {
  return value;
};

export const getTaskDisplayId = (taskId?: string) => {
  if (!taskId) {
    return '';
  }

  const matchedTaskId = /^TASK-0*([0-9]+)$/.exec(taskId);

  return matchedTaskId?.[1] ?? taskId;
};

export const buildTaskRoute = ({
  action,
  entityType,
  fqn,
  field,
  value,
}: {
  action: TaskRouteAction;
  entityType: string;
  fqn: string;
  field?: string;
  value?: string;
}) => {
  const params = new URLSearchParams();

  if (field && value) {
    params.set('field', field);
    params.set('value', formatTaskFieldValue(value));
  }

  const queryString = params.toString();

  return `/${action}/${entityType}/${encodeURIComponent(fqn)}${
    queryString ? `?${queryString}` : ''
  }`;
};

export const openTaskForm = async (page: Page, route: string) => {
  await page.goto(route);
  await page.waitForSelector('[data-testid="form-container"]', {
    state: 'visible',
  });
};

export const selectAssignee = async (page: Page, assigneeName: string) => {
  const assigneeInput = page.locator(
    '[data-testid="select-assignee"] .ant-select-selection-search input'
  );

  await assigneeInput.click();

  const userSearchResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/search/query') &&
      (response.url().includes('user_search_index') ||
        response.url().includes('team_search_index'))
  );

  await assigneeInput.fill(assigneeName);
  await userSearchResponse;

  const assigneeOption = page.getByTestId(assigneeName).first();
  await expect(assigneeOption).toBeVisible();
  await assigneeOption.click();
  await clickOutside(page);
};

export const createDescriptionTaskFromForm = async ({
  page,
  assigneeName,
  description,
}: {
  page: Page;
  assigneeName: string;
  description?: string;
}): Promise<CreatedTask> => {
  await selectAssignee(page, assigneeName);

  if (description) {
    await page.locator(descriptionBox).clear();
    await page.locator(descriptionBox).fill(description);
  }

  const taskCreateResponse = waitForTaskCreateResponse(page);
  await page.getByTestId('submit-btn').click();
  const response = await taskCreateResponse;

  await page.waitForLoadState('networkidle');
  await waitForAllLoadersToDisappear(page);

  return (await response.json()) as CreatedTask;
};

export const addTagSuggestion = async ({
  page,
  searchText,
  tagTestId,
}: {
  page: Page;
  searchText: string;
  tagTestId: string;
}) => {
  await selectTagSuggestion({
    page,
    root: page,
    searchText,
    tagTestId,
  });
};

export const createTagTaskFromForm = async ({
  page,
  assigneeName,
  searchText,
  tagTestId,
}: {
  page: Page;
  assigneeName: string;
  searchText?: string;
  tagTestId?: string;
}): Promise<CreatedTask> => {
  logTaskDebug('createTagTaskFromForm:start');
  await selectAssignee(page, assigneeName);
  logTaskDebug('createTagTaskFromForm:assigneeSelected', assigneeName);

  if (searchText && tagTestId) {
    await addTagSuggestion({ page, searchText, tagTestId });
  }

  const taskCreateResponse = waitForTaskCreateResponse(page);
  await page.getByTestId('submit-tag-request').click();
  const response = await taskCreateResponse;

  await page.waitForLoadState('networkidle');
  await waitForAllLoadersToDisappear(page);
  logTaskDebug('createTagTaskFromForm:done');

  return (await response.json()) as CreatedTask;
};

export const openEntityTasksTab = async (page: Page) => {
  logTaskDebug('openEntityTasksTab:start');
  const activityFeedTab = page.getByTestId('activity_feed');

  if (await activityFeedTab.isVisible().catch(() => false)) {
    await activityFeedTab.click();
    await page.waitForLoadState('networkidle');
  }

  const menuItemTaskTab = page.getByRole('menuitem', { name: /tasks/i });
  const buttonTaskTab = page.getByRole('button', { name: /tasks/i });

  if (await menuItemTaskTab.isVisible().catch(() => false)) {
    const taskListResponse = waitForTaskListResponse(page);
    await menuItemTaskTab.click();
    await taskListResponse.catch(() => undefined);
  } else if (await buttonTaskTab.isVisible().catch(() => false)) {
    const taskListResponse = waitForTaskListResponse(page);
    await buttonTaskTab.click();
    await taskListResponse.catch(() => undefined);
  }

  await page.waitForLoadState('networkidle');
  await waitForAllLoadersToDisappear(page);
  logTaskDebug('openEntityTasksTab:done');
};

export const getTaskCard = (page: Page, task: CreatedTask) => {
  const taskDisplayId = getTaskDisplayId(task.taskId);

  return page
    .locator(TASK_CARD_SELECTOR)
    .filter({ hasText: `#${taskDisplayId}` })
    .first();
};

export const openTaskDetails = async (page: Page, task: CreatedTask) => {
  const taskCard = getTaskCard(page, task);
  logTaskDebug('openTaskDetails:waitingForCard', task.taskId);
  await expect(taskCard).toBeVisible({ timeout: 15000 });
  logTaskDebug('openTaskDetails:click', task.taskId);
  await taskCard.click();
  await expect(page.locator(TASK_TAB_SELECTOR)).toBeVisible();
  logTaskDebug('openTaskDetails:done', task.taskId);
};

export const openTaskEditModal = async (page: Page) => {
  logTaskDebug('openTaskEditModal:start');
  const visibleTaskModal = page.locator(VISIBLE_TASK_MODAL_SELECTOR).first();
  const addSuggestionDropdown = page
    .locator('#task-panel [data-testid="add-close-task-dropdown"]')
    .first();
  const editSuggestionDropdown = page
    .locator('#task-panel [data-testid="edit-accept-task-dropdown"]')
    .first();

  const waitForVisibleTaskModal = async () => {
    await visibleTaskModal.waitFor({ state: 'visible', timeout: 5000 }).catch(
      () => undefined
    );

    return visibleTaskModal.isVisible().catch(() => false);
  };

  if (await visibleTaskModal.isVisible().catch(() => false)) {
    logTaskDebug('openTaskEditModal:alreadyVisible');
    return;
  }

  if (await addSuggestionDropdown.isVisible().catch(() => false)) {
    logTaskDebug('openTaskEditModal:addSuggestionDropdown');
    const primaryActionButton = addSuggestionDropdown.locator('button').first();

    await primaryActionButton.scrollIntoViewIfNeeded().catch(() => undefined);
    await primaryActionButton.click().catch(() => undefined);

    if (!(await waitForVisibleTaskModal())) {
      await clickDropdownMenuItem({
        dropdown: addSuggestionDropdown,
        page,
        menuPattern: /add description|add tags/i,
      });
    }
  } else if (await editSuggestionDropdown.isVisible().catch(() => false)) {
    logTaskDebug('openTaskEditModal:editSuggestionDropdown');
    await clickDropdownMenuItem({
      dropdown: editSuggestionDropdown,
      page,
      menuPattern: /edit suggestion|edit/i,
    });
  }

  await expect(visibleTaskModal).toBeVisible();
  logTaskDebug('openTaskEditModal:done');
};

export const saveTaskEditModal = async (page: Page) => {
  logTaskDebug('saveTaskEditModal:start');
  const taskResolveResponse = waitForTaskResolveResponse(page);
  await page
    .locator(VISIBLE_TASK_MODAL_SELECTOR)
    .first()
    .getByRole('button', { name: /save|ok/i })
    .click();
  await taskResolveResponse;
  await page.waitForLoadState('networkidle');
  logTaskDebug('saveTaskEditModal:done');
};

export const editDescriptionAndAccept = async (
  page: Page,
  updatedDescription: string
) => {
  logTaskDebug('editDescriptionAndAccept:start');
  await openTaskEditModal(page);
  logTaskDebug('editDescriptionAndAccept:modalOpen');
  await page
    .locator(VISIBLE_TASK_MODAL_SELECTOR)
    .first()
    .locator(descriptionBox)
    .clear();
  logTaskDebug('editDescriptionAndAccept:cleared');
  await page
    .locator(VISIBLE_TASK_MODAL_SELECTOR)
    .first()
    .locator(descriptionBox)
    .fill(updatedDescription);
  logTaskDebug('editDescriptionAndAccept:filled');
  await saveTaskEditModal(page);
  logTaskDebug('editDescriptionAndAccept:done');
};

export const editTagsAndAccept = async ({
  page,
  searchText,
  tagTestId,
}: {
  page: Page;
  searchText: string;
  tagTestId: string;
}) => {
  logTaskDebug('editTagsAndAccept:start');
  await openTaskEditModal(page);
  await selectTagSuggestion({
    page,
    root: page.locator(VISIBLE_TASK_MODAL_SELECTOR).first(),
    searchText,
    tagTestId,
  });
  await saveTaskEditModal(page);
  logTaskDebug('editTagsAndAccept:done');
};

export const addCommentToTask = async (page: Page, comment: string) => {
  logTaskDebug('addCommentToTask:start');
  const taskPanel = page.locator(TASK_PANEL_SELECTOR);
  const commentInput = taskPanel.getByTestId('comments-input-field');
  const editor = taskPanel.locator('[data-testid="editor-wrapper"] .ql-editor');

  if (!(await editor.isVisible().catch(() => false))) {
    await expect(commentInput).toBeVisible({ timeout: 5000 });
    await commentInput.scrollIntoViewIfNeeded().catch(() => undefined);
    logTaskDebug('addCommentToTask:openingEditor');
    await commentInput.click({ force: true }).catch(() => undefined);

    if (!(await editor.isVisible().catch(() => false))) {
      await commentInput.press('Enter').catch(() => undefined);
    }
  }

  await expect(editor).toBeVisible({ timeout: 5000 });
  logTaskDebug('addCommentToTask:editorVisible');
  await editor.click({ force: true });
  await editor.type(comment);
  logTaskDebug('addCommentToTask:commentEntered');

  const taskCommentResponse = waitForTaskCommentResponse(page);
  const sendButton = taskPanel.getByTestId('send-button');
  await expect(sendButton).toBeEnabled({ timeout: 5000 });
  logTaskDebug('addCommentToTask:sendButtonEnabled');
  await sendButton.click();
  logTaskDebug('addCommentToTask:submit');
  await taskCommentResponse;
  await page.waitForLoadState('networkidle');
  logTaskDebug('addCommentToTask:done');
};

export const closeTaskFromDetails = async (page: Page) => {
  logTaskDebug('closeTaskFromDetails:start');
  const taskPanel = page.locator(TASK_PANEL_SELECTOR);
  const closeButton = taskPanel.getByTestId('close-button');

  if (await closeButton.isVisible().catch(() => false)) {
    const taskActionResponse = waitForTaskActionResponse(page);
    await closeButton.click();
    await taskActionResponse;
    logTaskDebug('closeTaskFromDetails:closeButtonDone');

    return;
  }

  const dropdown = taskPanel
    .locator(
      '[data-testid="edit-accept-task-dropdown"], [data-testid="add-close-task-dropdown"]'
    )
    .first();
  const trigger = getDropdownTrigger(dropdown);

  await expect(trigger).toBeVisible();
  logTaskDebug('closeTaskFromDetails:dropdown');
  await trigger.click();
  const taskActionResponse = waitForTaskActionResponse(page);
  await page.getByRole('menuitem', { name: /close/i }).click();
  await taskActionResponse;
  await page.waitForLoadState('networkidle');
  logTaskDebug('closeTaskFromDetails:done');
};
