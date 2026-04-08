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

cd "$(dirname "${BASH_SOURCE[0]}")" || exit

helpFunction()
{
   echo ""
   echo "Usage: $0 [run_local_docker.sh args]"
   echo "\t-f Start Fuseki for RDF support: [true, false]. Default [true]"
   echo "\t-h For usage help"
   exit 1
}

startFuseki=true
filtered_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -f)
      if [[ $# -lt 2 ]]; then
        helpFunction
      fi
      startFuseki="$2"
      shift 2
      ;;
    -h)
      helpFunction
      ;;
    *)
      filtered_args+=("$1")
      shift
      ;;
  esac
done

if [[ $startFuseki == "true" ]]; then
  export RDF_ENABLED=true
  export RDF_AUTO_REINDEX=true
else
  export RDF_ENABLED=false
  export RDF_AUTO_REINDEX=false
fi

exec ./run_local_docker.sh "${filtered_args[@]}"
