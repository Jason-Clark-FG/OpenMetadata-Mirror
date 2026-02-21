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
import { fireEvent, render, screen } from '@testing-library/react';
import { Key } from 'react-aria-components';
import Autocomplete from './Autocomplete';

jest.mock('react-stately', () => ({
  useListData: ({
    initialItems,
  }: {
    initialItems: { id: string; label: string }[];
  }) => {
    const items = [...initialItems];

    return {
      items,
      append: jest.fn((item: { id: string; label: string }) =>
        items.push(item)
      ),
      remove: jest.fn((id: string) => {
        const idx = items.findIndex((i) => i.id === id);
        if (idx !== -1) {
          items.splice(idx, 1);
        }
      }),
    };
  },
}));

jest.mock('@openmetadata/ui-core-components', () => ({
  MultiSelect: Object.assign(
    ({
      label,
      placeholder,
      isRequired,
      onItemInserted,
      children,
      items = [],
    }: {
      label?: string;
      placeholder?: string;
      isRequired?: boolean;
      onItemInserted?: (key: Key) => void;
      onItemCleared?: (key: Key) => void;
      children: (item: { id: string; label: string }) => React.ReactNode;
      items?: { id: string; label: string }[];
    }) => (
      <div>
        {label && <label>{label}</label>}
        <input
          data-testid="multiselect-input"
          placeholder={placeholder}
          required={isRequired}
        />
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <button onClick={() => onItemInserted?.(item.id)}>
                {children(item)}
              </button>
            </li>
          ))}
        </ul>
        <div data-testid="selected-items" />
      </div>
    ),
    {
      Item: ({ children }: { children: React.ReactNode }) => (
        <span>{children}</span>
      ),
    }
  ),
}));

describe('Autocomplete', () => {
  const mockOnChange = jest.fn();
  const defaultProps = {
    value: [],
    onChange: mockOnChange,
    label: 'Test Label',
    placeholder: 'Test Placeholder',
    options: ['Option 1', 'Option 2', 'Option 3'],
    dataTestId: 'test-autocomplete',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the component', () => {
    render(<Autocomplete {...defaultProps} />);

    expect(screen.getByTestId('test-autocomplete')).toBeInTheDocument();
  });

  it('should display the label', () => {
    render(<Autocomplete {...defaultProps} />);

    expect(screen.getByText('Test Label')).toBeInTheDocument();
  });

  it('should display placeholder', () => {
    render(<Autocomplete {...defaultProps} />);

    expect(screen.getByPlaceholderText('Test Placeholder')).toBeInTheDocument();
  });

  it('should render options as list items', () => {
    render(<Autocomplete {...defaultProps} />);

    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
    expect(screen.getByText('Option 3')).toBeInTheDocument();
  });

  it('should call onChange when an option is selected', () => {
    render(<Autocomplete {...defaultProps} />);

    fireEvent.click(screen.getByText('Option 1'));

    expect(mockOnChange).toHaveBeenCalledWith(['Option 1']);
  });

  it('should add a custom value when Enter is pressed', () => {
    render(<Autocomplete {...defaultProps} />);

    const wrapper = screen.getByTestId('test-autocomplete');
    const input = screen.getByTestId('multiselect-input');

    Object.defineProperty(input, 'value', {
      value: 'Custom Value',
      writable: true,
    });
    fireEvent.keyDown(wrapper, { key: 'Enter' });

    expect(mockOnChange).toHaveBeenCalled();
  });

  it('should apply required attribute when required prop is true', () => {
    render(<Autocomplete {...defaultProps} required />);

    expect(screen.getByTestId('multiselect-input')).toBeRequired();
  });

  it('should not apply required attribute when required prop is false', () => {
    render(<Autocomplete {...defaultProps} required={false} />);

    expect(screen.getByTestId('multiselect-input')).not.toBeRequired();
  });

  it('should handle empty options array', () => {
    render(<Autocomplete {...defaultProps} options={[]} />);

    expect(screen.getByTestId('test-autocomplete')).toBeInTheDocument();
  });

  it('should handle undefined onChange', () => {
    render(<Autocomplete {...defaultProps} onChange={undefined} />);

    fireEvent.click(screen.getByText('Option 1'));

    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('should render with both label and options', () => {
    render(<Autocomplete {...defaultProps} />);

    expect(screen.getByText('Test Label')).toBeInTheDocument();
    expect(screen.getByText('Option 1')).toBeInTheDocument();
  });

  it('should support memoization without breaking rendering', () => {
    const { rerender } = render(<Autocomplete {...defaultProps} />);

    rerender(<Autocomplete {...defaultProps} />);

    expect(screen.getByTestId('test-autocomplete')).toBeInTheDocument();
  });
});
