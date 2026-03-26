/*
 *  Copyright 2022 Collate.
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

import {
  Autocomplete,
  Badge,
  BadgeWithIcon,
  Button,
  Select,
  Tooltip,
  TooltipTrigger,
  Typography,
} from '@openmetadata/ui-core-components';
import { Tag01, Trash01 } from '@untitledui/icons';
import { groupBy, isEmpty } from 'lodash';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Key } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import {
  NO_DATA_PLACEHOLDER,
  PAGE_SIZE_MEDIUM,
} from '../../../../constants/constants';
import { EntityField } from '../../../../constants/Feeds.constants';
import { EntityType } from '../../../../enums/entity.enum';
import { GlossaryTermRelationType } from '../../../../generated/configuration/glossaryTermRelationSettings';
import { GlossaryTerm } from '../../../../generated/entity/data/glossaryTerm';
import {
  ChangeDescription,
  EntityReference,
} from '../../../../generated/entity/type';
import { TermRelation } from '../../../../generated/type/termRelation';
import {
  getGlossaryTermRelationSettings,
  searchGlossaryTermsPaginated,
} from '../../../../rest/glossaryAPI';
import {
  getEntityName,
  getEntityReferenceFromEntity,
} from '../../../../utils/EntityUtils';
import {
  getChangedEntityNewValue,
  getChangedEntityOldValue,
  getDiffByFieldName,
} from '../../../../utils/EntityVersionUtils';
import { VersionStatus } from '../../../../utils/EntityVersionUtils.interface';
import { getGlossaryPath } from '../../../../utils/RouterUtils';
import ExpandableCard from '../../../common/ExpandableCard/ExpandableCard';
import {
  EditIconButton,
  PlusIconButton,
} from '../../../common/IconButtons/EditIconButton';
import { useGenericContext } from '../../../Customization/GenericProvider/GenericProvider';
import { DEFAULT_GLOSSARY_TERM_RELATION_TYPES_FALLBACK } from '../../../OntologyExplorer/OntologyExplorer.constants';

interface TermItem {
  value: string;
  label: string;
  entity?: EntityReference;
}

interface TermSelectItem {
  id: string;
  label?: string;
}

interface RelationEditRow {
  id: string;
  relationType: string;
  terms: TermItem[];
}

interface RelationTypeOption {
  id: string;
  label?: string;
  title?: string;
}

interface TermsRowProps {
  rowId: string;
  initialRelationType: string;
  initialTerms: TermItem[];
  relationTypeOptions: RelationTypeOption[];
  excludeFQN: string;
  preloadedTerms: GlossaryTerm[];
  onRelationTypeChange: (rowId: string, relationType: string) => void;
  onTermsChange: (rowId: string, terms: TermItem[]) => void;
  onRemove: (rowId: string) => void;
}

interface TermsRowEditorProps {
  rows: RelationEditRow[];
  excludeFQN: string;
  preloadedTerms: GlossaryTerm[];
  relationTypeOptions: RelationTypeOption[];
  onAddRow: () => void;
  onRelationTypeChange: (rowId: string, relationType: string) => void;
  onTermsChange: (rowId: string, terms: TermItem[]) => void;
  onRemove: (rowId: string) => void;
}

interface RelatedTermTagButtonProps {
  entity: EntityReference;
  relationType?: string;
  versionStatus?: VersionStatus;
  getRelationDisplayName: (relationType: string) => string;
  onRelatedTermClick: (fqn: string) => void;
}

const MAX_VISIBLE_BADGES = 5;

const BadgeList: React.FC<{ items: ReactNode[] }> = ({ items }) => {
  const hiddenCount = Math.max(0, items.length - MAX_VISIBLE_BADGES);

  return (
    <div className="tw:flex tw:flex-wrap tw:mt-2 tw:gap-1">
      {items.slice(0, MAX_VISIBLE_BADGES)}
      {hiddenCount > 0 && (
        <Badge color="gray" size="sm" type="pill-color">
          +{hiddenCount}
        </Badge>
      )}
    </div>
  );
};

const RelatedTermTagButton: React.FC<RelatedTermTagButtonProps> = ({
  entity,
  relationType,
  versionStatus,
  getRelationDisplayName,
  onRelatedTermClick,
}) => {
  const tooltipContent = (
    <div className="tw:p-2 tw:space-y-1">
      <Typography as="p" weight="semibold">
        {entity.fullyQualifiedName}
      </Typography>
      {relationType && (
        <Typography as="p" size="text-xs">
          {getRelationDisplayName(relationType)}
        </Typography>
      )}
      {entity.description && (
        <Typography as="p" size="text-xs">
          {entity.description}
        </Typography>
      )}
    </div>
  );

  return (
    <Tooltip placement="bottom left" title={tooltipContent}>
      <TooltipTrigger
        className={
          versionStatus?.added
            ? 'diff-added'
            : versionStatus?.removed
            ? 'diff-removed'
            : undefined
        }
        data-testid={getEntityName(entity)}
        onPress={() => onRelatedTermClick(entity.fullyQualifiedName ?? '')}>
        <BadgeWithIcon color="gray" iconLeading={Tag01} size="md" type="color">
          {getEntityName(entity)}
        </BadgeWithIcon>
      </TooltipTrigger>
    </Tooltip>
  );
};

const TermsRow: React.FC<TermsRowProps> = ({
  rowId,
  initialRelationType,
  initialTerms,
  relationTypeOptions,
  excludeFQN,
  preloadedTerms,
  onRelationTypeChange,
  onTermsChange,
  onRemove,
}) => {
  const { t } = useTranslation();
  const [relationType, setRelationType] = useState(initialRelationType);
  const [selectedTerms, setSelectedTerms] = useState<TermSelectItem[]>(
    initialTerms.map((term) => ({ id: term.value, label: term.label }))
  );

  const termEntityMap = useMemo(() => {
    const map: Record<string, EntityReference> = {};
    preloadedTerms.forEach((term) => {
      if (term.fullyQualifiedName) {
        map[term.fullyQualifiedName] = getEntityReferenceFromEntity(
          term,
          EntityType.GLOSSARY_TERM
        );
      }
    });
    initialTerms.forEach((term) => {
      if (term.entity) {
        map[term.value] = term.entity;
      }
    });

    return map;
  }, [preloadedTerms, initialTerms]);

  const dropdownItems = useMemo<TermSelectItem[]>(
    () =>
      preloadedTerms
        .filter((term) => term.fullyQualifiedName !== excludeFQN)
        .map((term) => ({
          id: term.fullyQualifiedName ?? '',
          label: getEntityName(term),
        })),
    [preloadedTerms, excludeFQN]
  );

  const toTermItems = useCallback(
    (items: TermSelectItem[]): TermItem[] =>
      items.map((i) => ({
        entity: termEntityMap[i.id],
        label: i.label ?? '',
        value: i.id,
      })),
    [termEntityMap]
  );

  const handleRelationTypeChange = useCallback(
    (key: Key | null) => {
      setRelationType(String(key ?? ''));
      onRelationTypeChange(rowId, String(key ?? ''));
    },
    [rowId, onRelationTypeChange]
  );

  const handleItemInserted = useCallback(
    (key: Key) => {
      const term = preloadedTerms.find((t) => t.fullyQualifiedName === key);
      if (term) {
        const updated = [
          ...selectedTerms,
          { id: term.fullyQualifiedName ?? '', label: getEntityName(term) },
        ];
        setSelectedTerms(updated);
        onTermsChange(rowId, toTermItems(updated));
      }
    },
    [preloadedTerms, selectedTerms, rowId, onTermsChange, toTermItems]
  );

  const handleItemCleared = useCallback(
    (key: Key) => {
      const updated = selectedTerms.filter((i) => i.id !== key);
      setSelectedTerms(updated);
      onTermsChange(rowId, toTermItems(updated));
    },
    [selectedTerms, rowId, onTermsChange, toTermItems]
  );

  return (
    <div
      className="d-flex items-center gap-3"
      data-testid={`relation-row-${rowId}`}>
      <div className="tw:w-67.5 tw:shrink-0">
        <Select
          className="w-full"
          items={relationTypeOptions}
          size="sm"
          value={relationType}
          onChange={handleRelationTypeChange}>
          {(item) => (
            <Select.Item id={item.id} key={item.id} label={item.label} />
          )}
        </Select>
      </div>
      <div className="tw:flex-1" data-testid={`term-autocomplete-${rowId}`}>
        <Autocomplete
          items={dropdownItems}
          maxVisibleItems={3}
          placeholder={t('label.add-entity', {
            entity: t('label.term-plural'),
          })}
          selectedItems={selectedTerms}
          onItemCleared={handleItemCleared}
          onItemInserted={handleItemInserted}>
          {(item) => (
            <Autocomplete.Item id={item.id} key={item.id} label={item.label} />
          )}
        </Autocomplete>
      </div>
      <Button
        color="tertiary-destructive"
        data-testid={`remove-row-${rowId}`}
        iconLeading={Trash01}
        size="sm"
        onClick={() => onRemove(rowId)}
      />
    </div>
  );
};

const TermsRowEditor: React.FC<TermsRowEditorProps> = ({
  rows,
  excludeFQN,
  preloadedTerms,
  relationTypeOptions,
  onAddRow,
  onRelationTypeChange,
  onTermsChange,
  onRemove,
}) => {
  const { t } = useTranslation();

  return (
    <div className="tw:flex tw:flex-col tw:gap-3">
      {rows.map((row) => (
        <TermsRow
          excludeFQN={excludeFQN}
          initialRelationType={row.relationType}
          initialTerms={row.terms}
          key={row.id}
          preloadedTerms={preloadedTerms}
          relationTypeOptions={relationTypeOptions}
          rowId={row.id}
          onRelationTypeChange={onRelationTypeChange}
          onRemove={onRemove}
          onTermsChange={onTermsChange}
        />
      ))}
      <Button
        className="tw:w-fit"
        color="tertiary"
        data-testid="add-row-button"
        size="sm"
        onClick={onAddRow}>
        {`+ ${t('label.add-entity', {
          entity: t('label.related-term-plural'),
        })}`}
      </Button>
    </div>
  );
};

const RelatedTerms = () => {
  const navigate = useNavigate();
  const {
    data: glossaryTerm,
    onUpdate,
    isVersionView,
    permissions,
  } = useGenericContext<GlossaryTerm>();
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [editingRows, setEditingRows] = useState<RelationEditRow[]>([]);
  const [relationTypes, setRelationTypes] = useState<
    GlossaryTermRelationType[]
  >([]);
  const [preloadedTerms, setPreloadedTerms] = useState<GlossaryTerm[]>([]);

  const termRelations = useMemo(() => {
    return glossaryTerm?.relatedTerms ?? [];
  }, [glossaryTerm?.relatedTerms]);

  const groupedRelations = useMemo(() => {
    return groupBy(termRelations, 'relationType');
  }, [termRelations]);

  const fetchRelationTypes = useCallback(async () => {
    try {
      const settings = await getGlossaryTermRelationSettings();
      if (settings?.relationTypes) {
        setRelationTypes(settings.relationTypes);
      }
    } catch {
      setRelationTypes(DEFAULT_GLOSSARY_TERM_RELATION_TYPES_FALLBACK);
    }
  }, []);

  const fetchAllTerms = useCallback(async () => {
    try {
      const result = await searchGlossaryTermsPaginated({
        offset: 0,
        limit: PAGE_SIZE_MEDIUM,
      });
      setPreloadedTerms(result.data);
    } catch {
      // silently handle
    }
  }, []);

  useEffect(() => {
    fetchRelationTypes();
    fetchAllTerms();
  }, [fetchRelationTypes, fetchAllTerms]);

  const relationTypeOptions = useMemo(
    () =>
      relationTypes.map((rt) => ({
        id: rt.name,
        label: rt.displayName,
        title: rt.description,
      })),
    [relationTypes]
  );

  const handleRelatedTermClick = (fqn: string) => {
    navigate(getGlossaryPath(fqn));
  };

  const handleStartEditing = useCallback(() => {
    if (isEmpty(termRelations)) {
      setEditingRows([
        {
          id: '0',
          relationType: relationTypes[0]?.name ?? 'relatedTo',
          terms: [],
        },
      ]);
    } else {
      const grouped = groupBy(termRelations, 'relationType');
      setEditingRows(
        Object.entries(grouped).map(([relationType, relations], idx) => ({
          id: String(idx),
          relationType,
          terms: relations
            .filter((r) => r.term?.fullyQualifiedName)
            .map((r) => ({
              value: r.term!.fullyQualifiedName!,
              label: getEntityName(r.term as EntityReference),
              entity: r.term as EntityReference,
            })),
        }))
      );
    }
    setIsEditing(true);
  }, [termRelations, relationTypes]);

  const handleStartAdding = useCallback(() => {
    setEditingRows([
      {
        id: String(Date.now()),
        relationType: relationTypes[0]?.name ?? 'relatedTo',
        terms: [],
      },
    ]);
    setIsAdding(true);
  }, [relationTypes]);

  const handleSave = useCallback(async () => {
    const rowRelations: TermRelation[] = editingRows.flatMap((row) =>
      row.terms.map((term) => ({
        relationType: row.relationType,
        term:
          term.entity ??
          ({
            fullyQualifiedName: term.value,
            type: EntityType.GLOSSARY_TERM,
          } as EntityReference),
      }))
    );
    const updatedRelations = isAdding
      ? [...termRelations, ...rowRelations]
      : rowRelations;

    await onUpdate({ ...glossaryTerm, relatedTerms: updatedRelations });
    setIsEditing(false);
    setIsAdding(false);
  }, [editingRows, glossaryTerm, onUpdate, isAdding, termRelations]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setIsAdding(false);
  }, []);

  const handleAddRow = useCallback(() => {
    setEditingRows((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        relationType: relationTypes[0]?.name ?? 'relatedTo',
        terms: [],
      },
    ]);
  }, [relationTypes]);

  const handleRemoveRow = useCallback((rowId: string) => {
    setEditingRows((prev) => prev.filter((r) => r.id !== rowId));
  }, []);

  const handleRelationTypeChange = useCallback(
    (rowId: string, relationType: string) => {
      setEditingRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, relationType } : r))
      );
    },
    []
  );

  const handleTermsChange = useCallback(
    (
      rowId: string,
      terms: Array<{ value: string; label: string; entity?: EntityReference }>
    ) => {
      setEditingRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, terms } : r))
      );
    },
    []
  );

  const getRelationDisplayName = useCallback(
    (relationType: string) => {
      const rt = relationTypes.find((r) => r.name === relationType);

      return rt?.displayName ?? relationType;
    },
    [relationTypes]
  );

  const getRelatedTermElement = useCallback(
    (
      entity: EntityReference,
      relationType?: string,
      versionStatus?: VersionStatus
    ) => (
      <RelatedTermTagButton
        entity={entity}
        getRelationDisplayName={getRelationDisplayName}
        key={`${entity.fullyQualifiedName}-${relationType}`}
        relationType={relationType}
        versionStatus={versionStatus}
        onRelatedTermClick={handleRelatedTermClick}
      />
    ),
    [getRelationDisplayName]
  );

  const getVersionRelatedTerms = useCallback(() => {
    const changeDescription = glossaryTerm.changeDescription;
    const relatedTermsDiff = getDiffByFieldName(
      EntityField.RELATEDTERMS,
      changeDescription as ChangeDescription
    );

    const addedRelatedTerms: TermRelation[] = JSON.parse(
      getChangedEntityNewValue(relatedTermsDiff) ?? '[]'
    );
    const deletedRelatedTerms: TermRelation[] = JSON.parse(
      getChangedEntityOldValue(relatedTermsDiff) ?? '[]'
    );

    const unchangedRelatedTerms = glossaryTerm.relatedTerms
      ? glossaryTerm.relatedTerms.filter(
          (relatedTerm: TermRelation) =>
            !addedRelatedTerms.some(
              (addedRelatedTerm: TermRelation) =>
                addedRelatedTerm.term?.id === relatedTerm.term?.id
            )
        )
      : [];

    const noRelations =
      isEmpty(unchangedRelatedTerms) &&
      isEmpty(addedRelatedTerms) &&
      isEmpty(deletedRelatedTerms);

    if (noRelations) {
      return <div>{NO_DATA_PLACEHOLDER}</div>;
    }

    return (
      <div className="d-flex flex-wrap">
        {unchangedRelatedTerms.map((relatedTerm: TermRelation) =>
          relatedTerm.term
            ? getRelatedTermElement(relatedTerm.term, relatedTerm.relationType)
            : null
        )}
        {addedRelatedTerms.map((relatedTerm: TermRelation) =>
          relatedTerm.term
            ? getRelatedTermElement(
                relatedTerm.term,
                relatedTerm.relationType,
                { added: true }
              )
            : null
        )}
        {deletedRelatedTerms.map((relatedTerm: TermRelation) =>
          relatedTerm.term
            ? getRelatedTermElement(
                relatedTerm.term,
                relatedTerm.relationType,
                { removed: true }
              )
            : null
        )}
      </div>
    );
  }, [glossaryTerm, getRelatedTermElement]);

  const relatedTermsContainer = useMemo(() => {
    if (isVersionView) {
      return getVersionRelatedTerms();
    }
    if (!permissions.EditAll || !isEmpty(termRelations)) {
      return (
        <div className="d-flex flex-col gap-4">
          {Object.entries(groupedRelations).map(([relationType, relations]) => (
            <div className="d-flex flex-col" key={relationType}>
              <Typography as="span">
                {getRelationDisplayName(relationType)}
              </Typography>
              <BadgeList
                items={(relations as TermRelation[]).flatMap(
                  (tr: TermRelation) =>
                    tr.term
                      ? [getRelatedTermElement(tr.term, tr.relationType)]
                      : []
                )}
              />
            </div>
          ))}
          {!permissions.EditAll && termRelations.length === 0 && (
            <div>{NO_DATA_PLACEHOLDER}</div>
          )}
        </div>
      );
    }

    return null;
  }, [
    permissions,
    termRelations,
    groupedRelations,
    isVersionView,
    getVersionRelatedTerms,
    getRelatedTermElement,
    getRelationDisplayName,
  ]);

  const header = (
    <div className="d-flex items-center justify-between w-full">
      <div className="d-flex items-center gap-2">
        <Typography as="span" className="text-sm font-medium">
          {t('label.related-term-plural')}
        </Typography>
        {permissions.EditAll && !isVersionView && !isEditing && !isAdding && (
          <>
            <EditIconButton
              newLook
              data-testid="edit-button"
              size="small"
              title={t('label.edit-entity', {
                entity: t('label.related-term-plural'),
              })}
              onClick={handleStartEditing}
            />
            <PlusIconButton
              data-testid="related-term-add-button"
              size="small"
              title={t('label.add-entity', {
                entity: t('label.related-term-plural'),
              })}
              onClick={handleStartAdding}
            />
          </>
        )}
      </div>
      {(isEditing || isAdding) && (
        <div className="d-flex items-center gap-2">
          <Button
            color="primary"
            data-testid="save-related-terms"
            size="sm"
            onClick={handleSave}>
            {t('label.save')}
          </Button>
          <Button
            color="secondary"
            data-testid="cancel-related-terms"
            size="sm"
            onClick={handleCancel}>
            {t('label.cancel')}
          </Button>
        </div>
      )}
    </div>
  );

  const sharedEditorProps: TermsRowEditorProps = {
    excludeFQN: glossaryTerm?.fullyQualifiedName ?? '',
    onAddRow: handleAddRow,
    onRelationTypeChange: handleRelationTypeChange,
    onRemove: handleRemoveRow,
    onTermsChange: handleTermsChange,
    preloadedTerms,
    relationTypeOptions,
    rows: editingRows,
  };

  const editingContent = <TermsRowEditor {...sharedEditorProps} />;

  const addingContent = (
    <div className="tw:flex tw:flex-col tw:gap-3">
      {relatedTermsContainer}
      <TermsRowEditor {...sharedEditorProps} />
    </div>
  );

  let cardContent = relatedTermsContainer;

  if (isEditing) {
    cardContent = editingContent;
  } else if (isAdding) {
    cardContent = addingContent;
  }

  return (
    <ExpandableCard
      cardProps={{ title: header }}
      dataTestId="related-term-container"
      defaultExpanded={isEditing || isAdding || !isEmpty(termRelations)}
      isExpandDisabled={!isAdding && !isEditing && termRelations.length === 0}
      key={isEditing || isAdding ? 'active' : 'inactive'}>
      {cardContent}
    </ExpandableCard>
  );
};

export default RelatedTerms;
