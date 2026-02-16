import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  DetailedHTMLProps,
  FC,
  ReactNode,
} from "react";
import React, { isValidElement } from "react";
import type {
  ButtonProps as AriaButtonProps,
  LinkProps as AriaLinkProps,
} from "react-aria-components";
import { Button as AriaButton, Link as AriaLink } from "react-aria-components";
import { cx, sortCx } from "@/utils/cx";
import { isReactComponent } from "@/utils/is-react-component";

export const styles = sortCx({
  common: {
    root: [
      "tw:group tw:relative tw:inline-flex tw:h-max tw:cursor-pointer tw:items-center tw:justify-center tw:whitespace-nowrap tw:outline-brand tw:transition tw:duration-100 tw:ease-linear before:tw:absolute focus-visible:tw:outline-2 focus-visible:tw:outline-offset-2",
      // When button is used within `InputGroup`
      "in-data-input-wrapper:tw:shadow-xs in-data-input-wrapper:focus:tw:!z-50 in-data-input-wrapper:in-data-leading:tw:-mr-px in-data-input-wrapper:in-data-leading:tw:rounded-r-none in-data-input-wrapper:in-data-leading:before:tw:rounded-r-none in-data-input-wrapper:in-data-trailing:tw:-ml-px in-data-input-wrapper:in-data-trailing:tw:rounded-l-none in-data-input-wrapper:in-data-trailing:before:tw:rounded-l-none",
      // Disabled styles
      "disabled:tw:cursor-not-allowed disabled:tw:text-fg-disabled",
      // Icon styles
      "disabled:*:data-icon:tw:text-fg-disabled_subtle",
      // Same as `icon` but for SSR icons that cannot be passed to the client as functions.
      "*:data-icon:tw:pointer-events-none *:data-icon:tw:size-5 *:data-icon:tw:shrink-0 *:data-icon:tw:transition-inherit-all",
    ].join(" "),
    icon: "tw:pointer-events-none tw:size-5 tw:shrink-0 tw:transition-inherit-all",
  },
  sizes: {
    sm: {
      root: [
        "tw:gap-1 tw:rounded-lg tw:px-3 tw:py-2 tw:text-sm tw:font-semibold before:tw:rounded-[7px] data-icon-only:tw:p-2",
        "in-data-input-wrapper:tw:px-3.5 in-data-input-wrapper:tw:py-2.5 in-data-input-wrapper:data-icon-only:tw:p-2.5",
      ].join(" "),
      linkRoot: "tw:gap-1",
    },
    md: {
      root: [
        "tw:gap-1 tw:rounded-lg tw:px-3.5 tw:py-2.5 tw:text-sm tw:font-semibold before:tw:rounded-[7px] data-icon-only:tw:p-2.5",
        "in-data-input-wrapper:tw:gap-1.5 in-data-input-wrapper:tw:px-4 in-data-input-wrapper:tw:text-md in-data-input-wrapper:data-icon-only:tw:p-3",
      ].join(" "),
      linkRoot: "tw:gap-1",
    },
    lg: {
      root: "tw:gap-1.5 tw:rounded-lg tw:px-4 tw:py-2.5 tw:text-md tw:font-semibold before:tw:rounded-[7px] data-icon-only:tw:p-3",
      linkRoot: "tw:gap-1.5",
    },
    xl: {
      root: "tw:gap-1.5 tw:rounded-lg tw:px-4.5 tw:py-3 tw:text-md tw:font-semibold before:tw:rounded-[7px] data-icon-only:tw:p-3.5",
      linkRoot: "tw:gap-1.5",
    },
  },

  colors: {
    primary: {
      root: [
        "tw:bg-brand-solid tw:text-white tw:shadow-xs-skeumorphic tw:ring-1 tw:ring-transparent tw:ring-inset hover:tw:bg-brand-solid_hover data-loading:tw:bg-brand-solid_hover",
        // Inner border gradient
        "before:tw:absolute before:tw:inset-px before:tw:border before:tw:border-white/12 before:tw:mask-b-from-0%",
        // Disabled styles
        "disabled:tw:bg-disabled disabled:tw:shadow-xs disabled:tw:ring-disabled_subtle",
        // Icon styles
        "*:data-icon:tw:text-button-primary-icon hover:*:data-icon:tw:text-button-primary-icon_hover",
      ].join(" "),
    },
    secondary: {
      root: [
        "tw:bg-primary tw:text-secondary tw:shadow-xs-skeumorphic tw:ring-1 tw:ring-primary tw:ring-inset hover:tw:bg-primary_hover hover:tw:text-secondary_hover data-loading:tw:bg-primary_hover",
        // Disabled styles
        "disabled:tw:shadow-xs disabled:tw:ring-disabled_subtle",
        // Icon styles
        "*:data-icon:tw:text-fg-quaternary hover:*:data-icon:tw:text-fg-quaternary_hover",
      ].join(" "),
    },
    tertiary: {
      root: [
        "tw:text-tertiary hover:tw:bg-primary_hover hover:tw:text-tertiary_hover data-loading:tw:bg-primary_hover",
        // Icon styles
        "*:data-icon:tw:text-fg-quaternary hover:*:data-icon:tw:text-fg-quaternary_hover",
      ].join(" "),
    },
    "link-gray": {
      root: [
        "tw:justify-normal tw:rounded tw:p-0! tw:text-tertiary hover:tw:text-tertiary_hover",
        // Inner text underline
        "*:data-text:tw:underline *:data-text:tw:decoration-transparent *:data-text:tw:underline-offset-2 hover:*:data-text:tw:decoration-current",
        // Icon styles
        "*:data-icon:tw:text-fg-quaternary hover:*:data-icon:tw:text-fg-quaternary_hover",
      ].join(" "),
    },
    "link-color": {
      root: [
        "tw:justify-normal tw:rounded tw:p-0! tw:text-brand-secondary hover:tw:text-brand-secondary_hover",
        // Inner text underline
        "*:data-text:tw:underline *:data-text:tw:decoration-transparent *:data-text:tw:underline-offset-2 hover:*:data-text:tw:decoration-current",
        // Icon styles
        "*:data-icon:tw:text-fg-brand-secondary_alt hover:*:data-icon:tw:text-fg-brand-secondary_hover",
      ].join(" "),
    },
    "primary-destructive": {
      root: [
        "tw:bg-error-solid tw:text-white tw:shadow-xs-skeumorphic tw:ring-1 tw:ring-transparent tw:outline-error tw:ring-inset hover:tw:bg-error-solid_hover data-loading:tw:bg-error-solid_hover",
        // Inner border gradient
        "before:tw:absolute before:tw:inset-px before:tw:border before:tw:border-white/12 before:tw:mask-b-from-0%",
        // Disabled styles
        "disabled:tw:bg-disabled disabled:tw:shadow-xs disabled:tw:ring-disabled_subtle",
        // Icon styles
        "*:data-icon:tw:text-button-destructive-primary-icon hover:*:data-icon:tw:text-button-destructive-primary-icon_hover",
      ].join(" "),
    },
    "secondary-destructive": {
      root: [
        "tw:bg-primary tw:text-error-primary tw:shadow-xs-skeumorphic tw:ring-1 tw:ring-error_subtle tw:outline-error tw:ring-inset hover:tw:bg-error-primary hover:tw:text-error-primary_hover data-loading:tw:bg-error-primary",
        // Disabled styles
        "disabled:tw:bg-primary disabled:tw:shadow-xs disabled:tw:ring-disabled_subtle",
        // Icon styles
        "*:data-icon:tw:text-fg-error-secondary hover:*:data-icon:tw:text-fg-error-primary",
      ].join(" "),
    },
    "tertiary-destructive": {
      root: [
        "tw:text-error-primary tw:outline-error hover:tw:bg-error-primary hover:tw:text-error-primary_hover data-loading:tw:bg-error-primary",
        // Icon styles
        "*:data-icon:tw:text-fg-error-secondary hover:*:data-icon:tw:text-fg-error-primary",
      ].join(" "),
    },
    "link-destructive": {
      root: [
        "tw:justify-normal tw:rounded tw:p-0! tw:text-error-primary tw:outline-error hover:tw:text-error-primary_hover",
        // Inner text underline
        "*:data-text:tw:underline *:data-text:tw:decoration-transparent *:data-text:tw:underline-offset-2 hover:*:data-text:tw:decoration-current",
        // Icon styles
        "*:data-icon:tw:text-fg-error-secondary hover:*:data-icon:tw:text-fg-error-primary",
      ].join(" "),
    },
  },
});

/**
 * Common props shared between button and anchor variants
 */
export interface CommonProps {
  /** Disables the button and shows a disabled state */
  isDisabled?: boolean;
  /** Shows a loading spinner and disables the button */
  isLoading?: boolean;
  /** The size variant of the button */
  size?: keyof typeof styles.sizes;
  /** The color variant of the button */
  color?: keyof typeof styles.colors;
  /** Icon component or element to show before the text */
  iconLeading?: FC<{ className?: string }> | ReactNode;
  /** Icon component or element to show after the text */
  iconTrailing?: FC<{ className?: string }> | ReactNode;
  /** Removes horizontal padding from the text content */
  noTextPadding?: boolean;
  /** When true, keeps the text visible during loading state */
  showTextWhileLoading?: boolean;
}

/**
 * Props for the button variant (non-link)
 */
export interface ButtonProps
  extends
    CommonProps,
    DetailedHTMLProps<
      Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color" | "slot">,
      HTMLButtonElement
    > {
  /** Slot name for react-aria component */
  slot?: AriaButtonProps["slot"];
}

/**
 * Props for the link variant (anchor tag)
 */
interface LinkProps
  extends
    CommonProps,
    DetailedHTMLProps<
      Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "color">,
      HTMLAnchorElement
    > {
  /** Options for the configured client side router. */
  routerOptions?: AriaLinkProps["routerOptions"];
}

/** Union type of button and link props */
export type Props = ButtonProps | LinkProps;

export const Button = ({
  size = "sm",
  color = "primary",
  children,
  className,
  noTextPadding,
  iconLeading: IconLeading,
  iconTrailing: IconTrailing,
  isDisabled: disabled,
  isLoading: loading,
  showTextWhileLoading,
  ...otherProps
}: Props) => {
  const href = "href" in otherProps ? otherProps.href : undefined;
  const Component = href ? AriaLink : AriaButton;

  const isIcon = (IconLeading || IconTrailing) && !children;
  const isLinkType = ["link-gray", "link-color", "link-destructive"].includes(
    color,
  );

  noTextPadding = isLinkType || noTextPadding;

  let props = {};

  if (href) {
    props = {
      ...otherProps,

      href: disabled ? undefined : href,
    };
  } else {
    props = {
      ...otherProps,

      type: otherProps.type || "button",
      isPending: loading,
    };
  }

  return (
    <Component
      data-loading={loading ? true : undefined}
      data-icon-only={isIcon ? true : undefined}
      {...props}
      isDisabled={disabled}
      className={cx(
        styles.common.root,
        styles.sizes[size].root,
        styles.colors[color].root,
        isLinkType && styles.sizes[size].linkRoot,
        (loading || (href && (disabled || loading))) && "tw:pointer-events-none",
        // If in `loading` state, hide everything except the loading icon (and text if `showTextWhileLoading` is true).
        loading &&
          (showTextWhileLoading
            ? "[&>*:not([data-icon=loading]):not([data-text])]:tw:hidden"
            : "[&>*:not([data-icon=loading])]:tw:invisible"),
        className,
      )}
    >
      {/* Leading icon */}
      {isValidElement(IconLeading) && IconLeading}
      {isReactComponent(IconLeading) && (
        <IconLeading data-icon="leading" className={styles.common.icon} />
      )}

      {loading && (
        <svg
          fill="none"
          data-icon="loading"
          viewBox="0 0 20 20"
          className={cx(
            styles.common.icon,
            !showTextWhileLoading &&
              "tw:absolute tw:top-1/2 tw:left-1/2 tw:-translate-x-1/2 tw:-translate-y-1/2",
          )}
        >
          {/* Background circle */}
          <circle
            className="tw:stroke-current tw:opacity-30"
            cx="10"
            cy="10"
            r="8"
            fill="none"
            strokeWidth="2"
          />
          {/* Spinning circle */}
          <circle
            className="tw:origin-center tw:animate-spin tw:stroke-current"
            cx="10"
            cy="10"
            r="8"
            fill="none"
            strokeWidth="2"
            strokeDasharray="12.5 50"
            strokeLinecap="round"
          />
        </svg>
      )}

      {children && (
        <span
          data-text
          className={cx("tw:transition-inherit-all", !noTextPadding && "tw:px-0.5")}
        >
          {children}
        </span>
      )}

      {/* Trailing icon */}
      {isValidElement(IconTrailing) && IconTrailing}
      {isReactComponent(IconTrailing) && (
        <IconTrailing data-icon="trailing" className={styles.common.icon} />
      )}
    </Component>
  );
};
