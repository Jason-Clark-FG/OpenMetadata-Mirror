/*
 *  Copyright 2024 Collate
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

package org.openmetadata.service.util;

import org.owasp.html.HtmlPolicyBuilder;
import org.owasp.html.PolicyFactory;

/**
 * Sanitizes user-supplied HTML/Markdown descriptions to prevent stored XSS attacks. Allows safe
 * markdown-generated HTML elements while stripping dangerous tags, attributes, and event handlers.
 */
public final class DescriptionSanitizer {

  private static final PolicyFactory MARKDOWN_POLICY =
      new HtmlPolicyBuilder()
          // Formatting
          .allowElements(
              "p", "br", "hr", "em", "strong", "b", "i", "u", "s", "del", "ins", "sub", "sup",
              "small", "mark")
          // Headings
          .allowElements("h1", "h2", "h3", "h4", "h5", "h6")
          // Lists
          .allowElements("ul", "ol", "li")
          // Block elements
          .allowElements("blockquote", "pre", "code", "div", "span", "section")
          // Tables
          .allowElements(
              "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col")
          // Links
          .allowElements("a")
          .allowAttributes("href")
          .matching(
              (elementName, attributeName, value) -> {
                if (value.startsWith("http://")
                    || value.startsWith("https://")
                    || value.startsWith("mailto:")
                    || value.startsWith("#")) {
                  return value;
                }
                return null;
              })
          .onElements("a")
          .allowAttributes("target")
          .onElements("a")
          .allowAttributes("rel")
          .onElements("a")
          // Images (src must be http/https/data URI)
          .allowElements("img")
          .allowAttributes("src")
          .matching(
              (elementName, attributeName, value) -> {
                if (value.startsWith("http://")
                    || value.startsWith("https://")
                    || value.startsWith("data:image/")) {
                  return value;
                }
                return null;
              })
          .onElements("img")
          .allowAttributes("alt", "title", "width", "height")
          .onElements("img")
          // Common safe attributes
          .allowAttributes("class", "id", "data-id", "data-highlighted", "data-testid")
          .globally()
          .allowAttributes("align")
          .onElements("td", "th", "tr", "table")
          .allowAttributes("colspan", "rowspan")
          .onElements("td", "th")
          // Details/summary for collapsible sections
          .allowElements("details", "summary")
          // Definition lists
          .allowElements("dl", "dt", "dd")
          .toFactory();

  private DescriptionSanitizer() {}

  /**
   * Sanitizes a markdown/HTML description string by removing dangerous elements (script, iframe,
   * event handlers like onerror/onclick) while preserving safe markdown-generated HTML.
   *
   * @param description the raw description from user input
   * @return sanitized description safe for storage and rendering, or null if input is null
   */
  public static String sanitize(String description) {
    if (description == null) {
      return null;
    }
    return MARKDOWN_POLICY.sanitize(description);
  }
}
