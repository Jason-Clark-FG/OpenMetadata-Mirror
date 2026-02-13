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

import { cx } from "../../../utils/cx";

const sizes = {
    xs: "size-1.5",
    sm: "size-2",
    md: "size-2.5",
    lg: "size-3",
    xl: "size-3.5",
    "2xl": "size-4",
    "3xl": "size-4.5",
    "4xl": "size-5",
};

interface AvatarOnlineIndicatorProps {
    size: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
    status: "online" | "offline";
    className?: string;
}

export const AvatarOnlineIndicator = ({ size, status, className }: AvatarOnlineIndicatorProps) => (
    <span
        className={cx(
            "absolute right-0 bottom-0 rounded-full ring-[1.5px] ring-bg-primary",
            status === "online" ? "bg-fg-success-secondary" : "bg-fg-disabled_subtle",
            sizes[size],
            className,
        )}
    />
);
