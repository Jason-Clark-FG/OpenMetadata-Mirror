package org.openmetadata.service.security;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.nimbusds.oauth2.sdk.AuthorizationCode;
import com.nimbusds.oauth2.sdk.RefreshTokenGrant;
import com.nimbusds.oauth2.sdk.ResponseMode;
import com.nimbusds.oauth2.sdk.auth.ClientAuthentication;
import com.nimbusds.oauth2.sdk.auth.ClientAuthenticationMethod;
import com.nimbusds.oauth2.sdk.auth.ClientSecretBasic;
import com.nimbusds.oauth2.sdk.auth.ClientSecretPost;
import com.nimbusds.oauth2.sdk.auth.PrivateKeyJWT;
import com.nimbusds.oauth2.sdk.id.Issuer;
import com.nimbusds.oauth2.sdk.id.State;
import com.nimbusds.oauth2.sdk.pkce.CodeChallengeMethod;
import com.nimbusds.oauth2.sdk.token.AccessToken;
import com.nimbusds.oauth2.sdk.token.BearerAccessToken;
import com.nimbusds.openid.connect.sdk.AuthenticationSuccessResponse;
import com.nimbusds.openid.connect.sdk.SubjectType;
import com.nimbusds.openid.connect.sdk.op.OIDCProviderMetadata;
import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.URI;
import java.security.KeyPairGenerator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.openmetadata.schema.security.client.OidcClientConfig;
import org.pac4j.core.exception.TechnicalException;
import org.pac4j.oidc.client.AzureAd2Client;
import org.pac4j.oidc.client.GoogleOidcClient;
import org.pac4j.oidc.client.OidcClient;
import org.pac4j.oidc.config.AzureAd2OidcConfiguration;
import org.pac4j.oidc.config.OidcConfiguration;
import org.pac4j.oidc.config.PrivateKeyJWTClientAuthnMethodConfig;
import sun.misc.Unsafe;

@ExtendWith(MockitoExtension.class)
class AuthenticationCodeFlowHandlerTest {

  @Mock private HttpServletRequest request;
  @Mock private HttpServletResponse response;
  @Mock private HttpSession session;
  @Mock private ServletOutputStream outputStream;

  @Test
  void buildOidcClientAllowsMissingClientAuthenticationMethodForGoogle() throws Exception {
    AuthenticationCodeFlowHandler handler = newHandler();
    OidcClientConfig clientConfig = new OidcClientConfig();
    clientConfig.setId("google-client");
    clientConfig.setSecret("google-secret");
    clientConfig.setType("google");
    clientConfig.setScope("openid profile email");
    clientConfig.setResponseType("code");
    clientConfig.setUseNonce("true");
    clientConfig.setPreferredJwsAlgorithm("RS256");
    clientConfig.setMaxClockSkew("42");

    OidcClient client =
        invokePrivate(
            handler, "buildOidcClient", new Class<?>[] {OidcClientConfig.class}, clientConfig);

    assertInstanceOf(GoogleOidcClient.class, client);
    assertEquals("google-client", client.getConfiguration().getClientId());
    assertEquals("google-secret", client.getConfiguration().getSecret());
    assertEquals("query", client.getConfiguration().getResponseMode());
    assertEquals("code", client.getConfiguration().getResponseType());
    assertEquals("openid profile email", client.getConfiguration().getScope());
    assertTrue(client.getConfiguration().isUseNonce());
    assertEquals(JWSAlgorithm.RS256, client.getConfiguration().getPreferredJwsAlgorithm());
    assertEquals(42, client.getConfiguration().getMaxClockSkew());
    assertEquals("offline", client.getConfiguration().getCustomParams().get("access_type"));
  }

  @Test
  void buildOidcClientCreatesAzureClientAndCustomParams() throws Exception {
    AuthenticationCodeFlowHandler handler = newHandler();
    OidcClientConfig clientConfig = new OidcClientConfig();
    clientConfig.setId("azure-client");
    clientConfig.setSecret("azure-secret");
    clientConfig.setType("azure");
    clientConfig.setTenant("organizations");
    clientConfig.setDisablePkce(true);
    clientConfig.setClientAuthenticationMethod(
        OidcClientConfig.ClientAuthenticationMethod.CLIENT_SECRET_POST);
    Map<String, String> customParams = new HashMap<>();
    customParams.put("customParamKey1", "resource");
    customParams.put("customParamValue1", "graph");
    clientConfig.setCustomParams(customParams);

    OidcClient client =
        invokePrivate(
            handler, "buildOidcClient", new Class<?>[] {OidcClientConfig.class}, clientConfig);

    assertInstanceOf(AzureAd2Client.class, client);
    AzureAd2OidcConfiguration configuration =
        assertInstanceOf(AzureAd2OidcConfiguration.class, client.getConfiguration());
    assertEquals("organizations", configuration.getTenant());
    assertTrue(configuration.isDisablePkce());
    assertEquals("graph", configuration.getCustomParams().get("resource"));
    assertEquals(
        ClientAuthenticationMethod.CLIENT_SECRET_POST, configuration.getClientAuthenticationMethod());
  }

  @Test
  void buildOidcClientRejectsMissingCredentials() throws Exception {
    AuthenticationCodeFlowHandler handler = newHandler();
    OidcClientConfig clientConfig = new OidcClientConfig();
    clientConfig.setId("client");
    clientConfig.setSecret("");

    IllegalArgumentException exception =
        assertThrows(
            IllegalArgumentException.class,
            () ->
                invokePrivate(
                    handler,
                    "buildOidcClient",
                    new Class<?>[] {OidcClientConfig.class},
                    clientConfig));

    assertTrue(exception.getMessage().contains("Client ID and Client Secret"));
  }

  @Test
  void getClientAuthenticationPrefersConfiguredClientSecretPost() throws Exception {
    AuthenticationCodeFlowHandler handler = newHandler();
    OidcConfiguration configuration =
        configuredOidcConfiguration(
            "client-id",
            "client-secret",
            List.of(
                ClientAuthenticationMethod.CLIENT_SECRET_POST,
                ClientAuthenticationMethod.CLIENT_SECRET_BASIC));
    configuration.setClientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_POST);

    ClientAuthentication authentication =
        invokePrivate(
            handler, "getClientAuthentication", new Class<?>[] {OidcConfiguration.class}, configuration);

    assertInstanceOf(ClientSecretPost.class, authentication);
  }

  @Test
  void getClientAuthenticationFallsBackToMetadataSupportedMethod() throws Exception {
    AuthenticationCodeFlowHandler handler = newHandler();
    OidcConfiguration configuration =
        configuredOidcConfiguration(
            "client-id", "client-secret", List.of(ClientAuthenticationMethod.CLIENT_SECRET_BASIC));

    ClientAuthentication authentication =
        invokePrivate(
            handler, "getClientAuthentication", new Class<?>[] {OidcConfiguration.class}, configuration);

    assertInstanceOf(ClientSecretBasic.class, authentication);
  }

  @Test
  void getClientAuthenticationBuildsPrivateKeyJwtWhenConfigured() throws Exception {
    AuthenticationCodeFlowHandler handler = newHandler();
    OidcConfiguration configuration =
        configuredOidcConfiguration(
            "client-id", "client-secret", List.of(ClientAuthenticationMethod.PRIVATE_KEY_JWT));
    configuration.setClientAuthenticationMethod(ClientAuthenticationMethod.PRIVATE_KEY_JWT);
    PrivateKeyJWTClientAuthnMethodConfig privateKeyConfig =
        new PrivateKeyJWTClientAuthnMethodConfig(
            JWSAlgorithm.RS256,
            KeyPairGenerator.getInstance("RSA").generateKeyPair().getPrivate(),
            "test-key");
    configuration.setPrivateKeyJWTClientAuthnMethodConfig(privateKeyConfig);

    ClientAuthentication authentication =
        invokePrivate(
            handler, "getClientAuthentication", new Class<?>[] {OidcConfiguration.class}, configuration);

    assertInstanceOf(PrivateKeyJWT.class, authentication);
  }

  @Test
  void getClientAuthenticationRejectsUnsupportedConfiguredMethod() throws Exception {
    AuthenticationCodeFlowHandler handler = newHandler();
    OidcConfiguration configuration =
        configuredOidcConfiguration(
            "client-id",
            "client-secret",
            List.of(ClientAuthenticationMethod.CLIENT_SECRET_JWT));
    configuration.setClientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_JWT);

    TechnicalException exception =
        assertThrows(
            TechnicalException.class,
            () ->
                invokePrivate(
                    handler,
                    "getClientAuthentication",
                    new Class<?>[] {OidcConfiguration.class},
                    configuration));

    assertTrue(exception.getMessage().contains("Configured authentication method"));
  }

  @Test
  void getClientAuthenticationRejectsUnsupportedMetadataMethods() throws Exception {
    AuthenticationCodeFlowHandler handler = newHandler();
    OidcConfiguration configuration =
        configuredOidcConfiguration(
            "client-id",
            "client-secret",
            List.of(ClientAuthenticationMethod.CLIENT_SECRET_JWT));

    TechnicalException exception =
        assertThrows(
            TechnicalException.class,
            () ->
                invokePrivate(
                    handler,
                    "getClientAuthentication",
                    new Class<?>[] {OidcConfiguration.class},
                    configuration));

    assertTrue(exception.getMessage().contains("None of the Token endpoint provider metadata"));
  }

  @Test
  void getHttpSessionReusesExistingSessionAndCreatesWhenMissing() {
    when(request.getSession(false)).thenReturn(session);
    when(session.getId()).thenReturn("existing-session");

    assertEquals(session, AuthenticationCodeFlowHandler.getHttpSession(request, true));

    when(request.getSession(false)).thenReturn(null);
    when(request.getSession(true)).thenReturn(session);

    assertEquals(session, AuthenticationCodeFlowHandler.getHttpSession(request, true));
    assertNull(AuthenticationCodeFlowHandler.getHttpSession(request, false));
  }

  @Test
  void checkAndStoreRedirectUriRequiresValue() {
    assertThrows(
        TechnicalException.class,
        () -> AuthenticationCodeFlowHandler.checkAndStoreRedirectUriInSession(session, null));

    AuthenticationCodeFlowHandler.checkAndStoreRedirectUriInSession(
        session, "https://app.example.com/callback");

    verify(session)
        .setAttribute(
            AuthenticationCodeFlowHandler.SESSION_REDIRECT_URI, "https://app.example.com/callback");
  }

  @Test
  void validatePrincipalClaimsMappingRequiresUsernameAndEmail() {
    Map<String, String> mapping = Map.of("sub", "subject");
    assertThrows(
        IllegalArgumentException.class,
        () -> AuthenticationCodeFlowHandler.validatePrincipalClaimsMapping(mapping));

    assertDoesNotThrow(
        () ->
            AuthenticationCodeFlowHandler.validatePrincipalClaimsMapping(
                Map.of("username", "preferred_username", "email", "mail")));
  }

  @Test
  void retrieveCallbackParametersCopiesAllValues() throws Exception {
    AuthenticationCodeFlowHandler handler = newHandler();
    when(request.getParameterMap())
        .thenReturn(
            Map.of("code", new String[] {"auth-code"}, "scope", new String[] {"openid", "email"}));

    Map<String, List<String>> parameters =
        invokePrivate(
            handler,
            "retrieveCallbackParameters",
            new Class<?>[] {HttpServletRequest.class},
            request);

    assertEquals(List.of("auth-code"), parameters.get("code"));
    assertEquals(List.of("openid", "email"), parameters.get("scope"));
  }

  @Test
  void addStateAndNonceParametersStoresCsrfReplayAndPkceValues() throws Exception {
    AuthenticationCodeFlowHandler handler = newHandler();
    OidcConfiguration configuration =
        configuredOidcConfiguration(
            "client-id", null, List.of(ClientAuthenticationMethod.CLIENT_SECRET_BASIC));
    configuration.setWithState(true);
    configuration.setUseNonce(true);
    configuration.setPkceMethod(CodeChallengeMethod.S256);
    OidcClient client = oidcClient(configuration, "TestOidcClient");
    Map<String, String> params = new HashMap<>();

    invokePrivate(
        handler,
        "addStateAndNonceParameters",
        new Class<?>[] {OidcClient.class, HttpSession.class, Map.class},
        client,
        session,
        params);

    assertNotNull(params.get(OidcConfiguration.STATE));
    assertNotNull(params.get(OidcConfiguration.NONCE));
    assertNotNull(params.get(OidcConfiguration.CODE_CHALLENGE));
    assertEquals("S256", params.get(OidcConfiguration.CODE_CHALLENGE_METHOD));
    ArgumentCaptor<State> stateCaptor = ArgumentCaptor.forClass(State.class);
    verify(session).setAttribute(eq(client.getStateSessionAttributeName()), stateCaptor.capture());
    assertEquals(params.get(OidcConfiguration.STATE), stateCaptor.getValue().getValue());
    verify(session).setAttribute(client.getNonceSessionAttributeName(), params.get(OidcConfiguration.NONCE));
    verify(session).setAttribute(eq(client.getCodeVerifierSessionAttributeName()), any());
  }

  @Test
  void validateStateIfRequiredWritesErrorWhenSessionStateMissing() throws Exception {
    AuthenticationCodeFlowHandler handler = newHandler();
    when(response.getOutputStream()).thenReturn(outputStream);
    OidcConfiguration configuration =
        configuredOidcConfiguration(
            "client-id", null, List.of(ClientAuthenticationMethod.CLIENT_SECRET_BASIC));
    configuration.setWithState(true);
    setField(handler, "client", oidcClient(configuration, "StateClient"));

    AuthenticationSuccessResponse successResponse =
        new AuthenticationSuccessResponse(
            URI.create("https://openmetadata.example.com/callback"),
            new AuthorizationCode("auth-code"),
            null,
            null,
            new State("response-state"),
            null,
            ResponseMode.QUERY);

    invokePrivate(
        handler,
        "validateStateIfRequired",
        new Class<?>[] {
          HttpSession.class, HttpServletResponse.class, AuthenticationSuccessResponse.class
        },
        session,
        response,
        successResponse);

    verify(response).setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
  }

  @Test
  void validateStateIfRequiredRejectsMismatchedState() throws Exception {
    AuthenticationCodeFlowHandler handler = newHandler();
    OidcConfiguration configuration =
        configuredOidcConfiguration(
            "client-id", null, List.of(ClientAuthenticationMethod.CLIENT_SECRET_BASIC));
    configuration.setWithState(true);
    OidcClient client = oidcClient(configuration, "StateClient");
    setField(handler, "client", client);
    when(session.getAttribute(client.getStateSessionAttributeName())).thenReturn(new State("sent"));
    AuthenticationSuccessResponse successResponse =
        new AuthenticationSuccessResponse(
            URI.create("https://openmetadata.example.com/callback"),
            new AuthorizationCode("auth-code"),
            null,
            null,
            new State("received"),
            null,
            ResponseMode.QUERY);

    TechnicalException exception =
        assertThrows(
            TechnicalException.class,
            () ->
                invokePrivate(
                    handler,
                    "validateStateIfRequired",
                    new Class<?>[] {
                      HttpSession.class, HttpServletResponse.class, AuthenticationSuccessResponse.class
                    },
                    session,
                    response,
                    successResponse));

    assertTrue(exception.getMessage().contains("State parameter is different"));
  }

  @Test
  void validateNonceIfRequiredRejectsMissingAndUnexpectedNonce() throws Exception {
    AuthenticationCodeFlowHandler handler = newHandler();
    OidcConfiguration configuration =
        configuredOidcConfiguration(
            "client-id", null, List.of(ClientAuthenticationMethod.CLIENT_SECRET_BASIC));
    configuration.setUseNonce(true);
    OidcClient client = oidcClient(configuration, "NonceClient");
    setField(handler, "client", client);

    TechnicalException missingSessionNonce =
        assertThrows(
            TechnicalException.class,
            () ->
                invokePrivate(
                    handler,
                    "validateNonceIfRequired",
                    new Class<?>[] {HttpSession.class, JWTClaimsSet.class},
                    session,
                    new JWTClaimsSet.Builder().claim("nonce", "expected").build()));
    assertTrue(missingSessionNonce.getMessage().contains("Missing nonce"));

    when(session.getAttribute(client.getNonceSessionAttributeName())).thenReturn("expected");
    com.nimbusds.jwt.proc.BadJWTException badNonce =
        assertThrows(
            com.nimbusds.jwt.proc.BadJWTException.class,
            () ->
                invokePrivate(
                    handler,
                    "validateNonceIfRequired",
                    new Class<?>[] {HttpSession.class, JWTClaimsSet.class},
                    session,
                    new JWTClaimsSet.Builder().claim("nonce", "unexpected").build()));
    assertTrue(badNonce.getMessage().contains("Unexpected JWT nonce"));
  }

  @Test
  void createTokenRequestUsesClientAuthenticationWhenAvailable() throws Exception {
    AuthenticationCodeFlowHandler handler = newHandler();
    OidcConfiguration configuration =
        configuredOidcConfiguration(
            "client-id", "client-secret", List.of(ClientAuthenticationMethod.CLIENT_SECRET_BASIC));
    OidcClient client = oidcClient(configuration, "TokenClient");
    setField(handler, "client", client);
    setField(
        handler,
        "clientAuthentication",
        new ClientSecretBasic(
            new com.nimbusds.oauth2.sdk.id.ClientID("client-id"),
            new com.nimbusds.oauth2.sdk.auth.Secret("client-secret")));

    com.nimbusds.oauth2.sdk.TokenRequest requestWithAuthentication =
        invokePrivate(
            handler,
            "createTokenRequest",
            new Class<?>[] {com.nimbusds.oauth2.sdk.AuthorizationGrant.class},
            new RefreshTokenGrant(new com.nimbusds.oauth2.sdk.token.RefreshToken("refresh-token")));

    assertNotNull(requestWithAuthentication.getClientAuthentication());
    assertNull(requestWithAuthentication.getClientID());

    setField(handler, "clientAuthentication", null);

    com.nimbusds.oauth2.sdk.TokenRequest requestWithClientId =
        invokePrivate(
            handler,
            "createTokenRequest",
            new Class<?>[] {com.nimbusds.oauth2.sdk.AuthorizationGrant.class},
            new RefreshTokenGrant(new com.nimbusds.oauth2.sdk.token.RefreshToken("refresh-token")));

    assertNull(requestWithClientId.getClientAuthentication());
    assertEquals("client-id", requestWithClientId.getClientID().getValue());
  }

  @Test
  void buildCredentialsCopiesAuthorizationArtifacts() throws Exception {
    AuthenticationCodeFlowHandler handler = newHandler();
    SignedJWT idToken =
        new SignedJWT(
            new JWSHeader(JWSAlgorithm.HS256),
            new JWTClaimsSet.Builder().subject("user").build());
    AccessToken accessToken = new BearerAccessToken("access-token");
    AuthenticationSuccessResponse successResponse =
        new AuthenticationSuccessResponse(
            URI.create("https://openmetadata.example.com/callback"),
            new AuthorizationCode("auth-code"),
            idToken,
            accessToken,
            new State("state"),
            null,
            ResponseMode.QUERY);

    org.pac4j.oidc.credentials.OidcCredentials credentials =
        invokePrivate(
            handler,
            "buildCredentials",
            new Class<?>[] {AuthenticationSuccessResponse.class},
            successResponse);

    assertEquals("auth-code", credentials.getCode().getValue());
    assertEquals(idToken, credentials.getIdToken());
    assertEquals(accessToken, credentials.getAccessToken());
  }

  @Test
  void handleLoginRedirectsToProviderWithSecurityParameters() throws Exception {
    AuthenticationCodeFlowHandler handler = newHandler();
    OidcConfiguration configuration =
        configuredOidcConfiguration(
            "client-id", null, List.of(ClientAuthenticationMethod.CLIENT_SECRET_BASIC));
    configuration.setWithState(true);
    configuration.setUseNonce(true);
    configuration.setPkceMethod(CodeChallengeMethod.S256);
    configuration.addCustomParam("resource", "https://graph.microsoft.com");
    OidcClient client = oidcClient(configuration, "LoginClient");
    setField(handler, "client", client);
    setField(handler, "promptType", "login");
    setField(handler, "maxAge", "600");

    when(request.getSession(false)).thenReturn(null);
    when(request.getSession(true)).thenReturn(session);
    when(request.getParameter(AuthenticationCodeFlowHandler.REDIRECT_URI_KEY))
        .thenReturn("https://app.example.com/post-login");
    when(session.getAttribute(AuthenticationCodeFlowHandler.OIDC_CREDENTIAL_PROFILE)).thenReturn(null);
    when(session.getId()).thenReturn("session-id");

    handler.handleLogin(request, response);

    verify(session)
        .setAttribute(
            AuthenticationCodeFlowHandler.SESSION_REDIRECT_URI,
            "https://app.example.com/post-login");
    ArgumentCaptor<String> redirectCaptor = ArgumentCaptor.forClass(String.class);
    verify(response).sendRedirect(redirectCaptor.capture());
    String location = redirectCaptor.getValue();
    assertTrue(location.startsWith("https://issuer.example.com/authorize?"));
    assertTrue(location.contains("client_id=client-id"));
    assertTrue(location.contains("redirect_uri=https%3A%2F%2Fopenmetadata.example.com%2Fcallback"));
    assertTrue(location.contains("prompt=login"));
    assertTrue(location.contains("max_age=600"));
    assertTrue(location.contains("resource=https%3A%2F%2Fgraph.microsoft.com"));
    assertTrue(location.contains("state="));
    assertTrue(location.contains("nonce="));
    assertTrue(location.contains("code_challenge="));
  }

  @Test
  void handleCallbackWithoutSessionReturnsErrorResponse() {
    AuthenticationCodeFlowHandler handler = assertDoesNotThrow(AuthenticationCodeFlowHandlerTest::newHandler);
    assertDoesNotThrow(() -> when(response.getOutputStream()).thenReturn(outputStream));
    when(request.getSession(false)).thenReturn(null);

    handler.handleCallback(request, response);

    verify(response).setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
  }

  @Test
  void isJwtRecognizesThreePartTokens() {
    assertTrue(AuthenticationCodeFlowHandler.isJWT("a.b.c"));
    assertTrue(!AuthenticationCodeFlowHandler.isJWT("a.b"));
  }

  private static AuthenticationCodeFlowHandler newHandler() throws Exception {
    Field unsafeField = Unsafe.class.getDeclaredField("theUnsafe");
    unsafeField.setAccessible(true);
    Unsafe unsafe = (Unsafe) unsafeField.get(null);
    return (AuthenticationCodeFlowHandler) unsafe.allocateInstance(AuthenticationCodeFlowHandler.class);
  }

  private static OidcConfiguration configuredOidcConfiguration(
      String clientId,
      String secret,
      List<ClientAuthenticationMethod> supportedMethods) {
    OidcConfiguration configuration = new OidcConfiguration();
    configuration.setClientId(clientId);
    if (secret != null) {
      configuration.setSecret(secret);
    }
    configuration.setScope("openid profile");
    configuration.setResponseType("code");
    configuration.setResponseMode("query");
    configuration.setProviderMetadata(providerMetadata(supportedMethods));
    return configuration;
  }

  private static OidcClient oidcClient(OidcConfiguration configuration, String name) {
    OidcClient client = new OidcClient(configuration);
    client.setName(name);
    client.setCallbackUrl("https://openmetadata.example.com/callback");
    return client;
  }

  private static OIDCProviderMetadata providerMetadata(
      List<ClientAuthenticationMethod> supportedMethods) {
    OIDCProviderMetadata metadata =
        new OIDCProviderMetadata(
            new Issuer("https://issuer.example.com"),
            List.of(SubjectType.PUBLIC),
            URI.create("https://issuer.example.com/jwks"));
    metadata.setAuthorizationEndpointURI(URI.create("https://issuer.example.com/authorize"));
    metadata.setTokenEndpointURI(URI.create("https://issuer.example.com/token"));
    metadata.setTokenEndpointAuthMethods(supportedMethods);
    metadata.setCodeChallengeMethods(List.of(CodeChallengeMethod.S256));
    return metadata;
  }

  private static void setField(Object target, String name, Object value) throws Exception {
    Field field = AuthenticationCodeFlowHandler.class.getDeclaredField(name);
    field.setAccessible(true);
    field.set(target, value);
  }

  @SuppressWarnings("unchecked")
  private static <T> T invokePrivate(
      Object target, String methodName, Class<?>[] parameterTypes, Object... args) throws Exception {
    Method method = AuthenticationCodeFlowHandler.class.getDeclaredMethod(methodName, parameterTypes);
    method.setAccessible(true);
    try {
      return (T) method.invoke(target, args);
    } catch (InvocationTargetException e) {
      if (e.getCause() instanceof Exception exception) {
        throw exception;
      }
      if (e.getCause() instanceof Error error) {
        throw error;
      }
      throw new RuntimeException(e.getCause());
    }
  }
}
