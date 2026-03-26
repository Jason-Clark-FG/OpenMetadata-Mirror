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

import { expect, test } from '@playwright/test';
import { TableClass } from '../../../support/entity/TableClass';
import { AdminClass } from '../../../support/user/AdminClass';
import {
  getApiContext,
  redirectToHomePage,
  uuid,
} from '../../../utils/common';
import { waitForAllLoadersToDisappear } from '../../../utils/entity';

type TaskFormSchema = {
  id?: string;
  name: string;
  displayName?: string;
  taskType: string;
  taskCategory: string;
  formSchema: Record<string, unknown>;
  uiSchema?: Record<string, unknown>;
  version?: number;
};

type CreatedTask = {
  id: string;
  taskId: string;
  status?: string;
};

test.use({ storageState: 'playwright/.auth/admin.json' });

test.describe.serial('Task Custom Form Workflow', () => {
  test('renders and resolves a schema-driven custom task end to end', async ({
    page,
  }) => {
    test.setTimeout(90000);

    const proposedDescription = `Playwright proposed description ${uuid()}`;
    const updatedDescription = `Playwright updated description ${uuid()}`;
    const initialReviewNotes = `Initial review notes ${uuid()}`;
    const updatedReviewNotes = `Updated review notes ${uuid()}`;
    const admin = new AdminClass();
    const table = new TableClass();
    let taskId: string | undefined;
    let schemaToRestore: TaskFormSchema | undefined;
    let createdSchemaId: string | undefined;

    await admin.login(page);
    await redirectToHomePage(page);

    const { apiContext, afterAction } = await getApiContext(page);

    try {
      await table.create(apiContext);

      const schemaListResponse = await apiContext.get(
        `/api/v1/taskFormSchemas?taskType=CustomTask&taskCategory=Custom&limit=1&include=all`
      );
      expect(schemaListResponse.ok()).toBeTruthy();

      const schemaListPayload = await schemaListResponse.json();
      const existingSchema = schemaListPayload.data?.[0] as
        | TaskFormSchema
        | undefined;

      const updatedSchema: TaskFormSchema = {
        ...(existingSchema ?? {
          name: `CustomTaskSchema${uuid()}`,
          taskType: 'CustomTask',
          taskCategory: 'Custom',
        }),
        displayName: 'Playwright Custom Task Form',
        formSchema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            targetField: {
              type: 'string',
              title: 'Target Field',
            },
            proposedText: {
              type: 'string',
              title: 'Proposed Text',
            },
            reviewNotes: {
              type: 'string',
              title: 'Review Notes',
            },
          },
          required: ['targetField', 'proposedText'],
        },
        uiSchema: {
          'ui:handler': {
            type: 'descriptionUpdate',
            permission: 'EDIT_DESCRIPTION',
            fieldPathField: 'targetField',
            valueField: 'proposedText',
          },
          'ui:editablePayload': {
            fieldPathField: 'targetField',
            editedValueField: 'proposedText',
          },
          'ui:resolution': {
            mode: 'payload',
          },
          'ui:execution': {
            approve: {
              actions: [
                {
                  type: 'setDescription',
                  fieldPathField: 'targetField',
                  valueField: 'proposedText',
                },
              ],
            },
            reject: {
              actions: [],
            },
          },
          'ui:order': ['proposedText', 'reviewNotes', 'targetField'],
          targetField: {
            'ui:widget': 'hidden',
          },
          proposedText: {
            'ui:widget': 'textarea',
          },
          reviewNotes: {
            'ui:widget': 'textarea',
          },
        },
      };

      if (existingSchema?.id) {
        schemaToRestore = existingSchema;
        const updateSchemaResponse = await apiContext.put('/api/v1/taskFormSchemas', {
          data: updatedSchema,
        });
        expect(updateSchemaResponse.ok()).toBeTruthy();
      } else {
        const createSchemaResponse = await apiContext.post('/api/v1/taskFormSchemas', {
          data: updatedSchema,
        });
        expect(createSchemaResponse.ok()).toBeTruthy();
        const createdSchema = await createSchemaResponse.json();
        createdSchemaId = createdSchema.id;
      }

      const createTaskResponse = await apiContext.post('/api/v1/tasks', {
        data: {
          name: `pw-custom-task-${uuid()}`,
          description: 'Playwright custom task form workflow',
          category: 'Custom',
          type: 'CustomTask',
          about: table.entityResponseData.fullyQualifiedName,
          aboutType: 'table',
          assignees: ['admin'],
          payload: {
            targetField: 'description',
            proposedText: proposedDescription,
            reviewNotes: initialReviewNotes,
          },
        },
      });
      expect(createTaskResponse.ok()).toBeTruthy();

      const createdTask = (await createTaskResponse.json()) as CreatedTask;
      taskId = createdTask.id;

      await table.visitEntityPage(page);
      await page.getByTestId('activity_feed').click();
      await waitForAllLoadersToDisappear(page);
      await page.getByRole('menuitem', { name: /tasks/i }).click();
      await waitForAllLoadersToDisappear(page);
      await expect(page.locator('[data-testid="task-feed-card"]').first()).toBeVisible();
      await page.locator('[data-testid="task-feed-card"]').first().click();
      await expect(page.getByTestId('task-tab')).toBeVisible();
      await expect(page.getByTestId('task-payload-details')).toContainText(
        proposedDescription
      );
      await expect(page.getByTestId('task-payload-details')).toContainText(
        initialReviewNotes
      );

      await page.getByTestId('edit-accept-task-action-trigger').click();
      await page.getByTestId('task-action-menu-item-edit').click();

      const visibleModal = page.getByRole('dialog').first();
      await expect(visibleModal).toBeVisible();
      await visibleModal.getByRole('textbox').nth(0).fill(updatedDescription);
      await visibleModal.getByRole('textbox').nth(1).fill(updatedReviewNotes);

      const resolveTaskResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/v1/tasks/${taskId}/resolve`) &&
          response.request().method() === 'POST' &&
          response.ok()
      );

      await visibleModal.getByRole('button', { name: /^ok$/i }).click();
      await resolveTaskResponse;

      await expect
        .poll(
          async () => {
            const updatedTableResponse = await apiContext.get(
              `/api/v1/tables/${table.entityResponseData.id}`
            );

            if (!updatedTableResponse.ok()) {
              return null;
            }

            const updatedTable = await updatedTableResponse.json();

            return updatedTable.description ?? null;
          },
          {
            timeout: 15000,
            intervals: [500, 1000, 2000],
          }
        )
        .toBe(updatedDescription);

      const resolvedTaskResponse = await apiContext.get(`/api/v1/tasks/${taskId}`);
      expect(resolvedTaskResponse.ok()).toBeTruthy();
      const resolvedTask = await resolvedTaskResponse.json();

      expect(resolvedTask.status).not.toBe('Open');
    } finally {
      if (taskId) {
        await apiContext.delete(`/api/v1/tasks/${taskId}?hardDelete=true`).catch(() => null);
      }

      if (table.entityResponseData?.id) {
        await table.delete(apiContext).catch(() => null);
      }

      if (schemaToRestore) {
        await apiContext.put('/api/v1/taskFormSchemas', {
          data: schemaToRestore,
        }).catch(() => null);
      } else if (createdSchemaId) {
        await apiContext
          .delete(`/api/v1/taskFormSchemas/${createdSchemaId}?hardDelete=true&recursive=true`)
          .catch(() => null);
      }

      await afterAction();
    }
  });
});
