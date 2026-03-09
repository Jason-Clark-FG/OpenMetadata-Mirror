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
import { NODE_PADDING_H, NODE_PADDING_V } from '../OntologyExplorer.constants';
import { LayoutConfig, LayoutNodeLike } from '../OntologyExplorer.interface';

export const NODE_WIDTH = 120;
export const NODE_HEIGHT = 2 * NODE_PADDING_V + 18;
export { NODE_PADDING_H } from '../OntologyExplorer.constants';
export const CHAR_WIDTH_ESTIMATE = 7;
export const COMBO_PADDING = 48;
export const HULL_GAP = 56;
export const MIN_NODE_SPACING = 24;
export const MIN_LINK_DISTANCE = 160;

/** Minimum node width so label doesn't clip. */
export const MIN_NODE_WIDTH = 72;
/** Minimum width when node shows cross-glossary badge (e.g. "[Bank] Term"). */
export const BADGE_MIN_NODE_WIDTH = 100;

export function getNodeSize(d?: LayoutNodeLike): [number, number] {
  const size = d?.data?.size;
  if (Array.isArray(size) && size.length >= 2) {
    const w = Math.max(MIN_NODE_WIDTH, Number(size[0]) || NODE_WIDTH);
    const h = Math.max(NODE_HEIGHT, Number(size[1]) || NODE_HEIGHT);

    return [w, h];
  }
  if (typeof size === 'number') {
    const s = Math.max(MIN_NODE_WIDTH, NODE_HEIGHT, size);

    return [s, s];
  }

  return [NODE_WIDTH, NODE_HEIGHT];
}

export function estimateNodeWidth(label: string): number {
  const fromLabel = NODE_PADDING_H * 2 + label.length * CHAR_WIDTH_ESTIMATE;

  return Math.max(MIN_NODE_WIDTH, fromLabel);
}

/**
 * Shared dagre spacing so hierarchy and overview look consistent.
 * Larger values keep edge labels clear of nodes and arrowheads off node borders.
 */
export const DAGRE_RANK_SEP = 150;
export const DAGRE_NODE_SEP = 100;
/** Extra separation in hierarchy mode so glossary combo boxes do not overlap. */
export const HIERARCHY_DAGRE_NODE_SEP = 260;
export const HIERARCHY_DAGRE_RANK_SEP = 200;
/** Extra separation when glossary hulls are shown so cross-glossary edges avoid overlapping nodes. */
const CROSS_GLOSSARY_LAYOUT_EXTRA = 90;

export function getLayoutConfig(
  layoutType: string,
  nodeCount: number,
  hasHulls = false,
  focusNode?: string,
  isDataMode = false,
  isHierarchyMode = false
): LayoutConfig {
  const baseNodeSize = (d?: LayoutNodeLike) => getNodeSize(d);
  const forceIterations = 300;
  const linkDistanceFn = (
    _edge: unknown,
    source?: LayoutNodeLike,
    target?: LayoutNodeLike
  ) => {
    const [w1, h1] = getNodeSize(source);
    const [w2, h2] = getNodeSize(target);
    const diag = Math.max(w1, h1) + Math.max(w2, h2);

    return Math.max(MIN_LINK_DISTANCE, diag + MIN_NODE_SPACING);
  };

  if (layoutType === 'force') {
    if (isDataMode) {
      return {
        type: 'force',
        animation: false,
        maxIteration: forceIterations,
        preventOverlap: true,
        nodeSize: baseNodeSize,
        nodeSpacing: 220,
        linkDistance: 220,
        collideStrength: 1,
        nodeStrength: -600,
        edgeStrength: 0.3,
        gravity: 5,
        damping: 0.9,
        maxSpeed: 50,
      };
    }

    return {
      type: 'force',
      animation: false,
      maxIteration: forceIterations,
      preventOverlap: true,
      nodeSize: baseNodeSize,
      nodeSpacing: hasHulls ? COMBO_PADDING * 2 + HULL_GAP : MIN_NODE_SPACING,
      linkDistance: nodeCount <= 2 ? MIN_LINK_DISTANCE : linkDistanceFn,
      collideStrength: 1,
      nodeStrength: -400,
      edgeStrength: 0.1,
      gravity: 10,
      damping: 0.9,
      maxSpeed: 50,
      ...(hasHulls && {
        clustering: true,
        nodeClusterBy: 'glossaryId',
        clusterNodeStrength: 30,
      }),
    };
  }

  if (layoutType === 'dagre') {
    let nodesep = hasHulls
      ? COMBO_PADDING * 2 + HULL_GAP + CROSS_GLOSSARY_LAYOUT_EXTRA
      : DAGRE_NODE_SEP;
    let ranksep = hasHulls
      ? COMBO_PADDING * 2 + HULL_GAP + CROSS_GLOSSARY_LAYOUT_EXTRA
      : DAGRE_RANK_SEP;

    if (isHierarchyMode) {
      nodesep = Math.max(nodesep, HIERARCHY_DAGRE_NODE_SEP);
      ranksep = Math.max(ranksep, HIERARCHY_DAGRE_RANK_SEP);
    }

    return {
      type: 'dagre',
      animation: false,
      rankdir: 'TB',
      nodesep,
      ranksep,
      preventOverlap: true,
      nodeSize: baseNodeSize,
    };
  }

  if (layoutType === 'radial') {
    return {
      type: 'radial',
      animation: false,
      ...(focusNode && !isDataMode && { focusNode }),
      unitRadius: isDataMode ? 220 : nodeCount <= 2 ? MIN_LINK_DISTANCE : 150,
      preventOverlap: true,
      nodeSize: isDataMode ? 20 : 40,
      nodeSpacing: isDataMode ? 30 : MIN_NODE_SPACING,
      linkDistance: isDataMode ? 220 : 200,
      strictRadial: false,
      maxIteration: 1000,
      sortBy: 'degree',
    };
  }

  if (layoutType === 'circular') {
    return {
      type: 'circular',
      animation: false,
      nodeSize: baseNodeSize,
      nodeSpacing: MIN_NODE_SPACING,
    };
  }

  return {
    type: (layoutType as 'force' | 'dagre' | 'radial' | 'circular') || 'force',
  };
}
