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

import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import React, { useMemo, useState } from 'react';
import { OntologyEdge } from './OntologyExplorer.interface';

const RELATION_COLORS: Record<string, string> = {
  relatedTo: '#3062d4',
  related: '#3062d4',
  synonym: '#7c3aed',
  antonym: '#dc2626',
  typeOf: '#059669',
  hasTypes: '#10b981',
  hasA: '#0891b2',
  partOf: '#0d9488',
  hasPart: '#14b8a6',
  componentOf: '#0891b2',
  composedOf: '#06b6d4',
  calculatedFrom: '#d97706',
  usedToCalculate: '#f59e0b',
  derivedFrom: '#ea580c',
  seeAlso: '#be185d',
  parentOf: '#4f46e5',
  childOf: '#6366f1',
  broader: '#4f46e5',
  narrower: '#6366f1',
  isA: '#059669',
  instanceOf: '#10b981',
  owns: '#7c3aed',
  ownedBy: '#8b5cf6',
  manages: '#3062d4',
  managedBy: '#3b82f6',
  contains: '#0891b2',
  containedIn: '#06b6d4',
  dependsOn: '#dc2626',
  usedBy: '#d97706',
  metricFor: '#0ea5e9',
  hasGlossaryTerm: '#0f766e',
};

const RELATION_DISPLAY_NAMES: Record<string, string> = {
  relatedTo: 'Related To',
  related: 'Related',
  synonym: 'Synonym',
  antonym: 'Antonym',
  typeOf: 'Type Of',
  hasTypes: 'Has Types',
  hasA: 'Has A',
  partOf: 'Part Of',
  hasPart: 'Has Part',
  componentOf: 'Component Of',
  composedOf: 'Composed Of',
  calculatedFrom: 'Calculated From',
  usedToCalculate: 'Used to Calculate',
  derivedFrom: 'Derived From',
  seeAlso: 'See Also',
  parentOf: 'Parent Of',
  childOf: 'Child Of',
  broader: 'Broader',
  narrower: 'Narrower',
  isA: 'Is A',
  instanceOf: 'Instance Of',
  owns: 'Owns',
  ownedBy: 'Owned By',
  manages: 'Manages',
  managedBy: 'Managed By',
  contains: 'Contains',
  containedIn: 'Contained In',
  dependsOn: 'Depends On',
  usedBy: 'Used By',
  metricFor: 'Metric For',
  hasGlossaryTerm: 'Tagged With',
};

export interface OntologyLegendProps {
  edges: OntologyEdge[];
}

const OntologyLegend: React.FC<OntologyLegendProps> = ({ edges }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const activeRelationTypes = useMemo(() => {
    const types = new Set<string>();
    edges.forEach((edge) => {
      if (edge.relationType) {
        types.add(edge.relationType);
      }
    });

    return Array.from(types).sort();
  }, [edges]);

  if (activeRelationTypes.length === 0) {
    return null;
  }

  return (
    <div className="ontology-legend">
      <div
        className="ontology-legend__header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Typography.Text strong className="ontology-legend__title">
          Relation Types
        </Typography.Text>
        {isExpanded ? (
          <DownOutlined className="ontology-legend__icon" />
        ) : (
          <UpOutlined className="ontology-legend__icon" />
        )}
      </div>

      {isExpanded && (
        <div className="ontology-legend__content">
          {activeRelationTypes.map((relationType) => {
            const color =
              RELATION_COLORS[relationType] ?? RELATION_COLORS.related;
            const displayName =
              RELATION_DISPLAY_NAMES[relationType] ?? relationType;

            return (
              <div className="ontology-legend__item" key={relationType}>
                <div
                  className="ontology-legend__line"
                  style={{ backgroundColor: color }}
                />
                <Typography.Text className="ontology-legend__label">
                  {displayName}
                </Typography.Text>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OntologyLegend;
