/*
 *  Copyright 2024 Collate.
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

/**
 * Consolidated custom property tests for:
 *   ApiCollection, ApiEndpoint, DataProduct, Domain, TableColumn.
 *
 * Each entity type has ONE describe.serial block so no two workers can
 * ever run CP create/edit/delete operations for the same entity type
 * simultaneously.
 *
 * The TableColumn block also contains the column-level CP test (moved
 * from Entity.spec.ts), which requires a TableClass instance.
 */

import { test } from '@playwright/test';
import { CUSTOM_PROPERTIES_ENTITIES } from '../../constant/customProperty';
import { ApiCollectionClass } from '../../support/entity/ApiCollectionClass';
import { ApiEndpointClass } from '../../support/entity/ApiEndpointClass';
import { EntityTypeEndpoint } from '../../support/entity/Entity.interface';
import { TableClass } from '../../support/entity/TableClass';
import {
  createNewPage,
  getApiContext,
  redirectToHomePage,
} from '../../utils/common';
import {
  addCustomPropertiesForEntity,
  createCustomPropertyForEntity,
  CustomPropertyTypeByName,
  deleteCreatedProperty,
  editCreatedProperty,
  updateCustomPropertyInRightPanel,
  verifyCustomPropertyInAdvancedSearch,
  verifyTableColumnCustomPropertyPersistence,
} from '../../utils/customProperty';
import { settingClick, SettingOptionsType } from '../../utils/sidebar';

test.use({ storageState: 'playwright/.auth/admin.json' });

type CustomPropertyEntity =
  (typeof CUSTOM_PROPERTIES_ENTITIES)[keyof typeof CUSTOM_PROPERTIES_ENTITIES];

const BASIC_PROPERTIES = [
  'Integer',
  'String',
  'Markdown',
  'Duration',
  'Email',
  'Number',
  'Sql Query',
  'Time Interval',
  'Timestamp',
  'Hyperlink',
];

const CONFIG_PROPERTIES: Array<{
  name: string;
  getConfig: (e: CustomPropertyEntity) => Record<string, unknown>;
  editPropertyType?: string;
  verifyAdvancedSearch: boolean;
  searchTableColumns?: boolean;
}> = [
  {
    name: 'Enum',
    getConfig: (e) => ({ enumConfig: e.enumConfig }),
    editPropertyType: 'Enum',
    verifyAdvancedSearch: true,
  },
  {
    name: 'Table',
    getConfig: (e) => ({ tableConfig: e.tableConfig }),
    editPropertyType: 'Table',
    verifyAdvancedSearch: true,
    searchTableColumns: true,
  },
  {
    name: 'Entity Reference',
    getConfig: (e) => ({ entityReferenceConfig: e.entityReferenceConfig }),
    editPropertyType: 'Entity Reference',
    verifyAdvancedSearch: true,
  },
  {
    name: 'Entity Reference List',
    getConfig: (e) => ({ entityReferenceConfig: e.entityReferenceConfig }),
    editPropertyType: 'Entity Reference List',
    verifyAdvancedSearch: true,
  },
  {
    name: 'Date',
    getConfig: (e) => ({ formatConfig: e.dateFormatConfig }),
    verifyAdvancedSearch: false,
  },
  {
    name: 'Time',
    getConfig: (e) => ({ formatConfig: e.timeFormatConfig }),
    verifyAdvancedSearch: true,
  },
  {
    name: 'Date Time',
    getConfig: (e) => ({ formatConfig: e.dateTimeFormatConfig }),
    verifyAdvancedSearch: true,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

type CRUDEntity = {
  key: keyof typeof CUSTOM_PROPERTIES_ENTITIES;
  /**
   * Entity class instance factory.
   * - Non-null for entities with a UI entity page (ApiCollection, ApiEndpoint).
   * - null for CP-only entities (DataProduct, Domain) whose EntityClass
   *   subclass lacks full entityResponseData support, and for TableColumn
   *   which has a dedicated column-level CP test instead.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  makeInstance: (() => any) | null;
};

const PART3_ENTITIES: CRUDEntity[] = [
  { key: 'entity_apiCollection', makeInstance: () => new ApiCollectionClass() },
  { key: 'entity_apiEndpoint', makeInstance: () => new ApiEndpointClass() },
  // DataProduct/Domain extend EntityClass but lack entityResponseData; skip Set & Update
  { key: 'entity_dataProduct', makeInstance: null },
  { key: 'entity_domain', makeInstance: null },
  // TableColumn has no standalone entity page; column-level CP test runs separately
  { key: 'entity_tableColumn', makeInstance: null },
];

// ─── Main test loop ──────────────────────────────────────────────────────────

PART3_ENTITIES.forEach(({ key, makeInstance }) => {
  const entity = CUSTOM_PROPERTIES_ENTITIES[key];

  test.describe
    .serial(`Add update and delete custom properties for ${entity.name}`, () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mainEntity: any = null;
    // Used only for the entity_tableColumn column-level CP test
    let tableForColumnTest: TableClass | null = null;

    test.beforeAll(async ({ browser }) => {
      const { apiContext, afterAction } = await createNewPage(browser);

      if (makeInstance !== null) {
        mainEntity = makeInstance();
        await mainEntity.create(apiContext);
      } else if (key === 'entity_tableColumn') {
        tableForColumnTest = new TableClass();
        await tableForColumnTest.create(apiContext);
      }

      await afterAction();
    });

    test.afterAll(async ({ browser }) => {
      const { apiContext, afterAction } = await createNewPage(browser);

      if (mainEntity !== null) {
        await mainEntity.delete(apiContext);
      } else if (tableForColumnTest !== null) {
        await tableForColumnTest.delete(apiContext);
      }

      await afterAction();
    });

    test.beforeEach(async ({ page }) => {
      await redirectToHomePage(page);
    });

    // ── 17 CRUD tests ─────────────────────────────────────────────────────

    BASIC_PROPERTIES.forEach((property) => {
      test(property, async ({ page }) => {
        const propertyName = `pwcp${Date.now()}test${entity.name}`;

        await settingClick(
          page,
          entity.entityApiType as SettingOptionsType,
          true
        );
        await addCustomPropertiesForEntity({
          page,
          propertyName,
          customPropertyData: entity,
          customType: property,
        });

        await editCreatedProperty(page, propertyName);

        await verifyCustomPropertyInAdvancedSearch(
          page,
          propertyName.toUpperCase(),
          entity.name.charAt(0).toUpperCase() + entity.name.slice(1),
          property
        );

        await settingClick(
          page,
          entity.entityApiType as SettingOptionsType,
          true
        );
        await deleteCreatedProperty(page, propertyName);
      });
    });

    CONFIG_PROPERTIES.forEach((propertyConfig) => {
      test(propertyConfig.name, async ({ page }) => {
        test.slow();
        const propertyName = `pwcp${Date.now()}test${entity.name}`;

        await settingClick(
          page,
          entity.entityApiType as SettingOptionsType,
          true
        );
        await addCustomPropertiesForEntity({
          page,
          propertyName,
          customPropertyData: entity,
          customType: propertyConfig.name,
          ...propertyConfig.getConfig(entity),
        });

        if (propertyConfig.editPropertyType) {
          await editCreatedProperty(
            page,
            propertyName,
            propertyConfig.editPropertyType
          );
        } else {
          await editCreatedProperty(page, propertyName);
        }

        if (propertyConfig.verifyAdvancedSearch) {
          if (propertyConfig.searchTableColumns) {
            await verifyCustomPropertyInAdvancedSearch(
              page,
              propertyName.toUpperCase(),
              entity.name.charAt(0).toUpperCase() + entity.name.slice(1),
              propertyConfig.name,
              entity.tableConfig.columns
            );
          } else {
            await verifyCustomPropertyInAdvancedSearch(
              page,
              propertyName.toUpperCase(),
              entity.name.charAt(0).toUpperCase() + entity.name.slice(1)
            );
          }
        }

        await settingClick(
          page,
          entity.entityApiType as SettingOptionsType,
          true
        );
        await deleteCreatedProperty(page, propertyName);
      });
    });

    // ── Set & Update all CP types (only for entities with full entity page) ─

    if (makeInstance !== null) {
      test(`Set & Update all CP types on ${entity.name}`, async ({ page }) => {
        test.slow(true);
        const { apiContext, afterAction } = await getApiContext(page);
        await mainEntity.prepareCustomProperty(apiContext);

        const properties = Object.values(CustomPropertyTypeByName);

        await test.step('Set all CP types', async () => {
          await mainEntity.visitEntityPage(page);
          for (const type of properties) {
            await mainEntity.updateCustomProperty(
              page,
              mainEntity.customPropertyValue[type].property,
              mainEntity.customPropertyValue[type].value
            );
          }
        });

        await test.step('Update all CP types', async () => {
          await mainEntity.visitEntityPage(page);
          for (const type of properties) {
            await mainEntity.updateCustomProperty(
              page,
              mainEntity.customPropertyValue[type].property,
              mainEntity.customPropertyValue[type].newValue
            );
          }
        });

        await test.step('Update all CP types in Right Panel', async () => {
          test.slow();
          for (const [index, type] of properties.entries()) {
            await updateCustomPropertyInRightPanel({
              page,
              entityName:
                mainEntity.entityResponseData['displayName'] ??
                mainEntity.entityResponseData['name'],
              propertyDetails: mainEntity.customPropertyValue[type].property,
              value: mainEntity.customPropertyValue[type].value,
              endpoint: mainEntity.endpoint,
              skipNavigation: index > 0,
            });
          }
        });

        await mainEntity.cleanupCustomProperty(apiContext);
        await afterAction();
      });
    }

    // ── Column-level CP test (only for entity_tableColumn) ─────────────────

    if (key === 'entity_tableColumn') {
      test('Set & update column-level custom property', async ({ page }) => {
        // Iterates all 17 CP types and performs multiple actions for each;
        // needs a generous timeout.
        test.setTimeout(600000);

        const { apiContext, afterAction } = await getApiContext(page);

        const data = await createCustomPropertyForEntity(
          apiContext,
          EntityTypeEndpoint.TableColumn
        );
        const customPropertyValue = data.customProperties;
        const cleanupUser = data.cleanupUser;
        const users = data.userNames;

        const columnFqn =
          tableForColumnTest!.entityResponseData.columns[0]
            .fullyQualifiedName ?? '';
        const tableFqn =
          tableForColumnTest!.entityResponseData.fullyQualifiedName ?? '';

        const properties = Object.values(CustomPropertyTypeByName);

        for (const type of properties) {
          await test.step(`Set ${type} custom property on column and verify in UI`, async () => {
            await verifyTableColumnCustomPropertyPersistence({
              page,
              columnFqn,
              tableFqn,
              propertyName: customPropertyValue[type].property.name,
              propertyType: type,
              users,
            });
          });
        }

        await cleanupUser(apiContext);
        await afterAction();
      });
    }
  });
});
