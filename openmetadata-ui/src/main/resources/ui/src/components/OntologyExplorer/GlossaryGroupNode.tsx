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
 *  Copyright 2024 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use it except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import { Typography } from 'antd';
import React, { memo } from 'react';
import { NodeProps } from 'reactflow';

export interface GlossaryGroupNodeData {
  glossaryId: string;
  glossaryName: string;
  color: string;
}

const GlossaryGroupNode: React.FC<NodeProps<GlossaryGroupNodeData>> = ({
  data,
}) => {
  const borderColor = data?.color ?? '#94a3b8';
  const backgroundColor = data?.color
    ? `${data.color}18`
    : 'rgba(148, 163, 184, 0.08)';

  return (
    <div
      className="ontology-glossary-group-node"
      style={{
        width: '100%',
        height: '100%',
        backgroundColor,
        borderColor,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderRadius: 12,
        overflow: 'visible',
        boxSizing: 'border-box',
      }}>
      <div
        className="ontology-glossary-group-node__label"
        style={{
          position: 'absolute',
          left: 0,
          top: -22,
          fontSize: 12,
          color: '#64748b',
          fontWeight: 500,
        }}>
        <Typography.Text ellipsis style={{ maxWidth: 180 }}>
          {data?.glossaryName ?? ''}
        </Typography.Text>
      </div>
    </div>
  );
};

export default memo(GlossaryGroupNode);
