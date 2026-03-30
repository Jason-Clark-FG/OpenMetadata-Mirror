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

import { PagingResponse } from 'Models';
import { WorkflowDefinition } from '../generated/governance/workflows/workflowDefinition';
import { Include } from '../generated/type/include';
import APIClient from './index';

const BASE_URL = '/governance/workflowDefinitions';

export interface ListWorkflowDefinitionParams {
  fields?: string;
  limit?: number;
  before?: string;
  after?: string;
  include?: Include;
}

export const listWorkflowDefinitions = async (
  params?: ListWorkflowDefinitionParams
) => {
  const response = await APIClient.get<PagingResponse<WorkflowDefinition[]>>(
    BASE_URL,
    { params }
  );

  return response.data;
};

export const getWorkflowDefinitionByName = async (name: string) => {
  const response = await APIClient.get<WorkflowDefinition>(
    `${BASE_URL}/name/${name}`
  );

  return response.data;
};

export const createOrUpdateWorkflowDefinition = async (
  data: WorkflowDefinition
) => {
  const response = await APIClient.put<WorkflowDefinition>(BASE_URL, data);

  return response.data;
};
