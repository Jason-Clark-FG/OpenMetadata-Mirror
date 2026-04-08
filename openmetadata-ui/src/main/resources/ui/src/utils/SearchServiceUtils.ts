/*
 *  Copyright 2023 Collate.
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

import { cloneDeep } from 'lodash';
import { COMMON_UI_SCHEMA } from '../constants/ServiceUISchema.constant';
import { SearchServiceType } from '../generated/entity/services/searchService';

const SEARCH_CONNECTION_SCHEMAS: Record<
  SearchServiceType,
  () => Promise<{ default: Record<string, unknown> }>
> = {
  [SearchServiceType.ElasticSearch]: () =>
    import(
      '../jsons/connectionSchemas/connections/search/elasticSearchConnection.json'
    ),
  [SearchServiceType.OpenSearch]: () =>
    import(
      '../jsons/connectionSchemas/connections/search/openSearchConnection.json'
    ),
  [SearchServiceType.CustomSearch]: () =>
    import(
      '../jsons/connectionSchemas/connections/search/customSearchConnection.json'
    ),
};

export const getSearchServiceConfig = async (type: SearchServiceType) => {
  const uiSchema = { ...COMMON_UI_SCHEMA };
  const loaderFn = SEARCH_CONNECTION_SCHEMAS[type];

  if (!loaderFn) {
    return cloneDeep({ schema: {}, uiSchema });
  }

  const schema = (await loaderFn()).default;

  return cloneDeep({ schema, uiSchema });
};
