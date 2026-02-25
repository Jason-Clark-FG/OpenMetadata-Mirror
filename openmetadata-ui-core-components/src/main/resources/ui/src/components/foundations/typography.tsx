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

import type { ElementType, HTMLAttributes, ReactNode, Ref } from "react";
import { cx } from "@/utils/cx";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Untitled UI type scale variants */
export type TypographyVariant =
  | "display-2xl"
  | "display-xl"
  | "display-lg"
  | "display-md"
  | "display-sm"
  | "display-xs"
  | "text-xl"
  | "text-lg"
  | "text-md"
  | "text-sm"
  | "text-xs";

export type TypographyWeight = "regular" | "medium" | "semibold" | "bold";

export type TypographyColor =
  | "primary"
  | "secondary"
  | "tertiary"
  | "quaternary"
  | "disabled"
  | "error"
  | "success"
  | "warning"
  | "white"
  | "brand"
  | "inherit";

export type TypographyQuoteVariant =
  | "default"
  | "centered-quote"
  | "minimal-quote";

export interface TypographyProps extends HTMLAttributes<HTMLElement> {
  ref?: Ref<HTMLElement>;
  children?: ReactNode;
  /** Untitled UI type scale. Determines font-size, line-height and the default HTML tag. Default: `text-sm` (14px) */
  variant?: TypographyVariant;
  /** Font weight. Default: `regular` */
  weight?: TypographyWeight;
  /** Semantic text color token. Default: `primary` */
  color?: TypographyColor;
  /** Override the rendered HTML element. By default it is inferred from the variant. */
  as?: ElementType;
  /** Prose quote style (for rich-text containers). Default: `default` */
  quoteVariant?: TypographyQuoteVariant;
  className?: string;
}

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------

/** Tailwind text-size classes per variant (tokens defined in theme.css) */
const variantClasses: Record<TypographyVariant, string> = {
  "display-2xl": "tw:text-display-2xl",
  "display-xl": "tw:text-display-xl",
  "display-lg": "tw:text-display-lg",
  "display-md": "tw:text-display-md",
  "display-sm": "tw:text-display-sm",
  "display-xs": "tw:text-display-xs",
  "text-xl": "tw:text-xl",
  "text-lg": "tw:text-lg",
  "text-md": "tw:text-md",
  "text-sm": "tw:text-sm",
  "text-xs": "tw:text-xs",
};

/**
 * Default semantic HTML tag per variant.
 * Mirrors MUI Typography's element mapping.
 */
const variantTags: Record<TypographyVariant, ElementType> = {
  "display-2xl": "h1",
  "display-xl": "h1",
  "display-lg": "h1",
  "display-md": "h2",
  "display-sm": "h3",
  "display-xs": "h4",
  "text-xl": "h5",
  "text-lg": "h6",
  "text-md": "p",
  "text-sm": "p",
  "text-xs": "span",
};

/** Tailwind font-weight classes */
const weightClasses: Record<TypographyWeight, string> = {
  regular: "tw:font-normal",
  medium: "tw:font-medium",
  semibold: "tw:font-semibold",
  bold: "tw:font-bold",
};

/**
 * Semantic text color classes.
 * Backed by --color-text-* design tokens defined in theme.css.
 */
const colorClasses: Record<TypographyColor, string> = {
  primary: "tw:text-primary",
  secondary: "tw:text-secondary",
  tertiary: "tw:text-tertiary",
  quaternary: "tw:text-quaternary",
  disabled: "tw:text-disabled",
  error: "tw:text-error-primary",
  success: "tw:text-success-primary",
  warning: "tw:text-warning-primary",
  white: "tw:text-white",
  brand: "tw:text-brand-primary",
  inherit: "tw:text-inherit",
};

const quoteStyles: Record<TypographyQuoteVariant, string> = {
  default: "",
  "centered-quote": "prose-centered-quote",
  "minimal-quote": "prose-minimal-quote",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * `Typography` — A MUI-like text primitive built on Untitled UI's design system.
 *
 * - Applies the `prose` class (Untitled UI convention) for rich-text styles.
 * - Adds `variant`, `weight`, and `color` props for granular control.
 * - Auto-selects the correct semantic HTML tag based on `variant`.
 * - Override the tag with the `as` prop.
 *
 * @example
 * <Typography variant="display-sm" weight="semibold">Page Title</Typography>
 * <Typography variant="text-sm" color="secondary">Body text</Typography>
 * <Typography variant="text-xs" as="span" color="tertiary">Label</Typography>
 */
export const Typography = (props: TypographyProps) => {
  const {
    as,
    variant = "text-sm",
    weight = "regular",
    color = "primary",
    quoteVariant = "default",
    className,
    children,
    ...otherProps
  } = props;

  const Component = as ?? variantTags[variant];

  return (
    <Component
      {...otherProps}
      className={cx(
        "prose",
        quoteStyles[quoteVariant],
        variantClasses[variant],
        weightClasses[weight],
        colorClasses[color],
        className,
      )}
    >
      {children}
    </Component>
  );
};
