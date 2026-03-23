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

import type { CSSProperties, ElementType, HTMLAttributes, ReactNode, Ref } from "react";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { cx } from "@/utils/cx";

type TypographyQuoteVariant = "default" | "centered-quote" | "minimal-quote";

type TypographySize =
    | "text-xs"
    | "text-sm"
    | "text-md"
    | "text-lg"
    | "text-xl"
    | "display-xs"
    | "display-sm"
    | "display-md"
    | "display-lg"
    | "display-xl"
    | "display-2xl";

type TypographyWeight = "regular" | "medium" | "semibold" | "bold";

type TypographyEllipsis =
    | boolean
    | {
          rows?: number;
          tooltip?: ReactNode;
      };

interface TypographyProps extends HTMLAttributes<HTMLElement> {
    ref?: Ref<HTMLElement>;
    children?: ReactNode;
    as?: ElementType;
    quoteVariant?: TypographyQuoteVariant;
    className?: string;
    size?: TypographySize;
    weight?: TypographyWeight;
    ellipsis?: TypographyEllipsis;
}

const quoteStyles: Record<TypographyQuoteVariant, string> = {
    default: "",
    "centered-quote": "prose-centered-quote",
    "minimal-quote": "prose-minimal-quote",
};

const sizeClasses: Record<TypographySize, string> = {
    "text-xs": "tw:text-xs",
    "text-sm": "tw:text-sm",
    "text-md": "tw:text-md",
    "text-lg": "tw:text-lg",
    "text-xl": "tw:text-xl",
    "display-xs": "tw:text-display-xs",
    "display-sm": "tw:text-display-sm",
    "display-md": "tw:text-display-md",
    "display-lg": "tw:text-display-lg",
    "display-xl": "tw:text-display-xl",
    "display-2xl": "tw:text-display-2xl",
};

const weightClasses: Record<TypographyWeight, string> = {
    regular: "tw:font-normal",
    medium: "tw:font-medium",
    semibold: "tw:font-semibold",
    bold: "tw:font-bold",
};

export const Typography = (props: TypographyProps) => {
    const {
        as: Component = "span",
        quoteVariant = "default",
        className,
        children,
        size,
        weight,
        ellipsis,
        style,
        ...otherProps
    } = props;

    const sizeClass = size ? sizeClasses[size] : undefined;
    const weightClass = weight ? weightClasses[weight] : undefined;

    const ellipsisConfig = typeof ellipsis === "object" ? ellipsis : undefined;
    const isEllipsis = !!ellipsis;
    const ellipsisRows = ellipsisConfig?.rows ?? 1;
    const ellipsisTooltip = ellipsisConfig?.tooltip;

    const ellipsisClassName =
        isEllipsis && ellipsisRows <= 1 ? "tw:truncate" : undefined;

    const ellipsisStyle: CSSProperties | undefined =
        isEllipsis && ellipsisRows > 1
            ? {
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: ellipsisRows,
                  WebkitBoxOrient: "vertical",
              }
            : undefined;

    const innerClassName = cx(sizeClass, weightClass, className, ellipsisClassName);

    const content = (
        <div className={cx("prose", quoteStyles[quoteVariant])}>
            <Component
                {...otherProps}
                className={innerClassName}
                style={{ ...style, ...ellipsisStyle }}
            >
                {children}
            </Component>
        </div>
    );

    if (ellipsisTooltip) {
        return <Tooltip title={ellipsisTooltip}>{content}</Tooltip>;
    }

    return content;
};

export type { TypographyEllipsis, TypographyProps, TypographyQuoteVariant, TypographySize, TypographyWeight };
