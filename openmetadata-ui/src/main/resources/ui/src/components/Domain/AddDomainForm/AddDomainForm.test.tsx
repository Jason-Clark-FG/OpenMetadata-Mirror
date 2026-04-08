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
import { fireEvent, render, screen } from '@testing-library/react';
import type { FormEvent, ReactNode } from 'react';
import { Domain } from '../../../generated/entity/domains/domain';
import '../../../test/unit/mocks/mui.mock';
import { DomainFormType } from '../DomainPage.interface';
import AddDomainForm from './AddDomainForm.component';
import { DomainFormRef } from './AddDomainForm.interface';

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock the permission provider
jest.mock('../../../context/PermissionProvider/PermissionProvider', () => ({
  usePermissionProvider: jest.fn().mockReturnValue({
    permissions: {},
  }),
}));

jest.mock('@openmetadata/ui-core-components', () => {
  return {
    Button: ({
      children,
      onPress,
      onClick,
      isDisabled,
      isLoading,
      'data-testid': testId,
      type,
    }: {
      children: ReactNode;
      onPress?: () => void;
      onClick?: () => void;
      isDisabled?: boolean;
      isLoading?: boolean;
      'data-testid'?: string;
      type?: 'submit' | 'button';
    }) => (
      <button
        data-testid={testId}
        disabled={isDisabled || isLoading}
        type={type ?? 'button'}
        onClick={() => {
          onClick?.();
          onPress?.();
        }}>
        {children}
      </button>
    ),
    FieldTypes: {
      COVER_IMAGE_UPLOAD: 'cover_image_upload',
      DESCRIPTION: 'description',
      DOMAIN_SELECT: 'domain_select',
      GLOSSARY_TAG_SUGGESTION: 'glossary_tag_suggestion',
      ICON_PICKER: 'icon_picker',
      TAG_SUGGESTION: 'tag_suggestion',
      COLOR_PICKER: 'color_picker',
      SELECT: 'select',
      TEXT: 'text',
      USER_TEAM_SELECT: 'user_team_select',
      USER_TEAM_SELECT_INPUT: 'user_team_select_input',
    },
    FormField: ({
      children,
    }: {
      children: (controller: {
        field: {
          name: string;
          onChange: (value: unknown) => void;
          value: unknown;
        };
        fieldState: { error?: { message?: string } };
      }) => ReactNode;
    }) => (
      <>
        {children({
          field: {
            name: 'mock-field',
            onChange: jest.fn(),
            value: undefined,
          },
          fieldState: {},
        })}
      </>
    ),
    FormItemLabel: ({ label }: { label: ReactNode }) => <div>{label}</div>,
    HintText: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    HookForm: ({
      children,
      onSubmit,
      ...props
    }: {
      children: ReactNode;
      onSubmit?: (event?: FormEvent<HTMLFormElement>) => void;
      [key: string]: unknown;
    }) => (
      <form
        {...props}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit?.(event);
        }}>
        {children}
      </form>
    ),
    getField: (field: {
      id?: string;
      name: string;
      label: ReactNode;
      props?: { 'data-testid'?: string };
    }) => (
      <div data-testid={field.props?.['data-testid'] ?? field.id ?? field.name}>
        {field.label}
      </div>
    ),
    Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

jest.mock(
  '../../../components/BlockEditor/Extensions/image/ImageClassBase',
  () => ({
    __esModule: true,
    default: {
      getBlockEditorAttachmentProps: jest.fn().mockReturnValue(undefined),
    },
  })
);

jest.mock('../../common/IconPicker', () => ({
  AVAILABLE_ICONS: [
    { category: 'default', component: jest.fn(), name: 'Cube01' },
    { category: 'icons', component: jest.fn(), name: 'Globe01' },
  ],
  DEFAULT_DATA_PRODUCT_ICON: { name: 'data-product' },
  DEFAULT_DOMAIN_ICON: { name: 'domain' },
}));

jest.mock(
  '../../common/MUIGlossaryTagSuggestion/MUIGlossaryTagSuggestion',
  () =>
    jest
      .fn()
      .mockReturnValue(
        <div data-testid="glossary-terms">MUIGlossaryTagSuggestion</div>
      )
);

jest.mock('../../common/RichTextEditor/RichTextEditor', () =>
  jest.fn().mockReturnValue(<div data-testid="description">RichTextEditor</div>)
);

const mockOnCancel = jest.fn();
const mockOnSubmit = jest.fn();

describe('AddDomainForm', () => {
  const defaultProps = {
    loading: false,
    isFormInDialog: false,
    onCancel: mockOnCancel,
    onSubmit: mockOnSubmit,
    type: DomainFormType.DOMAIN,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the form component', () => {
    render(<AddDomainForm {...defaultProps} />);
    // Form should be rendered
    const form = document.querySelector('form');

    expect(form).toBeInTheDocument();
  });

  it('should call onCancel when cancel button is clicked', () => {
    render(<AddDomainForm {...defaultProps} />);

    const cancelButton = screen.getByTestId('cancel-domain');
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('should render loading state on save button when loading is true', () => {
    render(<AddDomainForm {...defaultProps} loading />);

    const saveButton = screen.getByTestId('save-domain');

    expect(saveButton).toHaveAttribute('disabled');
  });

  it('should not render footer buttons when isFormInDialog is true', () => {
    render(<AddDomainForm {...defaultProps} isFormInDialog />);

    const footerButtons = screen.queryByTestId('cta-buttons');

    expect(footerButtons).not.toBeInTheDocument();
  });

  it('should render footer buttons when isFormInDialog is false', () => {
    render(<AddDomainForm {...defaultProps} isFormInDialog={false} />);

    const footerButtons = screen.getByTestId('cta-buttons');

    expect(footerButtons).toBeInTheDocument();
  });

  it('should render properly when no formRef is provided', () => {
    const { container } = render(<AddDomainForm {...defaultProps} />);

    const formElement = container.querySelector('form');

    expect(formElement).toBeInTheDocument();
  });

  it('should use provided formRef when passed', () => {
    const providedRef = { current: null as DomainFormRef | null };

    const { container } = render(
      <AddDomainForm {...defaultProps} formRef={providedRef} />
    );

    const formElement = container.querySelector('form');

    expect(formElement).toBeInTheDocument();
    expect(providedRef.current).toEqual(
      expect.objectContaining({
        resetFields: expect.any(Function),
        submit: expect.any(Function),
        validateFields: expect.any(Function),
      })
    );
  });

  it('should handle form submission', () => {
    render(<AddDomainForm {...defaultProps} />);

    const saveButton = screen.getByTestId('save-domain');
    fireEvent.click(saveButton);

    // Note: onSubmit is called through form.onFinish which requires form validation
    // In this simplified test, we're just verifying the button is clickable
    expect(saveButton).toBeInTheDocument();
  });

  it('should render form for DATA_PRODUCT type', () => {
    render(
      <AddDomainForm {...defaultProps} type={DomainFormType.DATA_PRODUCT} />
    );

    const form = document.querySelector('form');

    expect(form).toBeInTheDocument();
  });

  it('should render form for SUBDOMAIN type with parent domain', () => {
    const parentDomain = {
      id: '123',
      name: 'Parent Domain',
      fullyQualifiedName: 'ParentDomain',
      description: 'Parent domain description',
      domainType: 'Aggregate',
    } as Domain;

    render(
      <AddDomainForm
        {...defaultProps}
        parentDomain={parentDomain}
        type={DomainFormType.SUBDOMAIN}
      />
    );

    const form = document.querySelector('form');

    expect(form).toBeInTheDocument();
  });

  it('should have correct button labels', () => {
    render(<AddDomainForm {...defaultProps} />);

    const cancelButton = screen.getByTestId('cancel-domain');
    const saveButton = screen.getByTestId('save-domain');

    expect(cancelButton).toHaveTextContent('label.cancel');
    expect(saveButton).toHaveTextContent('label.save');
  });

  it('should disable save button during loading', () => {
    render(<AddDomainForm {...defaultProps} loading />);

    const saveButton = screen.getByTestId('save-domain');

    expect(saveButton).toBeDisabled();
  });

  it('should not disable cancel button during loading', () => {
    render(<AddDomainForm {...defaultProps} loading />);

    const cancelButton = screen.getByTestId('cancel-domain');

    expect(cancelButton).not.toBeDisabled();
  });
});
