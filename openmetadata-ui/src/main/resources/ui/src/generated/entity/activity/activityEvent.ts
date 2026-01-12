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
/**
 * A lightweight activity notification for user dashboards and feeds. NOT for compliance,
 * audit trails, or workflows - use entity version history and Task entity for those purposes.
 */
import { ChangeDescription } from '../../type/entityHistory';
import { EntityReference } from '../../type/entityReference';
import { Reaction } from '../../type/reaction';

/**
 * Type of activity event.
 */
export enum ActivityEventType {
  EntityCreated = 'EntityCreated',
  EntityUpdated = 'EntityUpdated',
  EntityDeleted = 'EntityDeleted',
  EntitySoftDeleted = 'EntitySoftDeleted',
  EntityRestored = 'EntityRestored',
  DescriptionUpdated = 'DescriptionUpdated',
  TagsUpdated = 'TagsUpdated',
  OwnerUpdated = 'OwnerUpdated',
  DomainUpdated = 'DomainUpdated',
  TierUpdated = 'TierUpdated',
  CustomPropertyUpdated = 'CustomPropertyUpdated',
  ColumnDescriptionUpdated = 'ColumnDescriptionUpdated',
  ColumnTagsUpdated = 'ColumnTagsUpdated',
  TestCaseStatusChanged = 'TestCaseStatusChanged',
  PipelineStatusChanged = 'PipelineStatusChanged',
}

export interface ActivityEvent {
  /**
   * Unique identifier for this activity event.
   */
  id: string;
  /**
   * Type of activity that occurred.
   */
  eventType: ActivityEventType;
  /**
   * Reference to the entity that changed.
   */
  entity: EntityReference;
  /**
   * EntityLink string identifying the specific entity/field/column the activity is about.
   * Format: <#E::entityType::fqn::fieldName::arrayFieldName::arrayFieldValue>
   */
  about?: string;
  /**
   * Domains this activity belongs to, inherited from the source entity for domain-scoped visibility.
   */
  domains?: EntityReference[];
  /**
   * User or bot who performed the action.
   */
  actor: EntityReference;
  /**
   * Timestamp when the activity occurred in Unix epoch time milliseconds.
   */
  timestamp: number;
  /**
   * Human-readable summary of the activity for display.
   */
  summary?: string;
  /**
   * Name of the field that was changed, if applicable.
   */
  fieldName?: string;
  /**
   * Previous value (truncated for display, not for audit).
   */
  oldValue?: string;
  /**
   * New value (truncated for display, not for audit).
   */
  newValue?: string;
  /**
   * Optional structured change description with field-level details.
   */
  changeDescription?: ChangeDescription;
  /**
   * Reactions for this activity event.
   */
  reactions?: Reaction[];
}
