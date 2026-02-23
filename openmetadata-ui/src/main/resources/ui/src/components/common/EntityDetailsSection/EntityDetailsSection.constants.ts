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
import { EntityType } from '../../../enums/entity.enum';

/**
 * Maps entity types to their i18n label keys for the search bar placeholder.
 * e.g. for TABLE → "Search for Columns", for DASHBOARD → "Search for Charts"
 */
export const SEARCH_PLACEHOLDER_MAP: Record<string, string> = {
  [EntityType.TABLE]: 'label.column-plural',
  [EntityType.DASHBOARD_DATA_MODEL]: 'label.column-plural',
  [EntityType.TOPIC]: 'label.field-plural',
  [EntityType.CONTAINER]: 'label.column-plural',
  [EntityType.PIPELINE]: 'label.task-plural',
  [EntityType.DASHBOARD]: 'label.chart-plural',
  [EntityType.SEARCH_INDEX]: 'label.field-plural',
  [EntityType.API_ENDPOINT]: 'label.field-plural',
  [EntityType.API_COLLECTION]: 'label.api-endpoint-plural',
  [EntityType.DATABASE_SCHEMA]: 'label.table-plural',
  [EntityType.DATABASE]: 'label.database-schema-plural',
};
