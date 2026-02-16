import { type SelectHTMLAttributes, useId } from "react";
import { ChevronDown } from "@untitledui/icons";
import { HintText } from "@/components/base/input/hint-text";
import { Label } from "@/components/base/input/label";
import { cx } from "@/utils/cx";

interface NativeSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    hint?: string;
    selectClassName?: string;
    options: { label: string; value: string; disabled?: boolean }[];
}

export const NativeSelect = ({ label, hint, options, className, selectClassName, ...props }: NativeSelectProps) => {
    const id = useId();
    const selectId = `select-native-${id}`;
    const hintId = `select-native-hint-${id}`;

    return (
        <div className={cx("tw:w-full in-data-input-wrapper:tw:w-max", className)}>
            {label && (
                <Label htmlFor={selectId} id={selectId} className="tw:mb-1.5">
                    {label}
                </Label>
            )}

            <div className="tw:relative tw:grid tw:w-full tw:items-center">
                <select
                    {...props}
                    id={selectId}
                    aria-describedby={hintId}
                    aria-labelledby={selectId}
                    className={cx(
                        "tw:appearance-none tw:rounded-lg tw:bg-primary tw:px-3.5 tw:py-2.5 tw:text-md tw:font-medium tw:text-primary tw:shadow-xs tw:ring-1 tw:ring-primary tw:outline-hidden tw:transition tw:duration-100 tw:ease-linear tw:ring-inset placeholder:tw:text-fg-quaternary focus-visible:tw:ring-2 focus-visible:tw:ring-brand disabled:tw:cursor-not-allowed disabled:tw:bg-disabled_subtle disabled:tw:text-disabled",
                        // Styles when the select is within an `InputGroup`
                        "in-data-input-wrapper:tw:flex in-data-input-wrapper:tw:h-full in-data-input-wrapper:tw:gap-1 in-data-input-wrapper:tw:bg-inherit in-data-input-wrapper:tw:px-3 in-data-input-wrapper:tw:py-2 in-data-input-wrapper:tw:font-normal in-data-input-wrapper:tw:text-tertiary in-data-input-wrapper:tw:shadow-none in-data-input-wrapper:tw:ring-transparent",
                        // Styles for the select when `TextField` is disabled
                        "in-data-input-wrapper:group-disabled:tw:pointer-events-none in-data-input-wrapper:group-disabled:tw:cursor-not-allowed in-data-input-wrapper:group-disabled:tw:bg-transparent in-data-input-wrapper:group-disabled:tw:text-disabled",
                        // Common styles for sizes and border radius within `InputGroup`
                        "in-data-input-wrapper:in-data-leading:tw:rounded-r-none in-data-input-wrapper:in-data-trailing:tw:rounded-l-none in-data-input-wrapper:in-data-[input-size=md]:tw:py-2.5 in-data-input-wrapper:in-data-leading:in-data-[input-size=md]:tw:pl-3.5 in-data-input-wrapper:in-data-[input-size=sm]:tw:py-2 in-data-input-wrapper:in-data-[input-size=sm]:tw:pl-3",
                        // For "leading" dropdown within `InputGroup`
                        "in-data-input-wrapper:in-data-leading:in-data-[input-size=md]:tw:pr-4.5 in-data-input-wrapper:in-data-leading:in-data-[input-size=sm]:tw:pr-4.5",
                        // For "trailing" dropdown within `InputGroup`
                        "in-data-input-wrapper:in-data-trailing:in-data-[input-size=md]:tw:pr-8 in-data-input-wrapper:in-data-trailing:in-data-[input-size=sm]:tw:pr-7.5",
                        selectClassName,
                    )}
                >
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
                <ChevronDown
                    aria-hidden="true"
                    className="tw:pointer-events-none tw:absolute tw:right-3.5 tw:size-5 tw:text-fg-quaternary in-data-input-wrapper:tw:right-0 in-data-input-wrapper:tw:size-4 in-data-input-wrapper:tw:stroke-[2.625px] in-data-input-wrapper:in-data-trailing:in-data-[input-size=sm]:tw:right-3"
                />
            </div>

            {hint && (
                <HintText className="tw:mt-2" id={hintId}>
                    {hint}
                </HintText>
            )}
        </div>
    );
};
