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
import type { ReactNode } from "react";
import type { PopoverProps as AriaPopoverProps } from "react-aria-components";
import { Dialog as AriaDialog, DialogTrigger as AriaDialogTrigger, Popover as AriaPopover } from "react-aria-components";
import { cx } from "@/utils/cx";

export const PopoverTrigger = AriaDialogTrigger;

interface PopoverProps extends Omit<AriaPopoverProps, "children"> {
    children: ReactNode;
    dialogClassName?: string;
}

export const Popover = ({ children, dialogClassName, ...props }: PopoverProps) => {
    return (
        <AriaPopover
            {...props}
            className={(state) =>
                cx(
                    "tw:z-50 tw:origin-(--trigger-anchor-point) tw:overflow-auto tw:rounded-lg tw:bg-primary tw:shadow-lg tw:ring-1 tw:ring-secondary_alt tw:outline-hidden tw:will-change-transform",
                    state.isEntering &&
                        "tw:duration-150 tw:ease-out tw:animate-in tw:fade-in tw:placement-right:slide-in-from-left-0.5 tw:placement-top:slide-in-from-bottom-0.5 tw:placement-bottom:slide-in-from-top-0.5",
                    state.isExiting &&
                        "tw:duration-100 tw:ease-in tw:animate-out tw:fade-out tw:placement-right:slide-out-to-left-0.5 tw:placement-top:slide-out-to-bottom-0.5 tw:placement-bottom:slide-out-to-top-0.5",
                    typeof props.className === "function" ? props.className(state) : props.className,
                )
            }
        >
            <AriaDialog className={cx("tw:outline-hidden", dialogClassName)}>{children}</AriaDialog>
        </AriaPopover>
    );
};
