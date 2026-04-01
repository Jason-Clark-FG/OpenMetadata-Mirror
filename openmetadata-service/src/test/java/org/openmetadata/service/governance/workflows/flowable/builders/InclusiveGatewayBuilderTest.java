package org.openmetadata.service.governance.workflows.flowable.builders;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.flowable.bpmn.model.InclusiveGateway;
import org.junit.jupiter.api.Test;

class InclusiveGatewayBuilderTest {

  @Test
  void testBuildDefaultsToAsyncExclusive() {
    InclusiveGateway gateway = new InclusiveGatewayBuilder().id("splitGateway").build();

    assertEquals("splitGateway", gateway.getId());
    assertEquals("splitGateway", gateway.getName());
    assertTrue(gateway.isAsynchronous());
    assertTrue(gateway.isExclusive());
    assertNull(gateway.getDefaultFlow());
  }

  @Test
  void testBuildWithDefaultFlow() {
    InclusiveGateway gateway =
        new InclusiveGatewayBuilder().id("joinGateway").defaultFlow("flow1").build();

    assertEquals("joinGateway", gateway.getId());
    assertEquals("flow1", gateway.getDefaultFlow());
  }

  @Test
  void testBuildWithAsyncFalse() {
    InclusiveGateway gateway = new InclusiveGatewayBuilder().id("g1").setAsync(false).build();

    assertEquals("g1", gateway.getId());
    assertTrue(!gateway.isAsynchronous());
  }
}
