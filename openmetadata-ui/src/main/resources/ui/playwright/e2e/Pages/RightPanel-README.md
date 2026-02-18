# Right Panel Testing Framework

This document explains how to use the Right Panel testing framework across different pages in OpenMetadata.

## Overview

The Right Panel (Entity Summary Panel) appears in multiple contexts:
- **Explore Page**: When browsing entities in the explore view
- **Entity Details Page**: When viewing a specific entity's full page
- **Lineage Page**: When viewing lineage graphs
- **Service Details Page**: When viewing service configurations

This framework provides reusable utilities to test the Right Panel consistently across all these contexts.

## Architecture

### Core Components

1. **Page Objects** (`PageObject/Explore/`)
   - `RightPanelPageObject.ts` - Main panel orchestrator
   - `OverviewPageObject.ts` - Overview tab (description, owners, tags, etc.)
   - `SchemaPageObject.ts` - Schema/fields tab
   - `LineagePageObject.ts` - Lineage visualization tab
   - `DataQualityPageObject.ts` - Data Quality tab
   - `CustomPropertiesPageObject.ts` - Custom Properties tab

2. **Test Orchestrator** (`Utils/RightPanelTestSuite.ts`)
   - Coordinates testing across all tabs
   - Provides CRUD operation helpers
   - Supports role-based testing
   - Handles page context awareness

3. **Helper Functions** (`Utils/RightPanelTestHelpers.ts`)
   - Quick test runners for different page contexts
   - Convenience functions for common test scenarios

## Quick Start

### Basic Usage - Explore Page

```typescript
import { test } from '../support/fixtures/userPages';
import { createRightPanelTestSuite } from '../Utils/RightPanelTestHelpers';
import { TableClass } from '../support/entity/TableClass';
import { PageContext } from '../PageObject/Explore/RightPanelPageObject';

test('Should test Right Panel on Explore page', async ({ adminPage }) => {
  const table = new TableClass();
  await table.create(apiContext);

  // Navigate to entity on Explore page
  await navigateToExploreAndSelectEntity(adminPage, table.entity.name, table.endpoint, fqn);

  // Create test suite
  const testSuite = createRightPanelTestSuite(adminPage, table, PageContext.EXPLORE);

  // Run all standard tests
  await testSuite.runStandardTestSuite();
});
```

### Usage - Entity Details Page

```typescript
import { runRightPanelTestsForEntityDetailsPage } from '../Utils/RightPanelTestHelpers';

test('Should test Right Panel on Entity Details page', async ({ adminPage }) => {
  const table = new TableClass();
  await table.create(apiContext);

  // Navigate to entity's full page
  await table.visitEntityPage(adminPage);

  // Run all tests for Entity Details context
  await runRightPanelTestsForEntityDetailsPage(adminPage, table);
});
```

### Usage - Lineage Page

```typescript
import { runRightPanelTestsForLineagePage } from '../Utils/RightPanelTestHelpers';

test('Should test Right Panel on Lineage page', async ({ adminPage }) => {
  const table = new TableClass();
  await table.create(apiContext);

  // Navigate to lineage page
  await adminPage.goto(`/table/${table.entityResponseData.fullyQualifiedName}/lineage`);

  // Run lineage-focused tests
  await runRightPanelTestsForLineagePage(adminPage, table);
});
```

## Advanced Usage

### Testing Specific Tabs Only

```typescript
const testSuite = createRightPanelTestSuite(adminPage, table);

await testSuite.runStandardTestSuite({
  onlyTabs: ['overview', 'schema'],  // Test only these tabs
});
```

### Skipping Specific Tabs

```typescript
await testSuite.runStandardTestSuite({
  skipTabs: ['data quality', 'custom property'],  // Skip these tabs
});
```

### Testing CRUD Operations

```typescript
import { testRightPanelCRUDOperations } from '../Utils/RightPanelTestHelpers';

await testRightPanelCRUDOperations(adminPage, table, {
  description: 'Test description',
  ownerName: 'John Doe',
  tagName: 'PII.Sensitive',
  glossaryTermName: 'Customer Data',
  tierName: 'Tier1',
  domainName: 'Marketing',
});
```

### Multi-Role Testing

```typescript
import { testRightPanelMultiRole } from '../Utils/RightPanelTestHelpers';

test('Should verify permissions for all roles', async ({ adminPage, dataStewardPage, dataConsumerPage }) => {
  await testRightPanelMultiRole(
    adminPage,
    table,
    ['Admin', 'DataSteward', 'DataConsumer']
  );
});
```

### Individual Tab Testing

```typescript
const testSuite = createRightPanelTestSuite(adminPage, table);

// Test specific tabs individually
await testSuite.getOverview().navigateToOverviewTab();
await testSuite.getOverview().editDescription('My description');

await testSuite.getSchema().navigateToSchemaTab();
await testSuite.getSchema().shouldShowFields();

await testSuite.getLineage().navigateToLineageTab();
await testSuite.getLineage().shouldShowLineageControls();

await testSuite.getDataQuality().navigateToDataQualityTab();
await testSuite.getDataQuality().shouldShowAllStatCards();

await testSuite.getCustomProperties().navigateToCustomPropertiesTab();
await testSuite.getCustomProperties().shouldShowCustomPropertiesContainer();
```

### Empty State Testing

```typescript
import { verifyRightPanelEmptyStates } from '../Utils/RightPanelTestHelpers';

test('Should verify empty states', async ({ adminPage }) => {
  const emptyTable = new TableClass();
  await emptyTable.create(apiContext);

  await verifyRightPanelEmptyStates(adminPage, emptyTable);
});
```

## Page Object Patterns

### Fluent Interface

All page objects support method chaining:

```typescript
await overview
  .editDescription('New description')
  .addOwner('John Doe')
  .editTags('PII.Sensitive')
  .assignTier('Tier1');
```

### BDD-Style Verification

Verification methods follow "should" naming convention:

```typescript
await overview.shouldShowDescription();
await overview.shouldShowOwner('John Doe');
await overview.shouldShowTag('PII.Sensitive');
await schema.shouldShowFields();
await lineage.shouldShowLineageControls();
```

### Action Methods

Action methods describe what they do:

```typescript
await overview.editDescription('text');
await overview.addOwner('name');
await overview.removeTag(['tagName']);
await lineage.clickUpstreamButton();
await dataQuality.navigateToIncidentsTab();
```

## Role-Based Testing

The framework supports testing with different user roles:

```typescript
const testSuite = createRightPanelTestSuite(dataStewardPage, table);
testSuite.getRightPanel().setRolePermissions('DataSteward');

await testSuite.runStandardTestSuite({ role: 'DataSteward' });
```

**Available Roles:**
- `Admin` - Full permissions
- `DataSteward` - Can edit most fields except domains/data products
- `DataConsumer` - Limited edit permissions, mostly read-only

## Page Context Awareness

The framework adapts to different page contexts:

```typescript
import { PageContext } from '../PageObject/Explore/RightPanelPageObject';

const testSuite = createRightPanelTestSuite(
  adminPage,
  table,
  PageContext.ENTITY_DETAILS  // or EXPLORE, LINEAGE, SERVICE_DETAILS
);
```

This ensures selectors and behaviors are correct for each context.

## Test Organization

### Recommended Structure

```typescript
test.describe('Right Panel Tests', () => {
  test.describe('Overview Tab', () => {
    test('Should edit description', async ({ adminPage }) => { /* ... */ });
    test('Should add/remove owners', async ({ adminPage }) => { /* ... */ });
    test('Should add/remove tags', async ({ adminPage }) => { /* ... */ });
  });

  test.describe('Schema Tab', () => {
    test('Should display fields', async ({ adminPage }) => { /* ... */ });
  });

  test.describe('Multi-Role Tests', () => {
    test('Data Steward permissions', async ({ dataStewardPage }) => { /* ... */ });
    test('Data Consumer permissions', async ({ dataConsumerPage }) => { /* ... */ });
  });

  test.describe('Empty States', () => {
    test('Should show empty state messages', async ({ adminPage }) => { /* ... */ });
  });
});
```

## Best Practices

1. **Use Page Objects** - Never interact with page directly; always use page objects
2. **Wait for Panel** - Always call `waitForPanelVisible()` after navigation
3. **Set Entity Config** - Always call `setEntityConfig(entity)` before testing
4. **Clean Up** - Delete test entities in `afterAll` hooks
5. **Parallel Creation** - Create test data in parallel in `beforeAll`
6. **Role Context** - Create separate page instances for different roles
7. **Context Awareness** - Set correct `PageContext` for the page you're testing

## Examples

See the following test files for complete examples:

- [ExplorePageRightPanel.spec.ts](./ExplorePageRightPanel.spec.ts) - Comprehensive tests across 10 entity types
- Individual test sections for CRUD, multi-role, empty states

## API Reference

### RightPanelTestSuite

| Method | Description |
|--------|-------------|
| `runStandardTestSuite(options?)` | Run all standard tests with optional configuration |
| `testDescriptionCRUD(description)` | Test description create/update/delete |
| `testOwnersCRUD(ownerName, type)` | Test owners add/remove |
| `testTagsCRUD(tagName)` | Test tags add/remove |
| `testGlossaryTermsCRUD(termName)` | Test glossary terms add/remove |
| `testTierCRUD(tierName)` | Test tier assign/remove |
| `testDomainCRUD(domainName)` | Test domain assign/remove |
| `testAsRole(role)` | Test with specific role permissions |
| `verifyTabsAvailability(expectedTabs)` | Verify expected tabs are available |
| `verifyEmptyStates()` | Verify empty state messages |
| `getRightPanel()` | Get RightPanelPageObject instance |
| `getOverview()` | Get OverviewPageObject instance |
| `getSchema()` | Get SchemaPageObject instance |
| `getLineage()` | Get LineagePageObject instance |
| `getDataQuality()` | Get DataQualityPageObject instance |
| `getCustomProperties()` | Get CustomPropertiesPageObject instance |

### Helper Functions

| Function | Description |
|----------|-------------|
| `runRightPanelTestsForExplorePage()` | Run tests in Explore page context |
| `runRightPanelTestsForEntityDetailsPage()` | Run tests in Entity Details page context |
| `runRightPanelTestsForLineagePage()` | Run tests in Lineage page context |
| `runRightPanelTestsForServiceDetailsPage()` | Run tests in Service Details page context |
| `testRightPanelCRUDOperations()` | Test CRUD operations with test data |
| `testRightPanelMultiRole()` | Test with multiple roles |
| `verifyRightPanelEmptyStates()` | Verify empty states |
| `testRightPanelTabAvailability()` | Verify tab availability |
| `createRightPanelTestSuite()` | Create a test suite instance |

## Contributing

When adding new features to the Right Panel:

1. Add methods to appropriate Page Object (e.g., `OverviewPageObject.ts`)
2. Update `RightPanelTestSuite` if needed for orchestration
3. Add helper functions to `RightPanelTestHelpers` if needed
4. Update this README with examples
5. Add tests to `ExplorePageRightPanel.spec.ts` or create new spec file

## Troubleshooting

**Issue: Tests fail with "Panel not visible"**
- Ensure you call `waitForPanelVisible()` after navigation
- Check that you're navigating to the correct page

**Issue: Tests fail with "Element not found"**
- Verify you've set the correct `PageContext`
- Check that you've called `setEntityConfig(entity)`

**Issue: Permission errors in role-based tests**
- Ensure you're using the correct page fixture (`adminPage`, `dataStewardPage`, `dataConsumerPage`)
- Verify you've called `setRolePermissions()` before testing

**Issue: Tab not available**
- Use `isTabAvailable()` to check before testing tabs
- Not all entity types support all tabs (e.g., Topics don't have Schema tab)
