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

import {
  APIRequestContext,
  expect,
  Locator,
  Page,
  test as base,
} from '@playwright/test';
import { SidebarItem } from '../../constant/sidebar';
import { Domain } from '../../support/domain/Domain';
import { performAdminLogin } from '../../utils/admin';
import { redirectToHomePage, uuid } from '../../utils/common';
import { selectDataProduct, selectDomain } from '../../utils/domain';
import { sidebarClick } from '../../utils/sidebar';

const LONG_DESCRIPTION = [
  '# Overview',
  '',
  'This is a comprehensive description that spans multiple paragraphs and sections.',
  'It contains detailed information about the entity to test scroll and visibility behavior.',
  'The purpose of this document is to provide enough content to push the lower sections',
  'well below the visible viewport area so that scrolling is required to reach them.',
  '',
  '## Key Features',
  '',
  '- Feature one: Provides data ingestion capabilities from various sources including databases, APIs, and file systems',
  '- Feature two: Supports multiple data source connectors and integrations with third-party tools',
  '- Feature three: Enables real-time data processing and streaming with low latency guarantees',
  '- Feature four: Offers comprehensive monitoring and alerting for pipeline health and data quality',
  '- Feature five: Includes automated data quality checks and validations at every stage',
  '- Feature six: Provides detailed lineage tracking across all data transformations',
  '- Feature seven: Supports role-based access control for fine-grained security',
  '- Feature eight: Enables automated metadata extraction and classification',
  '- Feature nine: Provides comprehensive audit logging for compliance requirements',
  '- Feature ten: Supports custom metadata annotations and tagging workflows',
  '',
  '## Technical Details',
  '',
  'The system processes data through a multi-stage pipeline that includes',
  'extraction, transformation, and loading phases. Each phase is carefully',
  'monitored and validated to ensure data integrity and consistency.',
  'The pipeline supports both batch and streaming modes of operation.',
  '',
  '### Architecture',
  '',
  'The architecture follows a microservices pattern with dedicated services',
  'for each processing stage. Communication between services uses event-driven',
  'messaging patterns for reliable data delivery. The system is designed to',
  'scale horizontally to handle increasing data volumes.',
  '',
  '### Data Model',
  '',
  '| Column | Type | Description |',
  '|--------|------|-------------|',
  '| id | UUID | Primary identifier for each record |',
  '| name | VARCHAR(255) | Human-readable entity name |',
  '| description | TEXT | Detailed description of the entity |',
  '| created_at | TIMESTAMP | Record creation timestamp |',
  '| updated_at | TIMESTAMP | Last modification timestamp |',
  '| created_by | VARCHAR(255) | User who created the record |',
  '| status | ENUM | Current status of the entity |',
  '| version | FLOAT | Schema version number |',
  '',
  '## Integration Points',
  '',
  'The system integrates with multiple external services and platforms:',
  '',
  '### Database Connectors',
  '',
  'Supported databases include PostgreSQL, MySQL, Oracle, SQL Server,',
  'Snowflake, BigQuery, Redshift, and Databricks. Each connector provides',
  'full metadata extraction including schemas, tables, columns, and relationships.',
  '',
  '### API Integrations',
  '',
  'RESTful APIs are available for all major operations. The API supports',
  'pagination, filtering, and sorting. Authentication uses JWT tokens',
  'with configurable expiration and refresh mechanisms.',
  '',
  '### Event System',
  '',
  'The event system publishes notifications for all metadata changes.',
  'Consumers can subscribe to specific entity types or change types.',
  'Events are delivered with at-least-once semantics and include',
  'full change details for downstream processing.',
  '',
  '## Operational Guidelines',
  '',
  'This section covers the operational procedures and best practices',
  'for managing and maintaining the system in production environments.',
  '',
  '### Deployment',
  '',
  'The system supports containerized deployment using Docker and Kubernetes.',
  'Helm charts are provided for standard deployment configurations.',
  'Rolling updates ensure zero-downtime deployments.',
  '',
  '### Monitoring',
  '',
  'Key metrics are exposed via Prometheus endpoints. Pre-built Grafana',
  'dashboards provide visibility into pipeline health, throughput,',
  'error rates, and resource utilization.',
  '',
  '### Backup and Recovery',
  '',
  'Automated daily backups are configured by default. Point-in-time',
  'recovery is supported for the metadata database. Backup retention',
  'policy is configurable based on organizational requirements.',
  '',
  '## Usage Guidelines',
  '',
  'Users should follow the documented procedures when modifying this entity.',
  'All changes must go through the standard review process before deployment.',
  'Documentation must be updated alongside any structural changes.',
  '',
  '### Access Control',
  '',
  'Access is managed through role-based permissions. Contact the data team',
  'for access requests. Review cycles occur on a weekly basis.',
].join('\n');

const LATE_CONTENT_TEXT = 'Access is managed through role-based permissions';

/**
 * Verifies that the end-of-description content is below the fold,
 * requires scrolling to reach, and is visible in the viewport after scrolling.
 * Use for Domain where full content is always rendered and guaranteed to overflow.
 */
async function verifyDescriptionRequiresScroll(
  container: Locator,
  page: Page
) {
  const lateContent = container.getByText(LATE_CONTENT_TEXT);

  await expect(lateContent).toBeAttached();

  // End of description must be below the fold before scroll
  await expect(lateContent).not.toBeInViewport();

  await lateContent.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  // Reachable after scroll
  await expect(lateContent).toBeInViewport();
}

/**
 * Verifies that the end-of-description content is in the DOM and reachable
 * (visible in viewport after scrolling if needed).
 * Use for Data Product where expanded content may or may not exceed the viewport.
 */
async function verifyEndOfDescriptionReachable(
  container: Locator,
  page: Page
) {
  const lateContent = container.getByText(LATE_CONTENT_TEXT);

  await expect(lateContent).toBeAttached();

  // Scroll if needed (no-op if already in viewport)
  await lateContent.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  // Must be reachable and visible in the viewport
  await expect(lateContent).toBeInViewport();
}

const test = base.extend<{
  page: Page;
}>({
  page: async ({ browser }, use) => {
    const { page } = await performAdminLogin(browser);
    await use(page);
    await page.close();
  },
});

test.describe('Domain and Data Product Long Description Visibility', () => {
  test.slow(true);

  let domain: Domain;
  let dataProductData: {
    name: string;
    displayName: string;
    fullyQualifiedName: string;
  };
  let adminApiContext: APIRequestContext;
  let afterActionFn: () => Promise<void>;

  test.beforeAll(
    'Setup domain and data product with long descriptions',
    async ({ browser }) => {
      const { apiContext, afterAction } = await performAdminLogin(browser);
      adminApiContext = apiContext;
      afterActionFn = afterAction;

      const id = uuid();

      domain = new Domain({
        name: `PW_Domain_LongDesc_${id}`,
        displayName: `PW Domain LongDesc ${id}`,
        description: LONG_DESCRIPTION,
        domainType: 'Aggregate',
        fullyQualifiedName: `PW_Domain_LongDesc_${id}`,
      });
      await domain.create(apiContext);

      const dpName = `PW_DataProduct_LongDesc_${id}`;
      const dpResponse = await apiContext.post('/api/v1/dataProducts', {
        data: {
          name: dpName,
          displayName: `PW Data Product LongDesc ${id}`,
          description: LONG_DESCRIPTION,
          domains: [domain.responseData.fullyQualifiedName],
        },
      });
      dataProductData = await dpResponse.json();
    }
  );

  test.afterAll('Cleanup', async () => {
    await adminApiContext.delete(
      `/api/v1/dataProducts/name/${encodeURIComponent(
        dataProductData.fullyQualifiedName
      )}`
    );
    await domain.delete(adminApiContext);
    await afterActionFn();
  });

  test('Domain long description is scrollable and end of text is visible after scroll', async ({
    page,
  }) => {
    await redirectToHomePage(page);
    await sidebarClick(page, SidebarItem.DOMAIN);
    await selectDomain(page, domain.responseData);

    const descContainer = page.getByTestId('asset-description-container');
    await expect(descContainer).toBeVisible();
    await expect(page.getByTestId('viewer-container')).toBeVisible();

    // Domain should NOT show a read-more button (full text always rendered)
    await expect(page.getByTestId('read-more-button')).not.toBeVisible();

    // End of description is below the fold, scroll to it, verify it becomes visible
    await verifyDescriptionRequiresScroll(descContainer, page);
  });

  test('Domain description card collapse hides content and expand restores scrollability', async ({
    page,
  }) => {
    await redirectToHomePage(page);
    await sidebarClick(page, SidebarItem.DOMAIN);
    await selectDomain(page, domain.responseData);

    const descContainer = page.getByTestId('asset-description-container');
    await expect(descContainer).toBeVisible();
    await expect(descContainer).toHaveClass(/\bexpanded\b/);

    // Collapse the card — 'expanded' class is removed, body gets height: 0
    await descContainer.locator('.expand-collapse-icon').click();
    await expect(descContainer).not.toHaveClass(/\bexpanded\b/);

    // Expand the card again
    await descContainer.locator('.expand-collapse-icon').click();
    await expect(descContainer).toHaveClass(/\bexpanded\b/);

    // After re-expanding, end content is still reachable via scroll
    await verifyDescriptionRequiresScroll(descContainer, page);
  });

  test('Data Product truncates long description and end of text is not visible before expand', async ({
    page,
  }) => {
    await redirectToHomePage(page);
    await sidebarClick(page, SidebarItem.DATA_PRODUCT);
    await selectDataProduct(page, dataProductData);
    await page.waitForLoadState('networkidle');

    const descContainer = page.getByTestId('asset-description-container');
    await expect(descContainer).toBeVisible();

    // Read-more button should be present (description is truncated)
    await expect(
      descContainer.getByTestId('read-more-button')
    ).toBeVisible();

    // End-of-description text should NOT be visible (truncated away)
    await expect(
      descContainer.getByText(LATE_CONTENT_TEXT)
    ).not.toBeVisible();
  });

  test('Data Product long description is scrollable and end of text is visible after expanding', async ({
    page,
  }) => {
    await redirectToHomePage(page);
    await sidebarClick(page, SidebarItem.DATA_PRODUCT);
    await selectDataProduct(page, dataProductData);
    await page.waitForLoadState('networkidle');

    const descContainer = page.getByTestId('asset-description-container');
    await expect(descContainer).toBeVisible();

    // Expand the truncated description
    await descContainer.getByTestId('read-more-button').click();

    // End of description should be reachable after expanding (scroll if needed)
    await verifyEndOfDescriptionReachable(descContainer, page);

    // Read-less button should be visible
    await expect(
      descContainer.getByTestId('read-less-button')
    ).toBeVisible();

    // Collapse back and verify end text is hidden again
    await descContainer.getByTestId('read-less-button').click();
    await expect(
      descContainer.getByText(LATE_CONTENT_TEXT)
    ).not.toBeVisible();
    await expect(
      descContainer.getByTestId('read-more-button')
    ).toBeVisible();
  });

  test('Data Product description card collapse hides content and expand restores it', async ({
    page,
  }) => {
    await redirectToHomePage(page);
    await sidebarClick(page, SidebarItem.DATA_PRODUCT);
    await selectDataProduct(page, dataProductData);
    await page.waitForLoadState('networkidle');

    const descContainer = page.getByTestId('asset-description-container');
    await expect(descContainer).toBeVisible();
    await expect(descContainer).toHaveClass(/\bexpanded\b/);

    // Collapse — 'expanded' class is removed, body gets height: 0
    await descContainer.locator('.expand-collapse-icon').click();
    await expect(descContainer).not.toHaveClass(/\bexpanded\b/);

    // Expand
    await descContainer.locator('.expand-collapse-icon').click();
    await expect(descContainer).toHaveClass(/\bexpanded\b/);
  });
});
