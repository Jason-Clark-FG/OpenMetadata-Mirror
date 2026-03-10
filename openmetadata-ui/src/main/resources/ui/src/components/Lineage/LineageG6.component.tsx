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
import { Graph } from '@antv/g6';
import { useEffect, useRef } from 'react';
import { useLineageStore } from './LineageStore';
import { useLineageProvider } from '../../context/LineageProvider/LineageProvider';
import { transformEntityLineageToG6Data, registerCustomNode } from './G6Utils';

// Register custom nodes once
registerCustomNode();

const LineageG6 = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph>();
  // Use entityLineage directly from store
  const { entityLineage } = useLineageStore();
  const lineageContext = useLineageProvider();
  
  // Initialize Graph
  useEffect(() => {
    if (!containerRef.current) {
        return;
    }

    const graph = new Graph({
      container: containerRef.current,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      // Add layout configuration
      layout: {
        type: 'dagre',
        rankdir: 'LR',
        align: 'UL',
        nodesep: 40,
        ranksep: 80,
      },
      modes: {
        default: ['drag-canvas', 'zoom-canvas', 'drag-node'],
      },
      fitView: true,
      minZoom: 0.05,
      maxZoom: 2,
      // Default behaviors
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-node'],
    });

    graphRef.current = graph;

    // Handle Events
    graph.on('node:click', (evt) => {
      // const { item } = evt;
      // const model = item?.getModel();
      // eslint-disable-next-line no-console
      console.log('Node clicked:', evt);
    });
    
    // Initial Render if data exists
    if (entityLineage?.nodes.length > 0) {
         const data = transformEntityLineageToG6Data(entityLineage, lineageContext);
         console.log('data', data);
         graph.setData(data); // Use setData in v5? Or render with data?
         graph.render();
    }

    return () => {
      graph.destroy();
    };
  }, [entityLineage.nodes]);

  // Handle Updates
  useEffect(() => {
    if (graphRef.current && entityLineage?.nodes?.length) {
      const data = transformEntityLineageToG6Data(entityLineage, lineageContext);
      // G6 v5 update data
      graphRef.current.setData(data); 
      graphRef.current.render();
      // graphRef.current.fitView(); // Render maps be async, fitView might need to await or be in callback
    }
  }, [entityLineage, lineageContext]);

  return (
    <div 
        ref={containerRef} 
        style={{ width: '100%', height: '100%', background: '#F5F5F5' }}
        data-testid="lineage-g6-container"
    />
  );
};

export default LineageG6;
