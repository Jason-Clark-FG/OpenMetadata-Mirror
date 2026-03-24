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

package org.openmetadata.service.jdbi3;

import static org.openmetadata.service.Entity.ANNOUNCEMENT;

import lombok.extern.slf4j.Slf4j;
import org.openmetadata.schema.entity.feed.Announcement;
import org.openmetadata.schema.type.AnnouncementStatus;
import org.openmetadata.service.Entity;
import org.openmetadata.service.util.EntityUtil.Fields;
import org.openmetadata.service.util.EntityUtil.RelationIncludes;
import org.openmetadata.service.util.FullyQualifiedName;

@Slf4j
@Repository
public class AnnouncementRepository extends EntityRepository<Announcement> {

  public static final String COLLECTION_PATH = "/v1/announcements";

  public AnnouncementRepository() {
    super(
        COLLECTION_PATH,
        ANNOUNCEMENT,
        Announcement.class,
        Entity.getCollectionDAO().announcementDAO(),
        "",
        "");
    supportsSearch = false;
    quoteFqn = false;
  }

  @Override
  public void setFullyQualifiedName(Announcement announcement) {
    announcement.setFullyQualifiedName(FullyQualifiedName.quoteName(announcement.getName()));
  }

  @Override
  public void prepare(Announcement announcement, boolean update) {
    if (announcement.getName() == null) {
      announcement.setName("announcement-" + announcement.getId());
    }
    if (announcement.getStatus() == null) {
      long now = System.currentTimeMillis();
      if (announcement.getEndTime() < now) {
        announcement.setStatus(AnnouncementStatus.Expired);
      } else if (announcement.getStartTime() > now) {
        announcement.setStatus(AnnouncementStatus.Scheduled);
      } else {
        announcement.setStatus(AnnouncementStatus.Active);
      }
    }
  }

  @Override
  public void storeEntity(Announcement announcement, boolean update) {
    store(announcement, update);
  }

  @Override
  public void setFields(Announcement announcement, Fields fields, RelationIncludes includes) {
    // No relational fields to set
  }

  @Override
  public void clearFields(Announcement announcement, Fields fields) {
    // No extra fields to clear
  }

  @Override
  public void storeRelationships(Announcement announcement) {
    // No relationships needed for announcements
  }

  @Override
  public AnnouncementUpdater getUpdater(
      Announcement original,
      Announcement updated,
      Operation operation,
      org.openmetadata.schema.type.change.ChangeSource changeSource) {
    return new AnnouncementUpdater(original, updated, operation, changeSource);
  }

  public class AnnouncementUpdater extends EntityUpdater {
    public AnnouncementUpdater(
        Announcement original,
        Announcement updated,
        Operation operation,
        org.openmetadata.schema.type.change.ChangeSource changeSource) {
      super(original, updated, operation, changeSource);
    }

    @Override
    public void entitySpecificUpdate(boolean consolidatingChanges) {
      recordChange("description", original.getDescription(), updated.getDescription());
      recordChange("startTime", original.getStartTime(), updated.getStartTime());
      recordChange("endTime", original.getEndTime(), updated.getEndTime());
      recordChange("status", original.getStatus(), updated.getStatus());
    }
  }
}
