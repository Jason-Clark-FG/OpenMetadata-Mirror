import type { AnchorHTMLAttributes, ButtonHTMLAttributes, DetailedHTMLProps } from "react";
import type { ButtonProps as AriaButtonProps, LinkProps as AriaLinkProps } from "react-aria-components";
import { Button as AriaButton, Link as AriaLink } from "react-aria-components";
import { cx, sortCx } from "@/utils/cx";
import { AppleLogo, DribbleLogo, FacebookLogo, FigmaLogo, FigmaLogoOutlined, GoogleLogo, TwitterLogo } from "./social-logos";

export const styles = sortCx({
    common: {
        root: "tw:group tw:relative tw:inline-flex tw:h-max tw:cursor-pointer tw:items-center tw:justify-center tw:font-semibold tw:whitespace-nowrap tw:outline-focus-ring tw:transition tw:duration-100 tw:ease-linear before:tw:absolute focus-visible:tw:outline-2 focus-visible:tw:outline-offset-2 disabled:tw:cursor-not-allowed disabled:tw:stroke-fg-disabled disabled:tw:text-fg-disabled disabled:*:tw:text-fg-disabled",
        icon: "tw:pointer-events-none tw:shrink-0 tw:transition-inherit-all",
    },

    sizes: {
        sm: {
            root: "tw:gap-2 tw:rounded-lg tw:px-3 tw:py-2 tw:text-sm before:tw:rounded-[7px] data-icon-only:tw:p-2",
        },
        md: {
            root: "tw:gap-2.5 tw:rounded-lg tw:px-3.5 tw:py-2.5 tw:text-sm before:tw:rounded-[7px] data-icon-only:tw:p-2.5",
        },
        lg: {
            root: "tw:gap-3 tw:rounded-lg tw:px-4 tw:py-2.5 tw:text-md before:tw:rounded-[7px] data-icon-only:tw:p-2.5",
        },
        xl: {
            root: "tw:gap-3.5 tw:rounded-lg tw:px-4.5 tw:py-3 tw:text-md before:tw:rounded-[7px] data-icon-only:tw:p-3.5",
        },
        "2xl": {
            root: "tw:gap-4 tw:rounded-[10px] tw:px-5.5 tw:py-4 tw:text-lg before:tw:rounded-[9px] data-icon-only:tw:p-4",
        },
    },

    colors: {
        gray: {
            root: "tw:bg-primary tw:text-secondary tw:shadow-xs-skeumorphic tw:ring-1 tw:ring-primary tw:ring-inset hover:tw:bg-primary_hover hover:tw:text-secondary_hover",
            icon: "tw:text-fg-quaternary group-hover:tw:text-fg-quaternary_hover",
        },
        black: {
            root: "tw:bg-black tw:text-white tw:shadow-xs-skeumorphic tw:ring-1 tw:ring-transparent tw:ring-inset before:tw:absolute before:tw:inset-px before:tw:border before:tw:border-white/12 before:tw:mask-b-from-0%",
            icon: "",
        },

        facebook: {
            root: "tw:bg-[#1877F2] tw:text-white tw:shadow-xs-skeumorphic tw:ring-1 tw:ring-transparent tw:ring-inset before:tw:absolute before:tw:inset-px before:tw:border before:tw:border-white/12 before:tw:mask-b-from-0% hover:tw:bg-[#0C63D4]",
            icon: "",
        },

        dribble: {
            root: "tw:bg-[#EA4C89] tw:text-white tw:shadow-xs-skeumorphic tw:ring-1 tw:ring-transparent tw:ring-inset before:tw:absolute before:tw:inset-px before:tw:border before:tw:border-white/12 before:tw:mask-b-from-0% hover:tw:bg-[#E62872]",
            icon: "",
        },
    },
});

interface CommonProps {
    social: "google" | "facebook" | "apple" | "twitter" | "figma" | "dribble";
    disabled?: boolean;
    theme?: "brand" | "color" | "gray";
    size?: keyof typeof styles.sizes;
}

interface ButtonProps extends CommonProps, DetailedHTMLProps<Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color" | "slot">, HTMLButtonElement> {
    slot?: AriaButtonProps["slot"];
}

interface LinkProps extends CommonProps, DetailedHTMLProps<Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "color">, HTMLAnchorElement> {
    /** Options for the configured client side router. */
    routerOptions?: AriaLinkProps["routerOptions"];
}

export type SocialButtonProps = ButtonProps | LinkProps;

export const SocialButton = ({ size = "lg", theme = "brand", social, className, children, disabled, ...otherProps }: SocialButtonProps) => {
    const href = "href" in otherProps ? otherProps.href : undefined;
    const Component = href ? AriaLink : AriaButton;

    const isIconOnly = !children;

    const socialToColor = {
        google: "gray",
        facebook: "facebook",
        apple: "black",
        twitter: "black",
        figma: "black",
        dribble: "dribble",
    } as const;

    const colorStyles = theme === "brand" ? styles.colors[socialToColor[social]] : styles.colors.gray;

    const logos = {
        google: GoogleLogo,
        facebook: FacebookLogo,
        apple: AppleLogo,
        twitter: TwitterLogo,
        figma: theme === "gray" ? FigmaLogoOutlined : FigmaLogo,
        dribble: DribbleLogo,
    };

    const Logo = logos[social];

    let props = {};

    if (href) {
        props = {
            ...otherProps,

            href: disabled ? undefined : href,

            // Since anchor elements do not support the `disabled` attribute and state,
            // we need to specify `data-rac` and `data-disabled` in order to be able
            // to use the `disabled:` selector in classes.
            ...(disabled ? { "data-rac": true, "data-disabled": true } : {}),
        };
    } else {
        props = {
            ...otherProps,

            type: otherProps.type || "button",
            isDisabled: disabled,
        };
    }

    return (
        <Component
            isDisabled={disabled}
            {...props}
            data-icon-only={isIconOnly ? true : undefined}
            className={cx(styles.common.root, styles.sizes[size].root, colorStyles.root, className)}
        >
            <Logo
                className={cx(
                    styles.common.icon,
                    theme === "gray"
                        ? colorStyles.icon
                        : theme === "brand" && (social === "facebook" || social === "apple" || social === "twitter")
                          ? "tw:text-white"
                          : theme === "color" && (social === "apple" || social === "twitter")
                            ? "tw:text-alpha-black"
                            : "",
                )}
                colorful={
                    (theme === "brand" && (social === "google" || social === "figma")) ||
                    (theme === "color" && (social === "google" || social === "facebook" || social === "figma" || social === "dribble")) ||
                    undefined
                }
            />

            {children}
        </Component>
    );
};
