package org.openmetadata.it.util;

import java.util.Collections;
import java.util.Comparator;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.ClassDescriptor;
import org.junit.jupiter.api.ClassOrderer;
import org.junit.jupiter.api.ClassOrdererContext;

/**
 * Orders test classes so that {@link IsolatedTest}-annotated classes run before all others. Among
 * isolated classes and among non-isolated classes, the original discovery order is preserved.
 *
 * <p>Also accumulates the set of isolated class names for {@link IsolatedTestSynchronizer}. JUnit 5
 * calls {@code orderClasses()} multiple times (once per engine/container), so a concurrent set is
 * used to deduplicate across invocations.
 */
public class IsolatedFirstClassOrderer implements ClassOrderer {

  static final Set<String> ISOLATED_CLASSES = Collections.newSetFromMap(new ConcurrentHashMap<>());

  @Override
  public void orderClasses(ClassOrdererContext context) {
    context.getClassDescriptors().stream()
        .filter(d -> d.findAnnotation(IsolatedTest.class).isPresent())
        .forEach(d -> ISOLATED_CLASSES.add(d.getTestClass().getName()));
    context
        .getClassDescriptors()
        .sort(Comparator.comparingInt(IsolatedFirstClassOrderer::priority));
  }

  private static int priority(ClassDescriptor descriptor) {
    return descriptor.findAnnotation(IsolatedTest.class).isPresent() ? 0 : 1;
  }
}
