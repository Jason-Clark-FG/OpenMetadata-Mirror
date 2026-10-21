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

import { fireEvent, render, screen } from '@testing-library/react';
import { AxiosError } from 'axios';
import AlertsLoadErrorState from './AlertsLoadErrorState';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const errorWithStatus = (status: number) =>
  ({ response: { status } } as AxiosError);

describe('AlertsLoadErrorState', () => {
  it('offers a retry for a server error', () => {
    const onRetry = jest.fn();

    render(
      <AlertsLoadErrorState error={errorWithStatus(500)} onRetry={onRetry} />
    );

    expect(screen.getByTestId('alerts-load-error')).toBeInTheDocument();
    expect(
      screen.getByText('message.something-went-wrong')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'label.try-again' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('explains missing access on 403 and offers no retry', () => {
    render(
      <AlertsLoadErrorState error={errorWithStatus(403)} onRetry={jest.fn()} />
    );

    expect(screen.getByTestId('alerts-permission-error')).toBeInTheDocument();
    expect(screen.getByText('label.access-denied')).toBeInTheDocument();
    expect(
      screen.getByText('message.no-permission-to-view')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'label.try-again' })
    ).not.toBeInTheDocument();
  });
});
