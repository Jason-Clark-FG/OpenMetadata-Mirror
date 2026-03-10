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
import { GraphData, NodeData, EdgeData, ExtensionCategory, register, HTML } from '@antv/g6';
import { createRoot, Root } from 'react-dom/client';
import { EntityLineageResponse, LineageEntityReference } from './Lineage.interface';
import CustomNodeV1 from '../Entity/EntityLineage/CustomNodeV1.component';
import { LineageContext } from '../../context/LineageProvider/LineageProvider';
import { EntityLineageNodeType } from '../../enums/entity.enum';
import { getEntityName } from '../../utils/EntityUtils';

export const NODE_WIDTH = 300;
export const NODE_HEIGHT = 50; // React component handles its own height usually, but G6 needs a hint

// Cache roots to avoid creating new roots on every render
const nodeRoots = new Map<string, { root: Root, container: HTMLElement }>();

export const getReactNodeElement = (
    node: LineageEntityReference, 
    context: any, 
    isRootNode: boolean
): HTMLElement => {
    const id = node.id;
    let entry = nodeRoots.get(id);

    if (!entry) {
        const container = document.createElement('div');
        // Ensure container has size or fits content
        container.style.width = '100%';
        container.style.height = '100%';
        const root = createRoot(container);
        entry = { root, container };
        nodeRoots.set(id, entry);
    }

    // Mock ReactFlow NodeProps
    const data = {
        label: node.displayName || node.name,
        isNewNode: false,
        node: node,
        isRootNode: isRootNode,
        // Calculate these if possible, or pass initial values
        hasOutgoers: false, // Updated by component logic or we need to pass edges
        hasIncomers: false,
    };

    const customNode = <LineageContext.Provider value={context}>
            <div style={{ width: 300, transform: 'scale(1)', transformOrigin: 'top left' }}>
                 <CustomNodeV1 
                    data={data} 
                    dragging={false} 
                    id={id} 
                    isConnectable={false}
                    selected={false} 
                    type={EntityLineageNodeType.DEFAULT}
                    xPos={0}
                    yPos={0}
                    zIndex={10}
                 />
                 
            </div>
        </LineageContext.Provider>

    // Render into the root
    entry.root.render(
        customNode
    );

    return entry.container;
};

export const transformEntityLineageToG6Data = (data: EntityLineageResponse, context: any): GraphData => {
  const { entity, nodes = [], edges = [] } = data;
  
  const nodeMap = new Map<string, LineageEntityReference>();
  
  nodeMap.set(entity.id, entity);
  nodes.forEach((node) => {
    nodeMap.set(node.id, node);
  });
  
  const g6Nodes: NodeData[] = Array.from(nodeMap.values()).map((node) => {
    const isRootNode = node.id === entity.id;

    return {
      id: node.id,
      data: {
        originalData: node,
      },
      style: {
        width: 300,
        height: 150, // Estimate height
        innerHTML: getReactNodeElement(node, context, isRootNode),
      },
      type: 'react-node',
    };
  });

  const g6Edges: EdgeData[] = edges.map((edge) => {
    if(nodeMap.has(edge.fromEntity.id) && nodeMap.has(edge.toEntity.id) ){
      return {
          id: `${edge.fromEntity.id}-${edge.toEntity.id}`,
          source: edge.fromEntity.id,
          target: edge.toEntity.id,
          data: {
            originalData: edge,
          },
          type: 'cubic-horizontal',
          style: {
            endArrow: true,
            stroke: '#B0B0B0',
            lineWidth: 1.5,
            cursor: 'pointer',
          },
        };
    }
    
    return null;
  }).filter((edge): edge is EdgeData => edge !== null);

  return {
    nodes: g6Nodes,
    edges: g6Edges,
  };
};

export const registerCustomNode = () => {
    register(ExtensionCategory.NODE, 'react-node', HTML);
};
