package org.openmetadata.service.apps.bundles.mcp;

import static org.openmetadata.service.jdbi3.AppRepository.APP_BOT_IMPERSONATION_ROLE;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.entity.app.App;
import org.openmetadata.schema.entity.teams.User;
import org.openmetadata.schema.type.EntityReference;
import org.openmetadata.schema.type.Include;
import org.openmetadata.service.Entity;
import org.openmetadata.service.apps.AbstractNativeApplication;
import org.openmetadata.service.exception.EntityNotFoundException;
import org.openmetadata.service.jdbi3.CollectionDAO;
import org.openmetadata.service.jdbi3.UserRepository;
import org.openmetadata.service.search.SearchRepository;
import org.openmetadata.service.util.EntityUtil;

@Slf4j
public class McpApplication extends AbstractNativeApplication {
  public McpApplication(CollectionDAO collectionDAO, SearchRepository searchRepository) {
    super(collectionDAO, searchRepository);
  }

  @Override
  public void init(App app) {
    super.init(app);
    ensureBotHasImpersonation(app);
  }

  private void ensureBotHasImpersonation(App app) {
    String botName = String.format("%sBot", app.getName());
    UserRepository userRepository = (UserRepository) Entity.getEntityRepository(Entity.USER);
    try {
      User botUser =
          userRepository.getByName(
              null,
              botName,
              new EntityUtil.Fields(Set.of("roles", UserRepository.AUTH_MECHANISM_FIELD)));
      if (!Boolean.TRUE.equals(botUser.getAllowImpersonation())) {
        LOG.info("Upgrading {} to allow impersonation", botName);
        botUser.setAllowImpersonation(true);

        EntityReference impersonationRoleRef =
            Entity.getEntityReferenceByName(
                Entity.ROLE, APP_BOT_IMPERSONATION_ROLE, Include.NON_DELETED);
        List<EntityReference> roles = botUser.getRoles();
        boolean hasImpersonationRole =
            roles != null
                && roles.stream().anyMatch(r -> r.getId().equals(impersonationRoleRef.getId()));
        if (!hasImpersonationRole) {
          List<EntityReference> mutableRoles =
              roles == null ? new ArrayList<>() : new ArrayList<>(roles);
          mutableRoles.add(impersonationRoleRef);
          botUser.setRoles(mutableRoles);
        }
        userRepository.createOrUpdate(null, botUser, "admin");
      }
    } catch (EntityNotFoundException ex) {
      LOG.debug("Bot user {} not found, will be created during install", botName);
    } catch (Exception ex) {
      LOG.error("Failed to ensure bot {} has impersonation role: {}", botName, ex.getMessage(), ex);
    }
  }
}
