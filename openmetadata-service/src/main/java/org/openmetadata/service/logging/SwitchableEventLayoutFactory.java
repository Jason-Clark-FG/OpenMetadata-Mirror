package org.openmetadata.service.logging;

import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.LayoutBase;
import com.fasterxml.jackson.annotation.JsonTypeName;
import io.dropwizard.logging.common.DropwizardLayout;
import io.dropwizard.logging.json.EventJsonLayoutBaseFactory;
import java.util.TimeZone;

@JsonTypeName("om-event-layout")
public class SwitchableEventLayoutFactory extends AbstractSwitchableLayoutFactory<ILoggingEvent> {
  @Override
  protected LayoutBase<ILoggingEvent> buildTextLayout(LoggerContext context, TimeZone timeZone) {
    DropwizardLayout layout = new DropwizardLayout(context, timeZone);
    if (hasPattern()) {
      layout.setPattern(getPatternValue());
    }
    return layout;
  }

  @Override
  protected LayoutBase<ILoggingEvent> buildJsonLayout(LoggerContext context, TimeZone timeZone) {
    EventJsonLayoutBaseFactory layoutFactory = new EventJsonLayoutBaseFactory();
    layoutFactory.setAppendLineSeparator(isAppendLineSeparatorEnabled());
    if (hasAdditionalFields()) {
      layoutFactory.setAdditionalFields(getAdditionalFieldsValue());
    }
    return layoutFactory.build(context, timeZone);
  }
}
