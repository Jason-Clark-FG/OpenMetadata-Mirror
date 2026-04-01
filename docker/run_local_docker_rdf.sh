#!/bin/bash
#  Copyright 2021 Collate
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#  http://www.apache.org/licenses/LICENSE-2.0
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")" || exit

filtered_args=()
skip_next=false
for arg in "$@"; do
  if [[ "$skip_next" == "true" ]]; then
    skip_next=false
    continue
  fi

  if [[ "$arg" == "-f" ]]; then
    skip_next=true
    continue
  fi

  filtered_args+=("$arg")
done

exec ./run_local_docker.sh "${filtered_args[@]}"
