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
/**
 * Defines a manual task node that creates an OM Task, waits for status transitions via
 * messages, and routes based on the resulting status. The template name is resolved at
 * runtime to determine statuses, task category, and other configuration.
 */
export interface ManualTask {
    branches?: string[];
    config:    NodeConfiguration;
    /**
     * Description of the Node.
     */
    description?: string;
    /**
     * Display Name that identifies this Node.
     */
    displayName?:       string;
    input?:             string[];
    inputNamespaceMap?: InputNamespaceMap;
    /**
     * Name that identifies this Node.
     */
    name:     string;
    output?:  string[];
    subType?: string;
    type?:    string;
    [property: string]: any;
}

export interface NodeConfiguration {
    /**
     * Configuration for who gets assigned to the created task.
     */
    assignees?: Assignees;
    /**
     * Name of the task template. Resolved at runtime to full configuration (statuses,
     * terminalStatuses, taskCategory, taskType). Will become an entity reference when Task
     * Templates are implemented.
     */
    template: string;
}

/**
 * Configuration for who gets assigned to the created task.
 */
export interface Assignees {
    /**
     * Add the entity Owners to the assignees list.
     */
    addOwners?: boolean;
    /**
     * Add the entity Reviewers to the assignees list.
     */
    addReviewers?: boolean;
    /**
     * Specific users to add to the assignees list (by fully qualified name).
     */
    specificUsers?: string[];
}

export interface InputNamespaceMap {
    relatedEntity: string;
}
