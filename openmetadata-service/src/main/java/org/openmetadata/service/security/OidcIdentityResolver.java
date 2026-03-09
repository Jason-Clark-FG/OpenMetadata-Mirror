package org.openmetadata.service.security;

import static org.openmetadata.common.utils.CommonUtil.nullOrEmpty;
import static org.openmetadata.service.security.SecurityUtil.extractDisplayNameFromClaim;
import static org.openmetadata.service.security.SecurityUtil.extractDisplayNameFromClaims;
import static org.openmetadata.service.security.SecurityUtil.extractEmailFromClaim;
import static org.openmetadata.service.security.SecurityUtil.findEmailFromClaims;
import static org.openmetadata.service.security.SecurityUtil.findTeamsFromClaims;
import static org.openmetadata.service.security.SecurityUtil.findUserNameFromClaims;
import static org.openmetadata.service.security.SecurityUtil.validateConfiguredEmailDomain;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.api.security.AuthenticationConfiguration;
import org.openmetadata.schema.api.security.AuthorizerConfiguration;
import org.openmetadata.service.exception.AuthenticationException;

@Slf4j
public class OidcIdentityResolver {

  public record ResolvedOidcIdentity(
      String userName, String email, String displayName, boolean emailFirstFlow) {}

  private final AuthenticationConfiguration authenticationConfiguration;
  private final AuthorizerConfiguration authorizerConfiguration;
  private final Map<String, String> claimsMapping;
  private final List<String> claimsOrder;
  private final String principalDomain;

  public OidcIdentityResolver(
      AuthenticationConfiguration authenticationConfiguration,
      AuthorizerConfiguration authorizerConfiguration,
      Map<String, String> claimsMapping,
      List<String> claimsOrder,
      String principalDomain) {
    this.authenticationConfiguration = authenticationConfiguration;
    this.authorizerConfiguration = authorizerConfiguration;
    this.claimsMapping = claimsMapping;
    this.claimsOrder = claimsOrder;
    this.principalDomain = principalDomain;
  }

  public ResolvedOidcIdentity resolve(Map<String, Object> claims) {
    if (shouldUseEmailFirstFlow()) {
      try {
        String email = extractEmailFromClaim(claims, authenticationConfiguration.getEmailClaim());
        validateConfiguredEmailDomain(
            email,
            getAllowedEmailDomains(),
            principalDomain,
            authorizerConfiguration.getAllowedDomains(),
            authorizerConfiguration.getEnforcePrincipalDomain());
        String displayName =
            extractDisplayNameFromClaim(
                claims, authenticationConfiguration.getDisplayNameClaim(), email);

        LOG.debug(
            "OIDC email-first flow: email={}, userName={}, displayName={}",
            email,
            email.split("@")[0],
            displayName);
        return new ResolvedOidcIdentity(null, email, displayName, true);
      } catch (AuthenticationException
          | org.openmetadata.service.security.AuthenticationException ex) {
        if (!canFallbackToLegacyFlow()) {
          throw ex;
        }
        LOG.warn(
            "OIDC email-first claim resolution failed for claim '{}': {}. Falling back to legacy JWT principal claims.",
            authenticationConfiguration.getEmailClaim(),
            ex.getMessage());
      }
    }

    String userName = findUserNameFromClaims(claimsMapping, claimsOrder, claims);
    String email = findEmailFromClaims(claimsMapping, claimsOrder, claims, principalDomain);
    validateConfiguredEmailDomain(
        email,
        getAllowedEmailDomains(),
        principalDomain,
        authorizerConfiguration.getAllowedDomains(),
        authorizerConfiguration.getEnforcePrincipalDomain());
    String displayName = extractDisplayNameFromClaims(claims);
    return new ResolvedOidcIdentity(userName, email, displayName, false);
  }

  public List<String> resolveTeams(Map<String, Object> claims, String teamClaimMapping) {
    return findTeamsFromClaims(teamClaimMapping, claims);
  }

  private boolean shouldUseLegacyFlow() {
    return claimsMapping != null && !claimsMapping.isEmpty();
  }

  private boolean shouldUseEmailFirstFlow() {
    return !nullOrEmpty(authenticationConfiguration.getEmailClaim()) && !shouldUseLegacyFlow();
  }

  private boolean canFallbackToLegacyFlow() {
    return claimsOrder != null && !claimsOrder.isEmpty();
  }

  private List<String> getAllowedEmailDomains() {
    return authorizerConfiguration.getAllowedEmailDomains() != null
        ? new ArrayList<>(authorizerConfiguration.getAllowedEmailDomains())
        : new ArrayList<>();
  }
}
