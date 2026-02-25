/*
 *  Copyright 2025 Collate.
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

/**
 * Shared mock helpers for @openmetadata/ui-core-components.
 *
 * Import this file in test files that need to mock the package:
 *   jest.mock('@openmetadata/ui-core-components', () =>
 *     require('../../../test/unit/mocks/ui-core-components.mock')
 *   );
 *
 * Or spread it alongside specific overrides:
 *   jest.mock('@openmetadata/ui-core-components', () => ({
 *     ...require('../../../test/unit/mocks/ui-core-components.mock'),
 *     SomeOtherExport: jest.fn(),
 *   }));
 */

import React from 'react';
window.React = React;

const Toggle = ({ children, onChange, isSelected, isDisabled, ...props }) =>
  React.createElement(
    'button',
    {
      role: 'switch',
      'aria-checked': isSelected ? 'true' : 'false',
      disabled: isDisabled,
      onClick: () => onChange && onChange(!isSelected),
      ...props,
    },
    children
  );

const Tooltip = ({ children, title }) =>
  React.createElement('div', { title }, children);

const TooltipTrigger = ({ children, className }) =>
  React.createElement('button', { className }, children);

const Badge = ({ children, 'data-testid': testId }) =>
  React.createElement('span', { 'data-testid': testId }, children);

const SlideoutMenu = ({ children, isOpen, onOpenChange }) => {
  if (!isOpen) {
    return null;
  }
  const close = () => onOpenChange && onOpenChange(false);
  const content =
    typeof children === 'function'
      ? children({ close, isEntering: false, isExiting: false })
      : children;

  return React.createElement('div', { role: 'dialog' }, content);
};
SlideoutMenu.Trigger = ({ children }) =>
  React.createElement('div', null, children);
SlideoutMenu.Content = ({ children }) =>
  React.createElement('div', null, children);
SlideoutMenu.Header = ({ children, onClose }) =>
  React.createElement(
    'div',
    null,
    children,
    onClose && React.createElement('button', { onClick: onClose }, 'Close')
  );
SlideoutMenu.Footer = ({ children }) =>
  React.createElement('div', null, children);

module.exports = {
  Toggle,
  Tooltip,
  TooltipTrigger,
  Badge,
  SlideoutMenu,
};
