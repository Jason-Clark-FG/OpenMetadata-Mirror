---
title: collectionDescriptor
slug: /main-concepts/metadata-standard/schemas/type/collectiondescriptor
---

# CollectionDescriptor

*Type used for capturing the details of a collection.*

## Properties

- **`collection`**: Refer to *#/definitions/collectionInfo*.
## Definitions

- **`collectionInfo`** *(object)*: Collection Info. Cannot contain additional properties.
  - **`name`** *(string)*: Unique name that identifies a collection.
  - **`documentation`** *(string)*: Description of collection.
  - **`href`** *(string)*: URL of the API endpoint where given collections are available.
  - **`images`**: Refer to *profile.json#/definitions/imageList*.


Documentation file automatically generated at 2023-10-27 13:55:46.343512.
