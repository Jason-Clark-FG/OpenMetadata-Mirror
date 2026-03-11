package org.openmetadata.service.logging;

import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.core.LayoutBase;
import ch.qos.logback.core.spi.DeferredProcessingAware;
import io.dropwizard.logging.common.layout.DiscoverableLayoutFactory;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

abstract class AbstractSwitchableLayoutFactory<E extends DeferredProcessingAware>
    implements DiscoverableLayoutFactory<E> {
  private static final String TEXT = "text";
  private static final String JSON = "json";

  private String format = TEXT;
  private boolean appendLineSeparator = true;
  private Map<String, Object> additionalFields;
  private String pattern;

  @Override
  public LayoutBase<E> build(LoggerContext context, TimeZone timeZone) {
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

  protected boolean hasPattern() {
    return pattern != null && !pattern.isBlank();
  }

  protected String getPatternValue() {
    return pattern;
  }

  protected boolean hasAdditionalFields() {
    return additionalFields != null && !additionalFields.isEmpty();
  }

  protected Map<String, Object> getAdditionalFieldsValue() {
    return additionalFields;
  }

  protected boolean isAppendLineSeparatorEnabled() {
    return appendLineSeparator;
  }

  protected abstract LayoutBase<E> buildTextLayout(LoggerContext context, TimeZone timeZone);

  protected abstract LayoutBase<E> buildJsonLayout(LoggerContext context, TimeZone timeZone);

  protected String getInvalidFormatLabel() {
    return "log";
  }

  private String normalizeFormat() {
    return format == null ? TEXT : format.trim().toLowerCase(Locale.ROOT);
  }

  private IllegalArgumentException invalidFormat() {
    return new IllegalArgumentException(
        String.format(
            "Unsupported %s format '%s'. Expected one of [%s, %s].",
            getInvalidFormatLabel(), format, TEXT, JSON));
  }
}
