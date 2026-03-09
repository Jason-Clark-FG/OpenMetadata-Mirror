package org.openmetadata.service.security;

import static org.openmetadata.service.security.SecurityUtil.extractEmailFromClaim;
import static org.openmetadata.service.security.SecurityUtil.findEmailFromClaims;
import static org.openmetadata.service.security.SecurityUtil.findUserNameFromClaims;

import com.auth0.jwt.interfaces.Claim;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class JwtIdentityResolver {

  public record ResolvedIdentity(String userName, String email, boolean emailFirstFlow) {}

  private final String emailClaim;
  private final Map<String, String> jwtPrincipalClaimsMapping;
  private final List<String> jwtPrincipalClaims;
  private final String principalDomain;
  private final Function<String, String> userNameResolver;

  public JwtIdentityResolver(
      String emailClaim,
      Map<String, String> jwtPrincipalClaimsMapping,
      List<String> jwtPrincipalClaims,
      String principalDomain,
      Function<String, String> userNameResolver) {
    this.emailClaim = emailClaim;
    this.jwtPrincipalClaimsMapping = jwtPrincipalClaimsMapping;
    this.jwtPrincipalClaims = jwtPrincipalClaims;
    this.principalDomain = principalDomain;
    this.userNameResolver = userNameResolver;
  }

  public ResolvedIdentity resolve(Map<String, Claim> claims, boolean isBotUser) {
    if (shouldUseEmailFirstFlow(isBotUser)) {
      try {
        String email = extractEmailFromClaim(claims, emailClaim);
        String userName = userNameResolver.apply(email);
        LOG.debug("Email-first flow: email={}, userName={}", email, userName);
        return new ResolvedIdentity(userName, email, true);
      } catch (AuthenticationException ex) {
        if (!canFallbackToLegacyFlow()) {
          throw ex;
        }
        LOG.warn(
            "Email-first claim resolution failed for claim '{}': {}. Falling back to legacy JWT principal claims.",
            emailClaim,
            ex.getMessage());
      }
    }

    String userName = findUserNameFromClaims(jwtPrincipalClaimsMapping, jwtPrincipalClaims, claims);
    String email =
        findEmailFromClaims(jwtPrincipalClaimsMapping, jwtPrincipalClaims, claims, principalDomain);
    return new ResolvedIdentity(userName, email, false);
  }

  private boolean shouldUseEmailFirstFlow(boolean isBotUser) {
    if (isBotUser) {
      return false;
    }
    if (emailClaim == null || emailClaim.isEmpty()) {
      return false;
    }
    return jwtPrincipalClaimsMapping == null || jwtPrincipalClaimsMapping.isEmpty();
  }

  private boolean canFallbackToLegacyFlow() {
    return jwtPrincipalClaims != null && !jwtPrincipalClaims.isEmpty();
  }
}
