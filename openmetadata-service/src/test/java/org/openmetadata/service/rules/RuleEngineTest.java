package org.openmetadata.service.rules;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.openmetadata.schema.configuration.EntityRulesSettings;
import org.openmetadata.schema.entity.data.Table;
import org.openmetadata.schema.settings.SettingsType;
import org.openmetadata.service.Entity;
import org.openmetadata.service.exception.EntityNotFoundException;
import org.openmetadata.service.jdbi3.SystemRepository;
import org.openmetadata.service.resources.settings.SettingsCache;

class RuleEngineTest {

  @Test
  void evaluateAndReturnSkipsPlatformRulesWhenSettingsAreUnavailable() {
    Table table = new Table().withId(UUID.randomUUID());
    SystemRepository systemRepository = mock(SystemRepository.class);

    try (MockedStatic<Entity> entity = mockStatic(Entity.class);
        MockedStatic<SettingsCache> settingsCache = mockStatic(SettingsCache.class)) {
      entity.when(Entity::getSystemRepository).thenReturn(systemRepository);
      settingsCache
          .when(() -> SettingsCache.getSetting(SettingsType.ENTITY_RULES_SETTINGS, EntityRulesSettings.class))
          .thenThrow(EntityNotFoundException.byMessage("missing settings"));

      assertEquals(
          List.of(), RuleEngine.getInstance().evaluateAndReturn(table, null, true, false));
    }
  }

  @Test
  void evaluateAndReturnPropagatesUnexpectedSettingsFailures() {
    Table table = new Table().withId(UUID.randomUUID());
    SystemRepository systemRepository = mock(SystemRepository.class);

    try (MockedStatic<Entity> entity = mockStatic(Entity.class);
        MockedStatic<SettingsCache> settingsCache = mockStatic(SettingsCache.class)) {
      entity.when(Entity::getSystemRepository).thenReturn(systemRepository);
      settingsCache
          .when(() -> SettingsCache.getSetting(SettingsType.ENTITY_RULES_SETTINGS, EntityRulesSettings.class))
          .thenThrow(new IllegalStateException("cache corrupted"));

      IllegalStateException exception =
          assertThrows(
              IllegalStateException.class,
              () -> RuleEngine.getInstance().evaluateAndReturn(table, null, true, false));
      assertEquals("cache corrupted", exception.getMessage());
    }
  }
}
