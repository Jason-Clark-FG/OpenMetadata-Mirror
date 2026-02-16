import { type HTMLAttributes, type ReactNode } from "react";
import { HintText } from "@/components/base/input/hint-text";
import type { InputBaseProps } from "@/components/base/input/input";
import { TextField } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { cx, sortCx } from "@/utils/cx";

interface InputPrefixProps extends HTMLAttributes<HTMLDivElement> {
    /** The position of the prefix. */
    position?: "leading" | "trailing";
    /** The size of the prefix. */
    size?: "sm" | "md";
    /** Indicates that the prefix is disabled. */
    isDisabled?: boolean;
}

export const InputPrefix = ({ isDisabled, children, ...props }: InputPrefixProps) => (
    <span
        {...props}
        className={cx(
            "tw:flex tw:text-md tw:text-tertiary tw:shadow-xs tw:ring-1 tw:ring-border-primary tw:ring-inset",
            // Styles when the prefix is within an `InputGroup`
            "in-data-input-wrapper:in-data-leading:tw:-mr-px in-data-input-wrapper:in-data-leading:tw:rounded-l-lg",
            "in-data-input-wrapper:in-data-trailing:tw:-ml-px in-data-input-wrapper:in-data-trailing:tw:rounded-r-lg",
            // Size styles based on size when within an `InputGroup`
            "in-data-input-wrapper:in-data-[input-size=md]:tw:py-2.5 in-data-input-wrapper:in-data-[input-size=md]:tw:pr-3 in-data-input-wrapper:in-data-[input-size=md]:tw:pl-3.5 in-data-input-wrapper:in-data-[input-size=sm]:tw:px-3 in-data-input-wrapper:in-data-[input-size=sm]:tw:py-2",
            // Disabled styles
            isDisabled && "tw:border-disabled tw:bg-disabled_subtle tw:text-tertiary",
            "in-data-input-wrapper:group-disabled:tw:bg-disabled_subtle in-data-input-wrapper:group-disabled:tw:text-disabled in-data-input-wrapper:group-disabled:tw:ring-border-disabled",

            props.className,
        )}
    >
        {children}
    </span>
);

// `${string}ClassName` is used to omit any className prop that ends with a `ClassName` suffix
interface InputGroupProps extends Omit<InputBaseProps, "type" | "icon" | "placeholder" | "tooltip" | "shortcut" | `${string}ClassName`> {
    /** A prefix text that is displayed in the same box as the input.*/
    prefix?: string;
    /** A leading addon that is displayed with visual separation from the input. */
    leadingAddon?: ReactNode;
    /** A trailing addon that is displayed with visual separation from the input. */
    trailingAddon?: ReactNode;
    /** The class name to apply to the input group. */
    className?: string;
    /** The children of the input group (i.e `<InputBase />`) */
    children: ReactNode;
}

export const InputGroup = ({ size = "sm", prefix, leadingAddon, trailingAddon, label, hint, children, ...props }: InputGroupProps) => {
    const hasLeading = !!leadingAddon;
    const hasTrailing = !!trailingAddon;

    const paddings = sortCx({
        sm: {
            input: cx(
                // Apply padding styles when select element is passed as a child
                hasLeading && "group-has-[&>select]:tw:px-2.5 group-has-[&>select]:tw:pl-2.5",
                hasTrailing && (prefix ? "group-has-[&>select]:tw:pr-6 group-has-[&>select]:tw:pl-0" : "group-has-[&>select]:tw:pr-6 group-has-[&>select]:tw:pl-3"),
            ),
            leadingText: "tw:pl-3",
        },
        md: {
            input: cx(
                // Apply padding styles when select element is passed as a child
                hasLeading && "group-has-[&>select]:tw:px-3 group-has-[&>select]:tw:pl-3",
                hasTrailing && (prefix ? "group-has-[&>select]:tw:pr-6 group-has-[&>select]:tw:pl-0" : "group-has-[&>select]:tw:pr-6 group-has-[&>select]:tw:pl-3"),
            ),
            leadingText: "tw:pl-3.5",
        },
    });

    return (
        <TextField
            size={size}
            aria-label={label || undefined}
            inputClassName={cx(paddings[size].input)}
            tooltipClassName={cx(hasTrailing && !hasLeading && "group-has-[&>select]:tw:right-0")}
            wrapperClassName={cx(
                "tw:z-10",
                // Apply styles based on the presence of leading or trailing elements
                hasLeading && "tw:rounded-l-none",
                hasTrailing && "tw:rounded-r-none",
                // When select element is passed as a child
                "group-has-[&>select]:tw:bg-transparent group-has-[&>select]:tw:shadow-none group-has-[&>select]:tw:ring-0 group-has-[&>select]:focus-within:tw:ring-0",
                // In `Input` component, there is "group-disabled" class so here we need to use "group-disabled:group-has-[&>select]" to avoid conflict
                "group-disabled:group-has-[&>select]:tw:bg-transparent",
            )}
            {...props}
        >
            {({ isDisabled, isInvalid, isRequired }) => (
                <>
                    {label && <Label isRequired={isRequired}>{label}</Label>}

                    <div
                        data-input-size={size}
                        className={cx(
                            "tw:group tw:relative tw:flex tw:h-max tw:w-full tw:flex-row tw:justify-center tw:rounded-lg tw:bg-primary tw:transition-all tw:duration-100 tw:ease-linear",

                            // Only apply focus ring when child is select and input is focused
                            "has-[&>select]:tw:shadow-xs has-[&>select]:tw:ring-1 has-[&>select]:tw:ring-border-primary has-[&>select]:tw:ring-inset has-[&>select]:has-[input:focus]:tw:ring-2 has-[&>select]:has-[input:focus]:tw:ring-border-brand",

                            isDisabled && "tw:cursor-not-allowed has-[&>select]:tw:bg-disabled_subtle has-[&>select]:tw:ring-border-disabled",
                            isInvalid && "has-[&>select]:tw:ring-border-error_subtle has-[&>select]:has-[input:focus]:tw:ring-border-error",
                        )}
                    >
                        {leadingAddon && <section data-leading={hasLeading || undefined}>{leadingAddon}</section>}

                        {prefix && (
                            <span className={cx("tw:my-auto tw:grow tw:pr-2", paddings[size].leadingText)}>
                                <p className={cx("tw:text-md tw:text-tertiary", isDisabled && "tw:text-disabled")}>{prefix}</p>
                            </span>
                        )}

                        {children}

                        {trailingAddon && <section data-trailing={hasTrailing || undefined}>{trailingAddon}</section>}
                    </div>

                    {hint && <HintText isInvalid={isInvalid}>{hint}</HintText>}
                </>
            )}
        </TextField>
    );
};

InputGroup.Prefix = InputPrefix;

InputGroup.displayName = "InputGroup";
