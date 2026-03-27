# PR #26715 Review Bugs

## Bug 1 (Medium): `additionalProperties: false` blocks conditional entityList keys — FIXED

All task JSON schemas had `"additionalProperties": false` on `inputNamespaceMap`, blocking conditional keys like `true_entityList`, `false_entityList`, `gold_entityList` when re-saving workflows via REST API.

**Fix:** Changed `"additionalProperties": false` → `true` in all 6 task schemas:
- `setEntityAttributeTask.json`
- `checkEntityAttributesTask.json`
- `rollbackEntityTask.json`
- `sinkTask.json`
- `dataCompletenessTask.json`
- `checkChangeDescriptionTask.json`

---

## Bug 2 (Low): Variable naming inconsistency — no `TRUE_ENTITY_LIST_VARIABLE` constant — FIXED

**Fix:** Added `public static final String TRUE_ENTITY_LIST_VARIABLE = "true_entityList";` to `Workflow.java` (Item 1 of 18-item review).

---

## Bug 3 (Low): Migration only stores last incoming edge per target node — FIXED

`MigrationUtil.java` used `incomingEdge.put(to, new String[] {from, condition})` which overwrote previous entries for nodes with multiple incoming edges.

**Fix:** Changed to `Map<String, List<String[]>>` with `computeIfAbsent().add(...)`. Updated `addEntityListToNamespaceMap` signature to accept `List<String[]>` and iterate all incoming edges.

---

## Bug 4 (Low): `COLLECTION_VARIABLE` not `final` and duplicates `ENTITY_LIST_VARIABLE` — FIXED

`PeriodicBatchEntityTrigger.java` defined `public static String COLLECTION_VARIABLE = "entityList"` (non-final, duplicate of `Workflow.ENTITY_LIST_VARIABLE`).

**Fix:**
- Removed `COLLECTION_VARIABLE` from `PeriodicBatchEntityTrigger`
- Made `HAS_FINISHED_VARIABLE` `final`
- Updated all usages to `ENTITY_LIST_VARIABLE` (imported from `Workflow`)
- Fixed `FetchEntitiesImpl.java` which also imported `COLLECTION_VARIABLE`

---

## Bug 5 (Low): Empty entity list produces silent no-op — FIXED

**Fix:** Added `LOG.debug(...)` in `WorkflowVariableHandler.getEntityList()` when no entityList is found (Item 17 of review). Initially LOG.warn, downgraded to LOG.debug per Copilot comment (WARN too noisy for benign cases).

---

## Pre-existing (not a regression): `storeFieldList` type change — FIXED

`DataCompletenessImpl.java` `storeFieldList()` used `ArrayList` + `add()` so the list type is always `List<String>`. The truncated `[+N more]` entry is just a string element in the list, not a type change. Confirmed correct in Item 5 of review.

---

## Test Gaps (tracked separately)

1. No unit test for `DataCompletenessImpl` — added tests for key scenarios
2. No unit test for `RollbackEntityImpl` — added tests
3. `CheckEntityAttributesImplTest` multi-entity test updated to assert `true_entityList`/`false_entityList` contents
4. `CheckChangeDescriptionTaskImplTest` — added multi-entity test
5. `WorkflowVariableHandler.getEntityList()` tested indirectly through impl tests
6. `entityToListMap` expression tested via `PeriodicBatchEntityTrigger` tests
