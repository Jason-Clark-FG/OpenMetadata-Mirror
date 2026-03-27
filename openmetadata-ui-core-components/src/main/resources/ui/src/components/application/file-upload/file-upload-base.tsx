import { Button } from '@/components/base/buttons/button';
import { ButtonUtility } from '@/components/base/buttons/button-utility';
import { ProgressBar } from '@/components/base/progress-indicators/progress-indicators';
import { FeaturedIcon } from '@/components/foundations/featured-icon/featured-icon';
import { cx } from '@/utils/cx';
import type { FileIcon } from '@untitledui/file-icons';
import { FileIcon as FileTypeIcon } from '@untitledui/file-icons';
import {
  CheckCircle,
  Trash01,
  UploadCloud02,
  XCircle,
} from '@untitledui/icons';
import { AnimatePresence, motion } from 'motion/react';
import type { ComponentProps, ComponentPropsWithRef, ReactNode } from 'react';
import { useId, useRef, useState } from 'react';

/**
 * Returns a human-readable file size.
 * @param bytes - The size of the file in bytes.
 * @returns A string representing the file size in a human-readable format.
 */
export const getReadableFileSize = (bytes: number) => {
  if (bytes === 0) {
    return '0 KB';
  }

  const suffixes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return Math.floor(bytes / Math.pow(1024, i)) + ' ' + suffixes[i];
};

interface FileUploadDropZoneProps {
  /** The class name of the drop zone. */
  className?: string;
  /**
   * Render prop receiving `openFilePicker` to trigger the file dialog.
   */
  children?: (openFilePicker: () => void) => ReactNode;
  /**
   * Disables dropping or uploading files.
   */
  isDisabled?: boolean;
  /**
   * Specifies the types of files that the server accepts.
   * Examples: "image/*", ".pdf,image/*", "image/*,video/mpeg,application/pdf"
   */
  accept?: string;
  /**
   * Allows multiple file uploads.
   */
  allowsMultiple?: boolean;
  /**
   * Maximum file size in bytes.
   */
  maxSize?: number;
  /**
   * Callback function that is called with the list of dropped files
   * when files are dropped on the drop zone.
   */
  onDropFiles?: (files: FileList) => void;
  /**
   * Callback function that is called with the list of unaccepted files
   * when files are dropped on the drop zone.
   */
  onDropUnacceptedFiles?: (files: FileList) => void;
  /**
   * Callback function that is called with the list of files that exceed
   * the size limit when files are dropped on the drop zone.
   */
  onSizeLimitExceed?: (files: FileList) => void;
}

export const FileUploadDropZone = ({
  className,
  children,
  isDisabled,
  accept,
  allowsMultiple = true,
  maxSize,
  onDropFiles,
  onDropUnacceptedFiles,
  onSizeLimitExceed,
}: FileUploadDropZoneProps) => {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isInvalid, setIsInvalid] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const isFileTypeAccepted = (file: File): boolean => {
    if (!accept) {
      return true;
    }

    // Split the accept string into individual types
    const acceptedTypes = accept.split(',').map((type) => type.trim());

    return acceptedTypes.some((acceptedType) => {
      // Handle file extensions (e.g., .pdf, .doc)
      if (acceptedType.startsWith('.')) {
        const extension = `.${file.name.split('.').pop()?.toLowerCase()}`;

        return extension === acceptedType.toLowerCase();
      }

      // Handle wildcards (e.g., image/*)
      if (acceptedType.endsWith('/*')) {
        const typePrefix = acceptedType.split('/')[0];

        return file.type.startsWith(`${typePrefix}/`);
      }

      // Handle exact MIME types (e.g., application/pdf)
      return file.type === acceptedType;
    });
  };

  const handleDragIn = (event: React.DragEvent<HTMLDivElement>) => {
    if (isDisabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragOut = (event: React.DragEvent<HTMLDivElement>) => {
    if (isDisabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
  };

  const processFiles = (files: File[]): void => {
    // Reset the invalid state when processing files.
    setIsInvalid(false);

    const acceptedFiles: File[] = [];
    const unacceptedFiles: File[] = [];
    const oversizedFiles: File[] = [];

    // If multiple files are not allowed, only process the first file
    const filesToProcess = allowsMultiple ? files : files.slice(0, 1);

    filesToProcess.forEach((file) => {
      // Check file size first
      if (maxSize && file.size > maxSize) {
        oversizedFiles.push(file);

        return;
      }

      // Then check file type
      if (isFileTypeAccepted(file)) {
        acceptedFiles.push(file);
      } else {
        unacceptedFiles.push(file);
      }
    });

    // Handle oversized files
    if (oversizedFiles.length > 0 && typeof onSizeLimitExceed === 'function') {
      const dataTransfer = new DataTransfer();
      oversizedFiles.forEach((file) => dataTransfer.items.add(file));

      setIsInvalid(true);
      onSizeLimitExceed(dataTransfer.files);
    }

    // Handle accepted files
    if (acceptedFiles.length > 0 && typeof onDropFiles === 'function') {
      const dataTransfer = new DataTransfer();
      acceptedFiles.forEach((file) => dataTransfer.items.add(file));
      onDropFiles(dataTransfer.files);
    }

    // Handle unaccepted files
    if (
      unacceptedFiles.length > 0 &&
      typeof onDropUnacceptedFiles === 'function'
    ) {
      const unacceptedDataTransfer = new DataTransfer();
      unacceptedFiles.forEach((file) => unacceptedDataTransfer.items.add(file));

      setIsInvalid(true);
      onDropUnacceptedFiles(unacceptedDataTransfer.files);
    }

    // Clear the input value to ensure the same file can be selected again
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (isDisabled) {
      return;
    }

    handleDragOut(event);
    processFiles(Array.from(event.dataTransfer.files));
  };

  const handleInputFileChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    processFiles(Array.from(event.target.files || []));
  };

  return (
    <div
      data-dropzone
      className={cx(
        'tw:relative tw:flex tw:flex-col tw:items-center tw:gap-3 tw:rounded-xl tw:bg-primary tw:px-6 tw:py-4 tw:text-tertiary tw:ring-1 tw:ring-secondary tw:transition tw:duration-100 tw:ease-linear tw:ring-inset',
        isDraggingOver && 'tw:ring-2 tw:ring-brand',
        isDisabled
          ? 'tw:cursor-not-allowed tw:bg-secondary'
          : 'tw:cursor-pointer',
        className
      )}
      onClick={isDisabled ? undefined : () => inputRef.current?.click()}
      onDragEnd={handleDragOut}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDragIn}
      onDrop={handleDrop}>
      <input
        accept={accept}
        className="tw:sr-only"
        disabled={isDisabled}
        id={id}
        multiple={allowsMultiple}
        ref={inputRef}
        type="file"
        onChange={handleInputFileChange}
      />
      <FeaturedIcon
        className={cx(isDisabled && 'tw:opacity-50')}
        color="gray"
        icon={UploadCloud02}
        size="md"
        theme="modern"
      />

      <div className="tw:relative tw:flex tw:flex-col tw:gap-1 tw:text-center">
        {children?.(() => inputRef.current?.click())}
      </div>

      {isInvalid && (
        <p className="tw:text-xs tw:text-error-primary tw:transition tw:duration-100 tw:ease-linear" />
      )}
    </div>
  );
};

export interface FileListItemProps {
  /** The name of the file. */
  name: string;
  /** The size of the file. */
  size: number;
  /** The upload progress of the file. */
  progress: number;
  /** Whether the file failed to upload. */
  failed?: boolean;
  /** The type of the file. */
  type?: ComponentProps<typeof FileIcon>['type'];
  /** The class name of the file list item. */
  className?: string;
  /** The variant of the file icon. */
  fileIconVariant?: ComponentProps<typeof FileTypeIcon>['variant'];
  /** The function to call when the file is deleted. */
  onDelete?: () => void;
  /** The function to call when the file upload is retried. */
  onRetry?: () => void;
}

export const FileListItemProgressBar = ({
  name,
  size,
  progress,
  failed,
  type,
  fileIconVariant,
  onDelete,
  onRetry,
  className,
}: FileListItemProps) => {
  const isComplete = progress === 100;

  return (
    <motion.li
      className={cx(
        'tw:relative tw:flex tw:gap-3 tw:rounded-xl tw:bg-primary tw:p-4 tw:ring-1 tw:ring-secondary tw:transition-shadow tw:duration-100 tw:ease-linear tw:ring-inset',
        failed && 'tw:ring-2 tw:ring-error',
        className
      )}
      layout="position">
      <FileTypeIcon
        className="tw:size-10 tw:shrink-0 tw:dark:hidden"
        theme="light"
        type={type ?? 'empty'}
        variant={fileIconVariant ?? 'default'}
      />
      <FileTypeIcon
        className="tw:size-10 tw:shrink-0 tw:not-dark:hidden"
        theme="dark"
        type={type ?? 'empty'}
        variant={fileIconVariant ?? 'default'}
      />

      <div className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:items-start">
        <div className="tw:flex tw:w-full tw:max-w-full tw:min-w-0 tw:flex-1">
          <div className="tw:min-w-0 tw:flex-1">
            <p className="tw:truncate tw:text-sm tw:font-medium tw:text-secondary">
              {name}
            </p>

            <div className="tw:mt-0.5 tw:flex tw:items-center tw:gap-2">
              <p className="tw:truncate tw:text-sm tw:whitespace-nowrap tw:text-tertiary">
                {getReadableFileSize(size)}
              </p>

              <hr className="tw:h-3 tw:w-px tw:rounded-t-full tw:rounded-b-full tw:border-none tw:bg-border-primary" />

              <div className="tw:flex tw:items-center tw:gap-1">
                {isComplete && (
                  <CheckCircle className="tw:size-4 tw:stroke-[2.5px] tw:text-fg-success-primary" />
                )}
                {isComplete && (
                  <p className="tw:text-sm tw:font-medium tw:text-success-primary">
                    Complete
                  </p>
                )}

                {!isComplete && !failed && (
                  <UploadCloud02 className="tw:size-4 tw:stroke-[2.5px] tw:text-fg-quaternary" />
                )}
                {!isComplete && !failed && (
                  <p className="tw:text-sm tw:font-medium tw:text-quaternary">
                    Uploading...
                  </p>
                )}

                {failed && (
                  <XCircle className="tw:size-4 tw:text-fg-error-primary" />
                )}
                {failed && (
                  <p className="tw:text-sm tw:font-medium tw:text-error-primary">
                    Failed
                  </p>
                )}
              </div>
            </div>
          </div>

          <ButtonUtility
            className="tw:-mt-2 tw:-mr-2 tw:self-start"
            color="tertiary"
            icon={Trash01}
            size="xs"
            tooltip="Delete"
            onClick={onDelete}
          />
        </div>

        {!failed && (
          <div className="tw:mt-1 tw:w-full">
            <ProgressBar
              labelPosition="right"
              max={100}
              min={0}
              value={progress}
            />
          </div>
        )}

        {failed && (
          <Button
            className="tw:mt-1.5"
            color="link-destructive"
            size="sm"
            onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </motion.li>
  );
};

export const FileListItemProgressFill = ({
  name,
  size,
  progress,
  failed,
  type,
  fileIconVariant,
  onDelete,
  onRetry,
  className,
}: FileListItemProps) => {
  const isComplete = progress === 100;

  return (
    <motion.li
      className={cx(
        'tw:relative tw:flex tw:gap-3 tw:overflow-hidden tw:rounded-xl tw:bg-primary tw:p-4',
        className
      )}
      layout="position">
      <div
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress}
        className={cx(
          'tw:absolute tw:inset-0 tw:size-full tw:bg-secondary tw:transition tw:duration-75 tw:ease-linear',
          isComplete && 'tw:opacity-0'
        )}
        role="progressbar"
        style={{ transform: `translateX(-${100 - progress}%)` }}
      />
      <div
        className={cx(
          'tw:absolute tw:inset-0 tw:size-full tw:rounded-[inherit] tw:ring-1 tw:ring-secondary tw:transition tw:duration-100 tw:ease-linear tw:ring-inset',
          failed && 'tw:ring-2 tw:ring-error'
        )}
      />
      <FileTypeIcon
        className="tw:relative tw:size-10 tw:shrink-0 tw:dark:hidden"
        theme="light"
        type={type ?? 'empty'}
        variant={fileIconVariant ?? 'solid'}
      />
      <FileTypeIcon
        className="tw:relative tw:size-10 tw:shrink-0 tw:not-dark:hidden"
        theme="dark"
        type={type ?? 'empty'}
        variant={fileIconVariant ?? 'solid'}
      />

      <div className="tw:relative tw:flex tw:min-w-0 tw:flex-1">
        <div className="tw:relative tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:items-start">
          <div className="tw:w-full tw:min-w-0 tw:flex-1">
            <p className="tw:truncate tw:text-sm tw:font-medium tw:text-secondary">
              {name}
            </p>

            <div className="tw:mt-0.5 tw:flex tw:items-center tw:gap-2">
              <p className="tw:text-sm tw:text-tertiary">
                {failed
                  ? 'Upload failed, please try again'
                  : getReadableFileSize(size)}
              </p>

              {!failed && (
                <>
                  <hr className="tw:h-3 tw:w-px tw:rounded-t-full tw:rounded-b-full tw:border-none tw:bg-border-primary" />
                  <div className="tw:flex tw:items-center tw:gap-1">
                    {isComplete && (
                      <CheckCircle className="tw:size-4 tw:stroke-[2.5px] tw:text-fg-success-primary" />
                    )}
                    {!isComplete && (
                      <UploadCloud02 className="tw:size-4 tw:stroke-[2.5px] tw:text-fg-quaternary" />
                    )}

                    <p className="tw:text-sm tw:text-tertiary">{progress}%</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {failed && (
            <Button
              className="tw:mt-1.5"
              color="link-destructive"
              size="sm"
              onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>

        <ButtonUtility
          className="tw:-mt-2 tw:-mr-2 tw:self-start"
          color="tertiary"
          icon={Trash01}
          size="xs"
          tooltip="Delete"
          onClick={onDelete}
        />
      </div>
    </motion.li>
  );
};

const FileUploadRoot = (props: ComponentPropsWithRef<'div'>) => (
  <div
    {...props}
    className={cx('tw:flex tw:flex-col tw:gap-4', props.className)}>
    {props.children}
  </div>
);

const FileUploadList = (props: ComponentPropsWithRef<'ul'>) => (
  <ul
    {...props}
    className={cx('tw:flex tw:flex-col tw:gap-3', props.className)}>
    <AnimatePresence initial={false}>{props.children}</AnimatePresence>
  </ul>
);

export const FileUploadBase = {
  Root: FileUploadRoot,
  List: FileUploadList,
  DropZone: FileUploadDropZone,
  ListItemProgressBar: FileListItemProgressBar,
  ListItemProgressFill: FileListItemProgressFill,
};
