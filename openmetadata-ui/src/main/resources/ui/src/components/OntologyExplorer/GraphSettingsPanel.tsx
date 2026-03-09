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

import {
  Button,
  ButtonUtility,
  Dropdown,
  Toggle,
} from '@openmetadata/ui-core-components';
import { ChevronDown, Settings01, X } from '@untitledui/icons';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  GraphSettings,
  GraphSettingsPanelProps,
  LayoutAlgorithm,
} from './OntologyExplorer.interface';

const GraphSettingsPanel: React.FC<GraphSettingsPanelProps> = ({
  settings,
  onSettingsChange,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleLayoutChange = useCallback(
    (value: LayoutAlgorithm) => {
      onSettingsChange({ ...settings, layout: value });
    },
    [settings, onSettingsChange]
  );

  const handleToggle = useCallback(
    (key: keyof GraphSettings, value: boolean) => {
      onSettingsChange({ ...settings, [key]: value });
    },
    [settings, onSettingsChange]
  );

  const layoutItems = useMemo(
    () => [
      { id: 'hierarchical' as const, label: t('label.hierarchical') },
      { id: 'radial' as const, label: t('label.radial') },
      { id: 'circular' as const, label: t('label.circular') },
    ],
    [t]
  );

  const popoverContent = (
    <div className="tw:w-72 tw:min-w-0 tw:rounded-lg">
      <div className="tw:flex tw:items-center tw:justify-between tw:shrink-0  tw:border-b tw:border-gray-200">
        <span className="tw:text-sm tw:font-semibold tw:text-gray-900 tw:py-4">
          {t('label.graph-settings')}
        </span>
        <ButtonUtility
          color="tertiary"
          data-testid="graph-settings-close"
          icon={X}
          size="xs"
          tooltip={t('label.close')}
          onClick={() => setOpen(false)}
        />
      </div>
      <div className="tw:space-y-3">
        <div className="tw:space-y-1.5 tw:w-full tw:pt-4">
          <div className="tw:text-xs tw:font-semibold tw:text-gray-500">
            {t('label.layout')}
          </div>
          <div className="tw:w-full">
            <Dropdown.Root>
              <Button
                className="tw:w-full tw:justify-between"
                color="secondary"
                iconTrailing={ChevronDown}
                size="sm"
              >
                {layoutItems.find((i) => i.id === settings.layout)?.label ??
                  t('label.layout')}
              </Button>
              <Dropdown.Popover className="tw:w-72 tw:min-w-0">
                <Dropdown.Menu
                  className="tw:w-full"
                  items={layoutItems}
                  onAction={(key) => {
                    const layout = layoutItems.find((i) => i.id === key)?.id;
                    if (layout) {
                      handleLayoutChange(layout);
                    }
                  }}
                >
                  {(item) => (
                    <Dropdown.Item id={item.id} label={item.label ?? ''} />
                  )}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown.Root>
          </div>
        </div>
        <div className="tw:flex tw:flex-col tw:gap-3 tw:py-4">
          <Toggle
            isSelected={settings.showEdgeLabels}
            label={t('label.edge-labels')}
            size="sm"
            onChange={(checked) => handleToggle('showEdgeLabels', checked)}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="tw:relative" ref={panelRef}>
      <Button
        color="secondary"
        data-testid="ontology-graph-settings"
        iconLeading={<Settings01 height={20} width={20} />}
        size="sm"
        onClick={() => setOpen((prev) => !prev)}
      />
      {open && (
        <dialog
          open
          aria-label={t('label.graph-settings')}
          className="tw:absolute tw:right-0 tw:bottom-full tw:z-50 tw:mb-1 tw:rounded-lg tw:border-0 tw:bg-white tw:py-0 tw:shadow-lg tw:ring-1 tw:ring-gray-200 tw:px-4"
        >
          {popoverContent}
        </dialog>
      )}
    </div>
  );
};

export default GraphSettingsPanel;
