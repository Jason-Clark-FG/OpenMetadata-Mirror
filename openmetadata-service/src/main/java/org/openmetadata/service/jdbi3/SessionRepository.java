package org.openmetadata.service.jdbi3;

import java.util.List;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.utils.JsonUtils;
import org.openmetadata.service.Entity;
import org.openmetadata.service.security.session.SessionStatus;
import org.openmetadata.service.security.session.UserSession;

@Slf4j
@Repository
public class SessionRepository {
  private static final int ACTIVE_SESSION_LOOKUP_LIMIT = 10;
  private final CollectionDAO dao;

  public SessionRepository() {
    this.dao = Entity.getCollectionDAO();
  }

  public Optional<UserSession> findById(String sessionId) {
    return Optional.ofNullable(dao.getUserSessionDAO().findById(sessionId));
  }

  public List<UserSession> findByUserIdAndStatus(String userId, SessionStatus status) {
    return dao.getUserSessionDAO()
        .findByUserIdAndStatus(userId, status.name(), ACTIVE_SESSION_LOOKUP_LIMIT);
  }

  public List<UserSession> findSessionsToExpire(long now, int limit) {
    return dao.getUserSessionDAO()
        .findSessionsToExpire(
            List.of(SessionStatus.ACTIVE.name(), SessionStatus.REFRESHING.name()), now, limit);
  }

  public List<UserSession> findSessionsToPrune(long cutoff, int limit) {
    return dao.getUserSessionDAO()
        .findSessionsToPrune(
            List.of(SessionStatus.REVOKED.name(), SessionStatus.EXPIRED.name()), cutoff, limit);
  }

  public void create(UserSession session) {
    dao.getUserSessionDAO().insert(JsonUtils.pojoToJson(session));
  }

  public boolean updateIfVersion(UserSession session, long expectedVersion) {
    return dao.getUserSessionDAO()
            .updateIfVersion(session.getId(), expectedVersion, JsonUtils.pojoToJson(session))
        == 1;
  }

  public void delete(String sessionId) {
    dao.getUserSessionDAO().delete(sessionId);
  }
}
