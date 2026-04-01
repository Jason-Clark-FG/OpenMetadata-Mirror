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
import { Ref } from 'react';
import { CreateDataProduct } from '../../../generated/api/domains/createDataProduct';
import { CreateDomain } from '../../../generated/api/domains/createDomain';
import { Domain } from '../../../generated/entity/domains/domain';
import { DomainFormType } from '../DomainPage.interface';

export interface DomainFormRef {
  submit: () => void;
  resetFields: () => void;
  validateFields: () => Promise<CreateDomain | CreateDataProduct>;
}

export type DomainFormRefProp =
  | Ref<DomainFormRef>
  | Partial<DomainFormRef>
  | null;

export interface AddDomainFormProps {
  isFormInDialog: boolean;
  onCancel: () => void;
  onSubmit: (data: CreateDomain | CreateDataProduct) => Promise<void>;
  formRef?: DomainFormRefProp;
  loading: boolean;
  type: DomainFormType;
  parentDomain?: Domain;
}
