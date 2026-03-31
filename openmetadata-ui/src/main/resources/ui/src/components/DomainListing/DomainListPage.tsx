/*
 *  Copyright 2023 Collate.
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
  Avatar,
  BadgeWithIcon,
  Box,
  Card,
  Typography,
} from '@openmetadata/ui-core-components';
import { Tag01 } from '@untitledui/icons';
import { useForm } from 'antd/lib/form/Form';
import { isEmpty } from 'lodash';
import { useSnackbar } from 'notistack';
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactComponent as FolderEmptyIcon } from '../../assets/svg/folder-empty.svg';
import { LEARNING_PAGE_IDS } from '../../constants/Learning.constants';
import { usePermissionProvider } from '../../context/PermissionProvider/PermissionProvider';
import { ERROR_PLACEHOLDER_TYPE } from '../../enums/common.enum';
import { EntityType } from '../../enums/entity.enum';
import { CreateDataProduct } from '../../generated/api/domains/createDataProduct';
import { CreateDomain } from '../../generated/api/domains/createDomain';
import { Domain } from '../../generated/entity/domains/domain';
import { TagLabel } from '../../generated/type/tagLabel';
import { withPageLayout } from '../../hoc/withPageLayout';
import { addDomains, patchDomains } from '../../rest/domainAPI';
import { createEntityWithCoverImage } from '../../utils/CoverImageUploadUtils';
import { getEntityName } from '../../utils/EntityUtils';
import { getEntityAvatarProps } from '../../utils/IconUtils';
import { getClassificationTags, getGlossaryTags } from '../../utils/TagsUtils';
import { useDelete } from '../common/atoms/actions/useDelete';
import { useDomainCardTemplates } from '../common/atoms/domain/ui/useDomainCardTemplates';
import { useDomainFilters } from '../common/atoms/domain/ui/useDomainFilters';
import { useFormDrawerWithRef } from '../common/atoms/drawer';
import { useFilterSelection } from '../common/atoms/filters/useFilterSelection';
import { useBreadcrumbs } from '../common/atoms/navigation/useBreadcrumbs';
import { usePageHeader } from '../common/atoms/navigation/usePageHeader';
import { useSearch } from '../common/atoms/navigation/useSearch';
import { useTitleAndCount } from '../common/atoms/navigation/useTitleAndCount';
import { useViewToggle } from '../common/atoms/navigation/useViewToggle';
import { usePaginationControls } from '../common/atoms/pagination/usePaginationControls';
import { useCardView } from '../common/atoms/table/useCardView';
import EntityListingTable, {
  ColumnDef,
} from '../common/EntityListingTable/EntityListingTable';
import ErrorPlaceHolder from '../common/ErrorWithPlaceholder/ErrorPlaceHolder';
import { OwnerLabel } from '../common/OwnerLabel/OwnerLabel.component';
import AddDomainForm from '../Domain/AddDomainForm/AddDomainForm.component';
import { DomainFormType } from '../Domain/DomainPage.interface';
import { DomainTypeChip } from './components/DomainTypeChip';
import DomainTreeView from './components/DomainTreeView';
import { useDomainListingData } from './hooks/useDomainListingData';

const DomainListPage = () => {
  const domainListing = useDomainListingData();
  const { t } = useTranslation();
  const { permissions } = usePermissionProvider();
  const [form] = useForm();
  const [isLoading, setIsLoading] = useState(false);
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const [treeRefreshToken, setTreeRefreshToken] = useState(0);

  const { quickFilters, defaultFilters } = useDomainFilters({
    aggregations: domainListing.aggregations || undefined,
    parsedFilters: domainListing.parsedFilters,
    onFilterChange: domainListing.handleFilterChange,
  });

  const { filterSelectionDisplay } = useFilterSelection({
    urlState: domainListing.urlState,
    filterConfigs: defaultFilters,
    parsedFilters: domainListing.parsedFilters,
    onFilterChange: domainListing.handleFilterChange,
  });

  const { formDrawer, openDrawer, closeDrawer } = useFormDrawerWithRef({
    title: t('label.add-entity', { entity: t('label.domain') }),
    width: 670,
    closeOnEscape: false,
    onCancel: () => {
      form.resetFields();
    },
    form: (
      <AddDomainForm
        isFormInDialog
        formRef={form}
        loading={isLoading}
        type={DomainFormType.DOMAIN}
        onCancel={() => {}}
        onSubmit={async (formData: CreateDomain | CreateDataProduct) => {
          setIsLoading(true);
          try {
            await createEntityWithCoverImage({
              formData: formData as CreateDomain,
              entityType: EntityType.DOMAIN,
              entityLabel: t('label.domain'),
              entityPluralLabel: 'domains',
              createEntity: addDomains,
              patchEntity: patchDomains,
              onSuccess: () => {
                closeDrawer();
                refreshAllDomains();
              },
              enqueueSnackbar,
              closeSnackbar,
              t,
            });
          } finally {
            setIsLoading(false);
          }
        }}
      />
    ),
    formRef: form,
    onSubmit: () => {},
    loading: isLoading,
  });

  const { breadcrumbs } = useBreadcrumbs({
    items: [{ name: t('label.domain-plural'), url: '/domain' }],
  });

  const { pageHeader } = usePageHeader({
    titleKey: 'label.domain-plural',
    descriptionMessageKey: 'message.domain-description',
    createPermission: permissions.domain?.Create || false,
    addButtonLabelKey: 'label.add-domain',
    addButtonTestId: 'add-domain',
    onAddClick: openDrawer,
    learningPageId: LEARNING_PAGE_IDS.DOMAIN,
  });

  const { titleAndCount } = useTitleAndCount({
    titleKey: 'label.domain',
    count: domainListing.totalEntities,
    loading: domainListing.loading,
  });

  const { search } = useSearch({
    searchPlaceholder: t('label.search'),
    onSearchChange: domainListing.handleSearchChange,
    initialSearchQuery: domainListing.urlState.searchQuery,
  });

  const { view, viewToggle, isTreeView } = useViewToggle({
    views: ['table', 'card', 'tree'],
  });
  const { domainCardTemplate } = useDomainCardTemplates();

  useEffect(() => {
    if (isTreeView && !isEmpty(domainListing.urlState.filters)) {
      domainListing.handleFilterChange([]);
    }
  }, [isTreeView]);

  const domainColumns: ColumnDef[] = useMemo(
    () => [
      { id: 'name', label: t('label.domain') },
      { id: 'owners', label: t('label.owner-plural') },
      { id: 'glossaryTerms', label: t('label.glossary-term-plural') },
      { id: 'domainType', label: t('label.domain-type') },
      { id: 'tags', label: t('label.tag-plural') },
    ],
    [t]
  );

  const renderTagList = useCallback((tags: TagLabel[]): ReactNode => {
    if (!tags.length) {
      return <Typography size="text-sm">-</Typography>;
    }

    const firstTag = tags[0];
    const remaining = tags.length - 1;

    return (
      <Box align="center" direction="row" gap={1}>
        <BadgeWithIcon
          color="gray"
          iconLeading={Tag01}
          key={firstTag.tagFQN}
          size="lg"
          type="color">
          {firstTag.displayName || firstTag.tagFQN}
        </BadgeWithIcon>
        {remaining > 0 && (
          <Typography size="text-xs" weight="medium">
            +{remaining}
          </Typography>
        )}
      </Box>
    );
  }, []);

  const renderDomainCell = useCallback(
    (entity: Domain, columnId: string): ReactNode => {
      switch (columnId) {
        case 'name':
          return (
            <Box align="center" direction="row" gap={3}>
              <Avatar size="md" {...getEntityAvatarProps(entity)} />
              <Typography size="text-sm" weight="medium">
                {getEntityName(entity)}
              </Typography>
            </Box>
          );
        case 'domainType':
          return entity.domainType ? (
            <DomainTypeChip domainType={entity.domainType} />
          ) : (
            <Typography size="text-sm">-</Typography>
          );
        case 'owners':
          return (
            <OwnerLabel
              isCompactView={false}
              maxVisibleOwners={4}
              owners={entity.owners}
              showLabel={false}
            />
          );
        case 'glossaryTerms':
          return renderTagList(getGlossaryTags(entity.tags));
        case 'tags':
          return renderTagList(getClassificationTags(entity.tags));
        default:
          return null;
      }
    },
    [renderTagList]
  );

  const { cardView } = useCardView({
    listing: domainListing,
    cardTemplate: domainCardTemplate,
  });

  const { paginationControls } = usePaginationControls({
    currentPage: domainListing.currentPage,
    totalPages: domainListing.totalPages,
    totalEntities: domainListing.totalEntities,
    pageSize: domainListing.pageSize,
    onPageChange: domainListing.handlePageChange,
    loading: domainListing.loading,
  });

  const { refetch: refetchDomainListing } = domainListing;

  const refreshAllDomains = useCallback(() => {
    refetchDomainListing();
    setTreeRefreshToken((prev) => prev + 1);
  }, [refetchDomainListing]);

  const selectedDomainEntities = useMemo(
    () =>
      domainListing.entities.filter((entity) =>
        domainListing.selectedEntities.includes(entity.id)
      ),
    [domainListing.entities, domainListing.selectedEntities]
  );

  const { deleteIconButton, deleteModal } = useDelete({
    entityType: 'domains',
    entityLabel: 'Domain',
    selectedEntities: selectedDomainEntities,
    onDeleteComplete: () => {
      domainListing.clearSelection();
      refreshAllDomains();
    },
  });

  const content = useMemo(() => {
    if (isTreeView) {
      return (
        <Box style={{ padding: '0 24px 24px' }}>
          <DomainTreeView
            filters={domainListing.urlState.filters}
            openAddDomainDrawer={openDrawer}
            refreshToken={treeRefreshToken}
            searchQuery={domainListing.urlState.searchQuery}
          />
        </Box>
      );
    }

    if (!domainListing.loading && isEmpty(domainListing.entities)) {
      return (
        <ErrorPlaceHolder
          buttonId="domain-add-button"
          buttonTitle={t('label.add-entity', {
            entity: t('label.domain'),
          })}
          className="border-none"
          heading={t('message.no-data-message', {
            entity: t('label.domain-lowercase-plural'),
          })}
          icon={<FolderEmptyIcon />}
          permission={permissions.domain?.Create}
          type={ERROR_PLACEHOLDER_TYPE.MUI_CREATE}
          onClick={openDrawer}
        />
      );
    }

    if (view === 'table') {
      return (
        <>
          <EntityListingTable
            ariaLabel={t('label.domain')}
            columns={domainColumns}
            entities={domainListing.entities}
            loading={domainListing.loading}
            renderCell={renderDomainCell}
            selectedEntities={domainListing.selectedEntities}
            onEntityClick={domainListing.actionHandlers.onEntityClick}
            onSelect={domainListing.handleSelect}
            onSelectAll={domainListing.handleSelectAll}
          />
          {paginationControls}
        </>
      );
    }

    return (
      <>
        {cardView}
        {paginationControls}
      </>
    );
  }, [
    isTreeView,
    domainListing.loading,
    domainListing.entities,
    domainListing.selectedEntities,
    domainListing.actionHandlers,
    domainListing.urlState.filters,
    domainListing.urlState.searchQuery,
    view,
    cardView,
    paginationControls,
    treeRefreshToken,
    openDrawer,
    refreshAllDomains,
    t,
    permissions.domain?.Create,
  ]);

  return (
    <Box
      direction="col"
      style={isTreeView ? { height: 'calc(100vh - 80px)' } : {}}>
      {breadcrumbs}
      {pageHeader}

      <Card style={{ marginBottom: 20 }} variant="elevated">
        <Box
          direction="col"
          gap={4}
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--color-border-secondary)',
          }}>
          <Box align="center" direction="row" gap={5}>
            {titleAndCount}
            {search}
            {!isTreeView && quickFilters}
            <Box style={{ marginLeft: 'auto' }} />
            {viewToggle}
            {deleteIconButton}
          </Box>
          {!isTreeView && filterSelectionDisplay}
        </Box>
        {content}
      </Card>
      {deleteModal}
      {formDrawer}
    </Box>
  );
};

export default withPageLayout(DomainListPage);
