/*
 *  Copyright 2026 Collate.
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
import { Link as AriaLink } from "react-aria-components";
import { cx } from "@/utils/cx";
import type { NavItemDividerType, NavItemType } from "./config";
import { NavItemButton } from "./base-components/nav-item-button";

export interface SidebarProps {
    /** Navigation items rendered at the top of the sidebar. */
    items: (NavItemType | NavItemDividerType)[];
    /** Navigation items rendered at the bottom (e.g. Settings). */
    bottomItems?: (NavItemType | NavItemDividerType)[];
    /** The current active URL for highlighting the active item. */
    activeUrl?: string;
    /** Whether the sidebar is collapsed (icon-only mode). */
    collapsed?: boolean;
    /** Width of the sidebar when collapsed. */
    collapsedWidth?: number;
    /** Width of the sidebar when expanded. */
    expandedWidth?: number;
    /** Logo element rendered at top when expanded. */
    logo?: ReactNode;
    /** Logo element rendered at top when collapsed. */
    collapsedLogo?: ReactNode;
    /** Additional class name for the aside element. */
    className?: string;
}

const isActive = (pathname: string | undefined, href: string | undefined) => {
    if (!href || !pathname) {
        return false;
    }

    return href === "/" ? pathname === href : pathname.startsWith(href);
};

const SidebarItem = ({
    item,
    active,
}: {
    item: NavItemType;
    active: boolean;
}) => {
    const Icon = item.icon;

    return (
        <AriaLink
            href={item.href!}
            aria-current={active ? "page" : undefined}
            className={cx(
                "tw:group tw:relative tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:rounded-md tw:px-3 tw:py-2",
                "tw:outline-focus-ring tw:transition tw:duration-100 tw:ease-linear tw:select-none",
                "tw:focus-visible:z-10 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2",
                active
                    ? "tw:bg-bg-brand-primary tw:hover:bg-bg-brand-secondary"
                    : "tw:bg-primary tw:hover:bg-primary_hover",
            )}
        >
            {Icon && (
                <Icon
                    aria-hidden="true"
                    className={cx(
                        "tw:mr-2 tw:size-5 tw:shrink-0 tw:transition-inherit-all",
                        active ? "tw:text-fg-brand-primary" : "tw:text-fg-quaternary",
                    )}
                />
            )}
            <span
                className={cx(
                    "tw:flex-1 tw:truncate tw:text-md tw:font-semibold tw:transition-inherit-all",
                    active ? "tw:text-fg-brand-primary" : "tw:text-text-secondary tw:group-hover:text-secondary_hover",
                )}
            >
                {item.label}
            </span>
        </AriaLink>
    );
};

const renderItems = (
    items: (NavItemType | NavItemDividerType)[],
    activeUrl: string | undefined,
    collapsed: boolean,
) => {
    return items.map((item, index) => {
        if (item.divider) {
            return (
                <li key={`divider-${index}`} className="tw:w-full tw:py-2">
                    <hr className="tw:h-px tw:w-full tw:border-none tw:bg-border-secondary" />
                </li>
            );
        }

        const active = isActive(activeUrl, item.href);

        if (collapsed) {
            if (!item.icon) {
                return null;
            }

            return (
                <li key={item.label} className="tw:py-0.5">
                    <NavItemButton
                        current={active}
                        href={item.href}
                        icon={item.icon}
                        label={item.label}
                        tooltipPlacement="right"
                    />
                </li>
            );
        }

        return (
            <li key={item.label} className="tw:py-0.5">
                <SidebarItem active={active} item={item} />
            </li>
        );
    });
};

export const Sidebar = ({
    items,
    bottomItems,
    activeUrl,
    collapsed = false,
    collapsedWidth = 72,
    expandedWidth = 197,
    logo,
    collapsedLogo,
    className,
}: SidebarProps) => {
    return (
        <aside
            className={cx(
                "tw:flex tw:h-full tw:flex-col tw:bg-bg-primary tw:overflow-hidden",
                "tw:transition-[width] tw:duration-300 tw:ease-in-out",
                className,
            )}
            data-testid="app-sidebar"
            style={{ width: collapsed ? collapsedWidth : expandedWidth }}
        >
            {(logo || collapsedLogo) && (
                <div className={cx("tw:flex tw:items-center tw:my-5", collapsed ? "tw:justify-center" : "tw:pl-6")}>
                    {collapsed ? collapsedLogo ?? logo : logo}
                </div>
            )}

            <nav className="tw:flex tw:flex-1 tw:flex-col tw:overflow-y-auto">
                <ul className={cx("tw:flex tw:flex-col", collapsed ? "tw:items-center tw:px-2" : "tw:px-3")}>
                    {renderItems(items, activeUrl, collapsed)}
                </ul>

                {bottomItems && (
                    <>
                        <div className="tw:flex-1" />
                        <ul className={cx("tw:flex tw:flex-col tw:pb-4", collapsed ? "tw:items-center tw:px-2" : "tw:px-3")}>
                            {renderItems(bottomItems, activeUrl, collapsed)}
                        </ul>
                    </>
                )}
            </nav>
        </aside>
    );
};
