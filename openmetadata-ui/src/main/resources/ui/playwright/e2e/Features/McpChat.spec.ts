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

import test, { expect, Page } from '@playwright/test';

async function loginAsAdmin(page: Page) {
  await page.goto('/');
  await page.waitForURL('**/signin');
  await page.locator('[id="email"]').fill('admin@open-metadata.org');
  await page.locator('[id="password"]').fill('admin');
  const loginRes = page.waitForResponse('/api/v1/auth/login');
  await page.getByTestId('login').click();
  await loginRes;
  await page.waitForURL('**/my-data');
}

test.describe('MCP Chat Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should navigate to MCP Chat page and render the UI', async ({
    page,
  }) => {
    await page.goto('/mcp-chat');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('new-chat-button')).toBeVisible();
    await expect(page.getByTestId('mcp-chat-input')).toBeVisible();

    const sendButton = page.getByTestId('mcp-send-button');
    await expect(sendButton).toBeVisible();
    await expect(sendButton).toBeDisabled();
  });

  test('should enable send button when input has text', async ({ page }) => {
    await page.goto('/mcp-chat');
    await page.waitForLoadState('networkidle');

    const input = page
      .getByTestId('mcp-chat-input')
      .locator('textarea')
      .first();
    const sendButton = page.getByTestId('mcp-send-button');

    await expect(sendButton).toBeDisabled();
    await input.fill('Hello, test message');
    await expect(sendButton).toBeEnabled();
  });

  test('should show inline error when MCP is not enabled (503)', async ({
    page,
  }) => {
    await page.goto('/mcp-chat');
    await page.waitForLoadState('networkidle');

    const input = page
      .getByTestId('mcp-chat-input')
      .locator('textarea')
      .first();
    const sendButton = page.getByTestId('mcp-send-button');

    const testMessage = 'Test message for disabled MCP';
    await input.fill(testMessage);

    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/v1/mcp-client/chat') &&
        resp.request().method() === 'POST'
    );

    await sendButton.click();

    const response = await responsePromise;

    // Backend returns 503 (MCP disabled) or 500 (other server error)
    expect(response.status()).toBeGreaterThanOrEqual(500);

    // Verify the inline error alert appears
    const errorAlert = page.getByTestId('mcp-chat-error');
    await expect(errorAlert).toBeVisible({ timeout: 5000 });

    // Verify the error message has content
    const alertText = await errorAlert.textContent();
    expect(alertText?.length).toBeGreaterThan(0);

    // Verify the input retains the user's message
    const inputValue = await input.inputValue();
    expect(inputValue).toBe(testMessage);

    // Verify dismissing the error works
    await errorAlert.locator('button[title="Close"]').click();
    await expect(errorAlert).not.toBeVisible();
  });
});
