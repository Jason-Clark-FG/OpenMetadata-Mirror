package org.openmetadata.service.security.auth;

import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.openmetadata.schema.api.security.AuthenticationConfiguration;
import org.openmetadata.schema.api.security.AuthorizerConfiguration;
import org.openmetadata.schema.services.connections.metadata.AuthProvider;
import org.openmetadata.service.Entity;
import org.openmetadata.service.audit.AuditLogRepository;
import org.openmetadata.service.security.session.SessionService;
import org.openmetadata.service.security.session.UserSession;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class LdapAuthServletHandlerTest {

  @Mock private AuthenticationConfiguration authConfig;
  @Mock private AuthorizerConfiguration authorizerConfig;
  @Mock private SessionService sessionService;
  @Mock private HttpServletRequest request;
  @Mock private HttpServletResponse response;
  @Mock private ServletOutputStream servletOutputStream;
  @Mock private AuditLogRepository auditLogRepository;

  private LdapAuthServletHandler handler;

  @BeforeEach
  void setUp() throws Exception {
    when(authConfig.getProvider()).thenReturn(AuthProvider.LDAP);
    when(response.getWriter()).thenReturn(new PrintWriter(new StringWriter()));
    when(response.getOutputStream()).thenReturn(servletOutputStream);
    SecurityConfigurationManager.getInstance().setCurrentAuthConfig(authConfig);
    SecurityConfigurationManager.getInstance().setCurrentAuthzConfig(authorizerConfig);
    handler = new LdapAuthServletHandler(authConfig, authorizerConfig, sessionService);
  }

  @AfterEach
  void tearDown() {
    SecurityConfigurationManager.getInstance().setCurrentAuthConfig(null);
    SecurityConfigurationManager.getInstance().setCurrentAuthzConfig(null);
  }

  @Test
  void handleLogout_writesAuditEvent() {
    UUID userId = UUID.randomUUID();
    UserSession session =
        UserSession.builder()
            .id("session-id")
            .userId(userId.toString())
            .username("ldap-user")
            .build();
    when(sessionService.getSession(request)).thenReturn(Optional.of(session));
    when(sessionService.decryptOmRefreshToken(session)).thenReturn(null);

    try (MockedStatic<Entity> entityMock = mockStatic(Entity.class)) {
      entityMock.when(Entity::getAuditLogRepository).thenReturn(auditLogRepository);

      handler.handleLogout(request, response);
    }

    verify(auditLogRepository)
        .writeAuthEvent(AuditLogRepository.AUTH_EVENT_LOGOUT, "ldap-user", userId);
    verify(sessionService).revokeSession(request, response);
  }

  @Test
  void handleRefresh_withoutActiveSession_returnsUnauthorized() {
    when(sessionService.acquireRefreshLease(request, response)).thenReturn(Optional.empty());

    handler.handleRefresh(request, response);

    verify(response).setStatus(HttpServletResponse.SC_UNAUTHORIZED);
  }
}
