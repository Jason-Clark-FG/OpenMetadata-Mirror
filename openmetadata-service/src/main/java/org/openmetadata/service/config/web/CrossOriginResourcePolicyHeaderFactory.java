package org.openmetadata.service.config.web;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Collections;
import java.util.Map;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CrossOriginResourcePolicyHeaderFactory extends HeaderFactory {

  public static final String CROSS_ORIGIN_RESOURCE_POLICY_HEADER = "Cross-Origin-Resource-Policy";

  @JsonProperty("option")
  private String option = "same-origin";

  @Override
  protected Map<String, String> buildHeaders() {
    return Collections.singletonMap(CROSS_ORIGIN_RESOURCE_POLICY_HEADER, option);
  }
}
