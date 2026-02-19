# Missing or Partially Replaced Components (Test Case Details / Incident Manager)

This document lists MUI usages that were **replaced** with `@openmetadata/ui-core-components` or `tw:` classes, and components that are **still missing** or only partially covered in the core library for the test case details–related pages.

**Related PRs:** [PR #25118 – Revamp Test case details page](https://github.com/open-metadata/OpenMetadata/pull/25118), [PR #25139 – Revamp Test suite details page](https://github.com/open-metadata/OpenMetadata/pull/25139).

## Summary of Changes Made

### Replaced with core-components + `tw:` classes

| File | MUI components replaced | Core / tw replacement |
|------|-------------------------|------------------------|
| `TestSuiteDetailsPage.component.tsx` | Box, Button, Dialog, DialogContent, DialogTitle, Divider, Stack, Tab, Tabs, useTheme | Button, ModalOverlay, Modal, Dialog, Tabs (Tabs.List, Tabs.Item, Tabs.Panel), div + `tw:` |
| `IncidentManagerDetailPage.tsx` | Box | div + `tw:flex tw:items-center tw:gap-1` |
| `TestCaseResultTab.component.tsx` | Box, Divider, Grid, Stack, SvgIcon, Tooltip, Typography, SxProps/Theme | Tooltip, div + `tw:` (grid, flex, border, typography) |
| `IncidentManagerPageHeader.component.tsx` | Box | div + `tw:w-full` |
| `InlineSeverity.component.tsx` | Box, Chip, Divider, Menu, MenuItem | Dropdown (Root, Popover, Menu, Item, Separator), button + `tw:` for chip |
| `HeatmapCellTooltip.component.tsx` | Box, Card, Divider, Stack, Typography | div + `tw:` (flex, border, spacing, text) |
| `DimensionalityHeatmap.component.tsx` | Box, CircularProgress, Tooltip, Typography | **Tooltip** from core; div + `tw:`; loading kept as is (inline spinner – no loader in core, no change) |
| `DimensionalityHeatmap.constants.ts` | TooltipProps (MUI) | Removed; HEATMAP_TOOLTIP_SLOT_PROPS removed (core Tooltip has different API) |

---

## Missing or Not Yet Replaced

### 1. **InlineTestCaseIncidentStatus.component.tsx**

Still uses MUI for:

- **Box** – layout
- **Chip** – status chips
- **Divider**
- **Icon**, **IconButton**
- **List**, **ListItem**, **ListItemButton**
- **Menu**, **MenuItem**
- **Popover**
- **TextField**
- **Typography**

**Core library:** Has Dropdown, Input, Button, Tooltip, Badge. Does **not** have a direct List/ListItem, Popover (used for custom positioning), or TextField (has Input). Replacing this file would require building a list from `tw:` + divs and using Dropdown/Modal for popovers and Input for search.

### 2. **DimensionalityTab.tsx**

Still uses MUI for:

- **HelpOutline**, **KeyboardArrowDown** (`@mui/icons-material`)
- **Box**, **Card**, **MenuItem**, **Select**, **SelectChangeEvent**, **Skeleton**, **Stack**, **Tooltip**, **Typography**, **useTheme**

**Core library:** Has Tooltip, Select, Dropdown. Does **not** have Card or Skeleton. Icons would need to come from `@untitledui/icons` or app assets. Select from core can replace MUI Select if the API is adapted (controlled value, options, onChange).

### 3. **Test files (MUI mocks)**

- `IncidentManagerDetailPage.test.tsx` – mocks `@mui/material` (ThemeProvider, etc.)
- `DimensionalityHeatmap.component.test.tsx`, `HeatmapCellTooltip.test.tsx` – use `createTheme`, `ThemeProvider` from MUI

These tests still rely on MUI for theme/testing. They can be updated to use core-components and remove MUI theme once the components under test no longer depend on MUI.

---

## Files from PR #25118 and #25139 – status

| File (from PRs) | MUI in PR? | Status |
|-----------------|------------|--------|
| `TestSuiteDetailsPage.component.tsx` | Yes (PR 25139: Box, Stack, Tabs, Divider, Dialog) | Replaced with core Button, ModalOverlay, Modal, Dialog, Tabs + `tw:` |
| `TestCaseResultTab.component.tsx` | Yes (PR 25118: parameter grid, layout) | Replaced with core Tooltip + `tw:`; dynamic assertion duplication fixed (value shows icon only) |
| `TestSummaryGraph.tsx` | No (uses Recharts + Ant Design Typography) | N/A – no MUI |
| `TestSummaryCustomTooltip.component.tsx` | No (uses Ant Design Card, Divider) | N/A – no MUI |
| `test-suite-details-page.styles.less` | Styles only | N/A |
| Incident Manager detail/header/heatmap (same feature area) | Yes | Replaced where applicable; InlineTestCaseIncidentStatus, DimensionalityTab still use MUI – see Missing section |

## Import rules (do not add to core)

- **Do not add new components to the core package.** Use **existing** core components only (e.g. **progress-circles**, **progress-indicators**, **Tooltip**, etc.).
- **Loaders / spinners:** Use existing core (e.g. progress-circles) if it fits the use case. If not available in core, use the [Untitled UI](https://www.untitledui.com/react/components) approach or library if present. If not present there, **keep as is** (e.g. app `Loader`, or `tw:animate-spin` inline).
- **Box, CircularProgress, Tooltip, Typography** – Prefer [Untitled UI React](https://www.untitledui.com/react/components) patterns: use **Tooltip** from core; use **div + `tw:`** for layout and typography; for spinners use existing core (e.g. progress-circles) or keep existing UI.

## Core library components used in this refactor

- **Button** – primary actions (e.g. Add test case)
- **ModalOverlay, Modal, Dialog** – add-test-case modal
- **Tabs** (Tabs.List, Tabs.Item, Tabs.Panel) – test suite details tabs
- **Tooltip** – parameter labels, heatmap cells, dimension labels
- **Dropdown** (Root, Popover, Menu, Item, Separator) – severity selector, future list/menu UIs

## Styling convention

- **`tw:`** – Tailwind classes from the core library’s design tokens (e.g. `tw:flex`, `tw:gap-2`, `tw:text-body`, `tw:border-border-primary`, `tw:bg-background-paper`) are used for layout and appearance so new UI is clearly separated from legacy Less/Ant Design styles.

---

## Components missing from core library (for future additions)

| MUI / need | Used in | Note |
|------------|--------|------|
| **Skeleton** | IncidentManager, DimensionalityTab | Use `tw:animate-pulse` div or add to core |
| **List / ListItem / ListItemButton** | InlineTestCaseIncidentStatus | Use `tw:` + div/button; no list primitives in core |
| **Popover** (positioned overlay) | InlineTestCaseIncidentStatus | Use Dropdown.Popover or Modal |
| **TextField** (with adornments) | InlineTestCaseIncidentStatus | Core has Input, InputGroup – can replace |
| **Select** (controlled) | DimensionalityTab | Core has Select – adapt API |
| **useTheme** | Various | Use CSS variables / `tw:` tokens |
| **MUI icons** (HelpOutline, KeyboardArrowDown) | DimensionalityTab | Use `@untitledui/icons` or app assets |
| **Autocomplete** | MUITagSuggestion, etc. | Core has Combobox |
| **Drawer** | MuiDrawer | Use Modal or custom `tw:` slide panel |
| **Breadcrumbs** | EntityLineage | Use `tw:` + links |
| **CircularProgress / Spinner** | DimensionalityHeatmap, etc. | Use **existing** core (e.g. progress-circles) if it fits; else Untitled UI if present; else **keep as is** (e.g. `tw:animate-spin` or app Loader) |
| **ThemeProvider** | Tests, any MUI theme usage | Use **colors directly** (design tokens / `tw:`); no MUI ThemeProvider |
| **Card** | DimensionalityTab, etc. | Use **div + tw:** for now (e.g. `tw:rounded-lg tw:border tw:bg-primary`) |

**Use existing core library components where possible:**

| Need | Core component to use |
|------|------------------------|
| List / ListItem / ListItemButton | `div` with `role="list"` / `role="listitem"` + `tw:`; or semantic list + buttons |
| Popover (positioned overlay) | **Dropdown.Popover** (with Dropdown.Root) or **ModalOverlay + Modal** |
| TextField (with adornments) | **Input**, **InputGroup** (core has Input and InputGroup) |
| Select (controlled, full API) | **Select** from core |
| Icons | **@untitledui/icons** or app assets (no MUI icons) |
| Autocomplete | **Combobox** from core (e.g. MUITagSuggestion) |
| Drawer | **SlideoutMenu** from core (MuiDrawer, LineageProvider) |
| Breadcrumbs | `tw:` + links; or add to core if needed |
