package org.openmetadata.service.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class MigrationTestRunnerTest {

  @Test
  void testVersionToPackageStandard() {
    assertEquals("v1_12_0", MigrationTestRunner.versionToPackage("1.12.0"));
  }

  @Test
  void testVersionToPackageSingleDigit() {
    assertEquals("v1_1_0", MigrationTestRunner.versionToPackage("1.1.0"));
  }

  @Test
  void testVersionToPackageWithPatch() {
    assertEquals("v1_1_15", MigrationTestRunner.versionToPackage("1.1.15"));
  }

  @Test
  void testVersionToPackageWithExtension() {
    assertEquals("v1_12_0", MigrationTestRunner.versionToPackage("1.12.0-collate"));
  }

  @Test
  void testVersionToPackageMajorOnly() {
    assertEquals("v2_0_0", MigrationTestRunner.versionToPackage("2.0.0"));
  }

  @Test
  void testVersionToPackageTwoParts() {
    assertEquals("v1_0", MigrationTestRunner.versionToPackage("1.0"));
  }

  @Test
  void testVersionToPackageSinglePart() {
    assertEquals("v3", MigrationTestRunner.versionToPackage("3"));
  }

  @Test
  void testVersionToPackageInvalidNonNumericThrows() {
    assertThrows(NumberFormatException.class, () -> MigrationTestRunner.versionToPackage("abc"));
  }

  @Test
  void testVersionToPackageWithExtensionTwoParts() {
    assertEquals("v1_6", MigrationTestRunner.versionToPackage("1.6-SNAPSHOT"));
  }

  @Test
  void testVersionToPackageNoCollision() {
    String v1 = MigrationTestRunner.versionToPackage("1.12.0");
    String v2 = MigrationTestRunner.versionToPackage("1.1.20");
    assertNotEquals(v1, v2);
  }
}
