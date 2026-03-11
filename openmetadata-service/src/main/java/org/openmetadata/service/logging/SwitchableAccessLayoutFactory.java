package org.openmetadata.service.logging;

import ch.qos.logback.access.common.spi.IAccessEvent;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.core.LayoutBase;
import com.fasterxml.jackson.annotation.JsonTypeName;
import io.dropwizard.logging.json.AccessJsonLayoutBaseFactory;
import io.dropwizard.request.logging.layout.LogbackAccessRequestLayout;
import java.util.TimeZone;

@JsonTypeName("om-access-layout")
public class SwitchableAccessLayoutFactory extends AbstractSwitchableLayoutFactory<IAccessEvent> {
  @Override
  protected LayoutBase<IAccessEvent> buildTextLayout(LoggerContext context, TimeZone timeZone) {
    LogbackAccessRequestLayout layout = new LogbackAccessRequestLayout(context, timeZone);
    if (hasPattern()) {
      layout.setPattern(getPatternValue());
    }
    return layout;
  }

  @Override
  protected LayoutBase<IAccessEvent> buildJsonLayout(LoggerContext context, TimeZone timeZone) {
    AccessJsonLayoutBaseFactory layoutFactory = new AccessJsonLayoutBaseFactory();
    layoutFactory.setAppendLineSeparator(isAppendLineSeparatorEnabled());
    if (hasAdditionalFields()) {
      layoutFactory.setAdditionalFields(getAdditionalFieldsValue());
    }
    return layoutFactory.build(context, timeZone);
  }

  @Override
  protected String getInvalidFormatLabel() {
    return "access log";
  }
}
