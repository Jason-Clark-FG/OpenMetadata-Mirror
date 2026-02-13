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

"use client";

import { type ReactNode } from "react";
import { cx } from "../../utils/cx";
import { Avatar, type AvatarProps } from "./avatar";

const styles = {
    sm: { root: "gap-2", title: "text-sm font-semibold", subtitle: "text-xs" },
    md: { root: "gap-2", title: "text-sm font-semibold", subtitle: "text-sm" },
    lg: { root: "gap-3", title: "text-md font-semibold", subtitle: "text-md" },
    xl: { root: "gap-4", title: "text-lg font-semibold", subtitle: "text-md" },
};

interface AvatarLabelGroupProps extends AvatarProps {
    size: "sm" | "md" | "lg" | "xl";
    title: string | ReactNode;
    subtitle: string | ReactNode;
}

export const AvatarLabelGroup = ({ title, subtitle, className, ...props }: AvatarLabelGroupProps) => {
    return (
        <figure className={cx("group flex min-w-0 flex-1 items-center", styles[props.size].root, className)}>
            <Avatar {...props} />
            <figcaption className="min-w-0 flex-1">
                <p className={cx("text-primary", styles[props.size].title)}>{title}</p>
                <p className={cx("truncate text-tertiary", styles[props.size].subtitle)}>{subtitle}</p>
            </figcaption>
        </figure>
    );
};
