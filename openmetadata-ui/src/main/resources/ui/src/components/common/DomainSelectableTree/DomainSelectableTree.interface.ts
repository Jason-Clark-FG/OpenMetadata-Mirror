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
import { DefaultOptionType, RefSelectProps } from 'antd/lib/select';
import { EntityReference } from '../../../generated/entity/type';

export interface DomainSelectableTreeProps {
  value?: string[]; // array of fqn
  onSubmit: (option: EntityReference[]) => Promise<void>;
  visible: boolean;
  onCancel: () => void;
  isMultiple?: boolean;
  initialDomains?: EntityReference[];
  dropdownRef?: React.RefObject<RefSelectProps>;
  handleDropdownChange?: (open: boolean) => void;
  showAllDomains?: boolean;
}

export type TreeListItem = Omit<DefaultOptionType, 'label'>;
