import type { RefAttributes } from "react";
import type { PopoverProps as AriaPopoverProps } from "react-aria-components";
import { Popover as AriaPopover } from "react-aria-components";
import { cx } from "@/utils/cx";

interface PopoverProps extends AriaPopoverProps, RefAttributes<HTMLElement> {
    size: "sm" | "md";
}

export const Popover = (props: PopoverProps) => {
    return (
        <AriaPopover
            placement="bottom"
            containerPadding={0}
            offset={4}
            {...props}
            className={(state) =>
                cx(
                    "tw:max-h-64! tw:w-(--trigger-width) tw:origin-(--trigger-anchor-point) tw:overflow-x-hidden tw:overflow-y-auto tw:rounded-lg tw:bg-primary tw:py-1 tw:shadow-lg tw:ring-1 tw:ring-secondary_alt tw:outline-hidden tw:will-change-transform",

                    state.isEntering &&
                        "tw:duration-150 tw:ease-out tw:animate-in tw:fade-in placement-right:tw:slide-in-from-left-0.5 placement-top:tw:slide-in-from-bottom-0.5 placement-bottom:tw:slide-in-from-top-0.5",
                    state.isExiting &&
                        "tw:duration-100 tw:ease-in tw:animate-out tw:fade-out placement-right:tw:slide-out-to-left-0.5 placement-top:tw:slide-out-to-bottom-0.5 placement-bottom:tw:slide-out-to-top-0.5",
                    props.size === "md" && "tw:max-h-80!",

                    typeof props.className === "function" ? props.className(state) : props.className,
                )
            }
        />
    );
};
