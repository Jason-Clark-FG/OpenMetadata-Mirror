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
import { render, screen } from '@testing-library/react';
import AlertOwnersInline from './AlertOwnersInline';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Boundary: the picker fetches users and teams on open.
jest.mock(
  '../../common/UserTeamSelectableList/UserTeamSelectableList.component',
  () => ({
    UserTeamSelectableList: () => <button>edit-owners</button>,
  })
);

const owner = { id: 'u1', name: 'aaron', displayName: 'Aaron', type: 'user' };

describe('AlertOwnersInline', () => {
  it('shows the label, the owner and the edit control on one row', () => {
    render(
      <AlertOwnersInline hasPermission owners={[owner]} onUpdate={jest.fn()} />
    );

    const row = screen.getByTestId('alert-owners');

    expect(row).toHaveTextContent('label.owner-plural');
    expect(row).toHaveTextContent('edit-owners');
    expect(row.querySelector('[data-testid="owner-label"]')).not.toBeNull();
  });

  it('shows only the label and edit control when there are no owners', () => {
    render(
      <AlertOwnersInline hasPermission owners={[]} onUpdate={jest.fn()} />
    );

    const row = screen.getByTestId('alert-owners');

    expect(row).toHaveTextContent('label.owner-plural');
    expect(row).toHaveTextContent('edit-owners');
    expect(row).not.toHaveTextContent('label.no-owners');
  });

  it('renders nothing for a viewer when there are no owners to show', () => {
    render(
      <AlertOwnersInline
        hasPermission={false}
        owners={[]}
        onUpdate={jest.fn()}
      />
    );

    expect(screen.queryByTestId('alert-owners')).not.toBeInTheDocument();
  });

  it('hides the edit control without permission', () => {
    render(
      <AlertOwnersInline
        hasPermission={false}
        owners={[owner]}
        onUpdate={jest.fn()}
      />
    );

    expect(screen.getByTestId('alert-owners')).not.toHaveTextContent(
      'edit-owners'
    );
  });
});
