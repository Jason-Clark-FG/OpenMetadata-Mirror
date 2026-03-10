package org.openmetadata.service.logging;

import ch.qos.logback.access.common.spi.IAccessEvent;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.core.LayoutBase;
import com.fasterxml.jackson.annotation.JsonTypeName;
import io.dropwizard.logging.common.layout.DiscoverableLayoutFactory;
import io.dropwizard.logging.json.AccessJsonLayoutBaseFactory;
import io.dropwizard.request.logging.layout.LogbackAccessRequestLayout;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

@JsonTypeName("om-access-layout")
public class SwitchableAccessLayoutFactory implements DiscoverableLayoutFactory<IAccessEvent> {
  private static final String TEXT = "text";
  private static final String JSON = "json";

  private String format = TEXT;
  private boolean appendLineSeparator = true;
  private Map<String, Object> additionalFields;
  private String pattern;

  @Override
  public LayoutBase<IAccessEvent> build(LoggerContext context, TimeZone timeZone) {
    return switch (normalizeFormat()) {
      case TEXT -> buildTextLayout(context, timeZone);
      case JSON -> buildJsonLayout(context, timeZone);
      default -> throw invalidFormat();
    };
  }

  public String getFormat() {
    return format;
  }

  public void setFormat(String format) {
    this.format = format;
  }

  public boolean isAppendLineSeparator() {
    return appendLineSeparator;
  }

  public void setAppendLineSeparator(boolean appendLineSeparator) {
    this.appendLineSeparator = appendLineSeparator;
  }

  public Map<String, Object> getAdditionalFields() {
    return additionalFields;
  }

  public void setAdditionalFields(Map<String, Object> additionalFields) {
    this.additionalFields = additionalFields;
  }

  public String getPattern() {
    return pattern;
  }

  public void setPattern(String pattern) {
    this.pattern = pattern;
  }

  private LayoutBase<IAccessEvent> buildTextLayout(LoggerContext context, TimeZone timeZone) {
    LogbackAccessRequestLayout layout = new LogbackAccessRequestLayout(context, timeZone);
    if (pattern != null && !pattern.isBlank()) {
      layout.setPattern(pattern);
    }
    return layout;
  }

  private LayoutBase<IAccessEvent> buildJsonLayout(LoggerContext context, TimeZone timeZone) {
    AccessJsonLayoutBaseFactory layoutFactory = new AccessJsonLayoutBaseFactory();
    layoutFactory.setAppendLineSeparator(appendLineSeparator);
    if (additionalFields != null && !additionalFields.isEmpty()) {
      layoutFactory.setAdditionalFields(additionalFields);
    }
    return layoutFactory.build(context, timeZone);
  }

  private String normalizeFormat() {
    return format == null ? TEXT : format.trim().toLowerCase(Locale.ROOT);
  }

  private IllegalArgumentException invalidFormat() {
    return new IllegalArgumentException(
        String.format(
            "Unsupported access log format '%s'. Expected one of [%s, %s].", format, TEXT, JSON));
  }
}
