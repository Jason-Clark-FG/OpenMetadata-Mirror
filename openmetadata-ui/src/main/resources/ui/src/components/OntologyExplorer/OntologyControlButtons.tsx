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
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  useTheme,
} from '@mui/material';
import { FC, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactComponent as FitScreenIcon } from '../../assets/svg/ic-fit-screen.svg';
import { ReactComponent as FitViewOptionsIcon } from '../../assets/svg/ic-fit-view-options.svg';
import { ReactComponent as HomeIcon } from '../../assets/svg/ic-home.svg';
import { ReactComponent as MapIcon } from '../../assets/svg/ic-map.svg';
import { ReactComponent as RearrangeNodesIcon } from '../../assets/svg/ic-rearrange-nodes.svg';
import { ReactComponent as RefreshIcon } from '../../assets/svg/ic-sync.svg';
import { ReactComponent as ZoomInIcon } from '../../assets/svg/ic-zoom-in.svg';
import { ReactComponent as ZoomOutIcon } from '../../assets/svg/ic-zoom-out.svg';
import { StyledMenu } from '../LineageTable/LineageTable.styled';

export interface OntologyControlButtonsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onRefresh: () => void;
  onRearrange?: () => void;
  onFocusSelected?: () => void;
  onFocusHome?: () => void;
  onToggleMinimap?: () => void;
  isMinimapVisible?: boolean;
  isLoading?: boolean;
}

const OntologyControlButtons: FC<OntologyControlButtonsProps> = ({
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onRefresh,
  onRearrange,
  onFocusSelected,
  onFocusHome,
  onToggleMinimap,
  isMinimapVisible = false,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [viewOptionsAnchorEl, setViewOptionsAnchorEl] =
    useState<null | HTMLElement>(null);

  const handleFitView = useCallback(() => {
    onFitToScreen();
    setViewOptionsAnchorEl(null);
  }, [onFitToScreen]);

  const handleRearrange = useCallback(() => {
    onRearrange?.();
    setViewOptionsAnchorEl(null);
  }, [onRearrange]);

  const handleFocusSelected = useCallback(() => {
    onFocusSelected?.();
    setViewOptionsAnchorEl(null);
  }, [onFocusSelected]);

  const handleFocusHome = useCallback(() => {
    onFocusHome?.();
    setViewOptionsAnchorEl(null);
  }, [onFocusHome]);

  return (
    <ToggleButtonGroup
      exclusive
      className="ontology-control-buttons"
      color="primary"
      sx={{
        boxShadow: theme.shadows[1],
        background: theme.palette.background.paper,
        borderRadius: '8px',
        '& .MuiToggleButton-root': {
          border: 'none',
          padding: '6px 10px',
          '&:first-of-type': {
            borderRadius: '8px 0 0 8px',
          },
          '&:last-of-type': {
            borderRadius: '0 8px 8px 0',
          },
        },
        svg: {
          height: theme.spacing(4),
          width: theme.spacing(4),
        },
      }}>
      <Tooltip arrow placement="top" title={t('label.view-option-plural')}>
        <ToggleButton
          data-testid="view-options"
          value="view-options"
          onClick={(event) => setViewOptionsAnchorEl(event.currentTarget)}>
          <FitViewOptionsIcon />
        </ToggleButton>
      </Tooltip>

      <StyledMenu
        anchorEl={viewOptionsAnchorEl}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        id="ontology-view-options-menu"
        open={Boolean(viewOptionsAnchorEl)}
        slotProps={{
          paper: {
            sx: {
              marginTop: '4px',
            },
          },
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        onClose={() => setViewOptionsAnchorEl(null)}>
        <MenuItem onClick={handleFitView}>
          <FitScreenIcon />
          {t('label.fit-to-screen')}
        </MenuItem>
        {onFocusSelected && (
          <MenuItem onClick={handleFocusSelected}>
            <FitViewOptionsIcon />
            {t('label.focus-selected')}
          </MenuItem>
        )}
        {onRearrange && (
          <MenuItem onClick={handleRearrange}>
            <RearrangeNodesIcon />
            {t('label.rearrange-nodes')}
          </MenuItem>
        )}
        {onFocusHome && (
          <MenuItem onClick={handleFocusHome}>
            <HomeIcon />
            {t('label.focus-home')}
          </MenuItem>
        )}
      </StyledMenu>

      {onToggleMinimap && (
        <Tooltip arrow placement="top" title={t('label.mind-map')}>
          <ToggleButton
            data-testid="toggle-minimap"
            selected={isMinimapVisible}
            value="minimap"
            onClick={onToggleMinimap}>
            <MapIcon />
          </ToggleButton>
        </Tooltip>
      )}

      <Tooltip arrow placement="top" title={t('label.zoom-in')}>
        <ToggleButton data-testid="zoom-in" value="zoom-in" onClick={onZoomIn}>
          <ZoomInIcon />
        </ToggleButton>
      </Tooltip>

      <Tooltip arrow placement="top" title={t('label.zoom-out')}>
        <ToggleButton
          data-testid="zoom-out"
          value="zoom-out"
          onClick={onZoomOut}>
          <ZoomOutIcon />
        </ToggleButton>
      </Tooltip>

      <Tooltip arrow placement="top" title={t('label.refresh')}>
        <ToggleButton
          data-testid="refresh"
          disabled={isLoading}
          value="refresh"
          onClick={onRefresh}>
          <RefreshIcon className={isLoading ? 'rotate-animation' : ''} />
        </ToggleButton>
      </Tooltip>
    </ToggleButtonGroup>
  );
};

export default OntologyControlButtons;
