package org.openmetadata.service.config.web;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Collections;
import java.util.Map;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CrossOriginOpenerPolicyHeaderFactory extends HeaderFactory {

  public static final String CROSS_ORIGIN_OPENER_POLICY_HEADER = "Cross-Origin-Opener-Policy";

  @JsonProperty("option")
  private String option = "same-origin";

  @Override
  protected Map<String, String> buildHeaders() {
    return Collections.singletonMap(CROSS_ORIGIN_OPENER_POLICY_HEADER, option);
  }
}
