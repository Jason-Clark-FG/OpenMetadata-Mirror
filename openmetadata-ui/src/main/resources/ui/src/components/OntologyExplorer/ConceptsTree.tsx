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

import { DownOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { Input, Tooltip, Tree, Typography } from 'antd';
import { DataNode, EventDataNode, TreeProps } from 'antd/es/tree';
import { AxiosError } from 'axios';
import { debounce, isEmpty } from 'lodash';
import React, { Key, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactComponent as IconTerm } from '../../assets/svg/glossary-term-colored-new.svg';
import { ReactComponent as GlossaryIcon } from '../../assets/svg/glossary.svg';
import { TabSpecificField } from '../../enums/entity.enum';
import { Glossary } from '../../generated/entity/data/glossary';
import { GlossaryTerm } from '../../generated/entity/data/glossaryTerm';
import { EntityReference } from '../../generated/type/entityReference';
import { getGlossariesList, getGlossaryTerms } from '../../rest/glossaryAPI';
import { stringToDOMElement } from '../../utils/StringsUtils';
import { showErrorToast } from '../../utils/ToastUtils';
import Loader from '../common/Loader/Loader';
import {
  ConceptsTreeNode,
  ConceptsTreeProps,
} from './OntologyExplorer.interface';

const getPlainTextFromHtml = (html: string): string => {
  return stringToDOMElement(html).textContent || '';
};

const isValidUUID = (str: string): boolean => {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  return uuidRegex.test(str);
};

const ConceptsTree: React.FC<ConceptsTreeProps> = ({
  scope,
  entityId,
  glossaryId,
  selectedNodeId,
  onNodeSelect,
  onNodeFocus,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [treeData, setTreeData] = useState<ConceptsTreeNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState('');
  const [filteredData, setFilteredData] = useState<ConceptsTreeNode[]>([]);

  const buildGlossaryTree = useCallback(
    (glossaries: Glossary[]): ConceptsTreeNode[] => {
      return glossaries.map((glossary) => ({
        key: glossary.id,
        title: glossary.displayName || glossary.name,
        type: 'glossary' as const,
        icon: <GlossaryIcon className="w-4 h-4" />,
        isLeaf: false,
        data: {
          id: glossary.id,
          fullyQualifiedName: glossary.fullyQualifiedName || glossary.name,
          description: glossary.description,
        },
      }));
    },
    []
  );

  const buildChildrenFromRefs = useCallback(
    (children: EntityReference[]): ConceptsTreeNode[] => {
      return children
        .filter((child) => child.id && isValidUUID(child.id))
        .map((child) => ({
          key: child.id,
          title: child.displayName || child.name || child.id,
          type: 'term' as const,
          icon: <IconTerm className="w-4 h-4" />,
          isLeaf: true,
          data: {
            id: child.id,
            fullyQualifiedName: child.fullyQualifiedName || child.name || '',
            description: child.description,
            relationsCount: 0,
          },
        }));
    },
    []
  );

  const buildTermTree = useCallback(
    (terms: GlossaryTerm[]): ConceptsTreeNode[] => {
      return terms
        .filter((term) => term.id && isValidUUID(term.id))
        .map((term) => ({
          key: term.id,
          title: term.displayName || term.name,
          type: 'term' as const,
          icon: <IconTerm className="w-4 h-4" />,
          isLeaf: !term.children || term.children.length === 0,
          data: {
            id: term.id,
            fullyQualifiedName: term.fullyQualifiedName || term.name,
            description: term.description,
            relationsCount: term.relatedTerms?.length || 0,
          },
          children:
            term.children && term.children.length > 0
              ? buildChildrenFromRefs(term.children)
              : undefined,
        }));
    },
    [buildChildrenFromRefs]
  );

  const fetchGlossaries = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getGlossariesList({
        fields: 'owners,tags,reviewers,domains',
        limit: 100,
      });

      const glossaryNodes = buildGlossaryTree(response.data);
      setTreeData(glossaryNodes);
      setFilteredData(glossaryNodes);

      if (glossaryNodes.length > 0) {
        setExpandedKeys([glossaryNodes[0].key]);
      }
    } catch (error) {
      showErrorToast(error as AxiosError);
    } finally {
      setLoading(false);
    }
  }, [buildGlossaryTree]);

  const fetchGlossaryTerms = useCallback(
    async (glossaryId: string) => {
      try {
        const response = await getGlossaryTerms({
          glossary: glossaryId,
          fields: [
            TabSpecificField.RELATED_TERMS,
            TabSpecificField.CHILDREN,
            TabSpecificField.PARENT,
          ],
          limit: 1000,
        });

        return buildTermTree(response.data);
      } catch (error) {
        showErrorToast(error as AxiosError);

        return [];
      }
    },
    [buildTermTree]
  );

  const updateTreeData = (
    list: ConceptsTreeNode[],
    key: string,
    children: ConceptsTreeNode[]
  ): ConceptsTreeNode[] => {
    return list.map((node) => {
      if (node.key === key) {
        return { ...node, children };
      }
      if (node.children) {
        return {
          ...node,
          children: updateTreeData(node.children, key, children),
        };
      }

      return node;
    });
  };

  const loadTreeData: TreeProps['loadData'] = useCallback(
    async (treeNode: EventDataNode<DataNode>) => {
      const node = treeNode as unknown as ConceptsTreeNode;

      if (node.children) {
        return;
      }

      if (node.type === 'glossary' && node.data?.id) {
        const terms = await fetchGlossaryTerms(node.data.id);
        setTreeData((prev) => updateTreeData(prev, node.key, terms));
        setFilteredData((prev) => updateTreeData(prev, node.key, terms));
      }
    },
    [fetchGlossaryTerms]
  );

  const filterTree = useCallback(
    (nodes: ConceptsTreeNode[], search: string): ConceptsTreeNode[] => {
      if (!search) {
        return nodes;
      }

      const searchLower = search.toLowerCase();

      return nodes.reduce<ConceptsTreeNode[]>((acc, node) => {
        const titleMatch = node.title.toLowerCase().includes(searchLower);
        const childMatches = node.children
          ? filterTree(node.children, search)
          : [];

        if (titleMatch || childMatches.length > 0) {
          acc.push({
            ...node,
            children: childMatches.length > 0 ? childMatches : node.children,
          });
        }

        return acc;
      }, []);
    },
    []
  );

  const getAllKeys = (nodes: ConceptsTreeNode[]): string[] => {
    let keys: string[] = [];
    nodes.forEach((node) => {
      keys.push(node.key);
      if (node.children) {
        keys = keys.concat(getAllKeys(node.children));
      }
    });

    return keys;
  };

  const handleSearch = useMemo(
    () =>
      debounce((value: string) => {
        setSearchValue(value);
        if (value) {
          const filtered = filterTree(treeData, value);
          setFilteredData(filtered);
          const allKeys = getAllKeys(filtered);
          setExpandedKeys(allKeys);
        } else {
          setFilteredData(treeData);
        }
      }, 300),
    [treeData, filterTree]
  );

  const handleSelect: TreeProps['onSelect'] = useCallback(
    (_: Key[], info: { node: EventDataNode<DataNode> }) => {
      const node = info.node as unknown as ConceptsTreeNode;
      onNodeSelect(node);
      if (node.data?.id) {
        onNodeFocus(node.data.id);
      }
    },
    [onNodeSelect, onNodeFocus]
  );

  const handleExpand: TreeProps['onExpand'] = useCallback((keys: Key[]) => {
    setExpandedKeys(keys as string[]);
  }, []);

  const switcherIcon = useCallback(({ expanded }: { expanded?: boolean }) => {
    return expanded ? (
      <DownOutlined className="text-xs" />
    ) : (
      <RightOutlined className="text-xs" />
    );
  }, []);

  const renderTitle = useCallback((node: ConceptsTreeNode) => {
    const plainDescription = node.data?.description
      ? getPlainTextFromHtml(node.data.description)
      : undefined;

    return (
      <Tooltip title={plainDescription}>
        <div className="concepts-tree-node">
          <span className="node-title">{node.title}</span>
          {node.data?.relationsCount !== undefined &&
            node.data.relationsCount > 0 && (
              <span className="node-count">{node.data.relationsCount}</span>
            )}
        </div>
      </Tooltip>
    );
  }, []);

  useEffect(() => {
    if (scope === 'global') {
      fetchGlossaries();
    } else if (scope === 'glossary' && glossaryId) {
      fetchGlossaryTerms(glossaryId).then((terms) => {
        setTreeData(terms);
        setFilteredData(terms);
        setLoading(false);
      });
    } else if (scope === 'term' && entityId) {
      setLoading(false);
    }
  }, [scope, entityId, glossaryId, fetchGlossaries, fetchGlossaryTerms]);

  if (loading) {
    return (
      <div className="ontology-explorer-sidebar">
        <div className="p-4">
          <Loader />
        </div>
      </div>
    );
  }

  if (scope === 'term') {
    return null;
  }

  return (
    <div className="ontology-explorer-sidebar">
      <div className="sidebar-header">
        <Typography.Text className="sidebar-title">
          {t('label.concept-plural')}
        </Typography.Text>
        <Input
          allowClear
          className="sidebar-search"
          placeholder={t('label.search-entity', {
            entity: t('label.concept-plural'),
          })}
          prefix={<SearchOutlined />}
          size="small"
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>
      <div className="sidebar-content">
        {isEmpty(filteredData) ? (
          <div className="p-4 text-center text-grey-muted">
            {searchValue
              ? t('message.no-match-found')
              : t('message.no-data-available')}
          </div>
        ) : (
          <Tree
            blockNode
            showIcon
            expandedKeys={expandedKeys}
            loadData={loadTreeData}
            selectedKeys={selectedNodeId ? [selectedNodeId] : []}
            switcherIcon={switcherIcon}
            titleRender={(node) => renderTitle(node as ConceptsTreeNode)}
            treeData={filteredData as DataNode[]}
            onExpand={handleExpand}
            onSelect={handleSelect}
          />
        )}
      </div>
    </div>
  );
};

export default ConceptsTree;
