#  Copyright 2025 Collate
#  Licensed under the Collate Community License, Version 1.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#  https://github.com/open-metadata/OpenMetadata/blob/main/ingestion/LICENSE
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
"""
SSAS / Azure Analysis Services XMLA client.

Communicates with the XMLA HTTP endpoint using SOAP and handles both
Basic (username / password) and Azure Service Principal authentication.
"""
import re
import traceback
from typing import Any, Dict, List, Optional
from xml.etree import ElementTree as ET

import requests

from metadata.utils.logger import ingestion_logger

logger = ingestion_logger()

_XMLA_NS = "urn:schemas-microsoft-com:xml-analysis"
_SOAP_NS = "http://schemas.xmlsoap.org/soap/envelope/"
_ROWSET_NS = "urn:schemas-microsoft-com:xml-analysis:rowset"

_DISCOVER_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="{soap_ns}">
  <soap:Body>
    <Discover xmlns="{xmla_ns}">
      <RequestType>{request_type}</RequestType>
      <Restrictions>
        <RestrictionList>{restrictions}</RestrictionList>
      </Restrictions>
      <Properties>
        <PropertyList>
          <DataSourceInfo>{datasource_info}</DataSourceInfo>
          <Format>Tabular</Format>
          <Content>SchemaData</Content>
          {catalog_element}
        </PropertyList>
      </Properties>
    </Discover>
  </soap:Body>
</soap:Envelope>"""

_AAS_REGION_RE = re.compile(
    r"^asazure://([^/]+)/([^/]+)$", re.IGNORECASE
)


def _aas_server_to_https(server_url: str) -> str:
    """
    Convert an AAS connection string to an HTTPS XMLA endpoint URL.

    ``asazure://eastus.asazure.windows.net/myserver``
    → ``https://eastus.asazure.windows.net/servers/myserver/models``
    """
    match = _AAS_REGION_RE.match(server_url.strip())
    if match:
        region_host, server_name = match.group(1), match.group(2)
        return f"https://{region_host}/servers/{server_name}/models"
    return server_url


class SSASClient:
    """
    Thin client that wraps XMLA HTTP access to on-premises SSAS or
    Azure Analysis Services (AAS).
    """

    def __init__(
        self,
        http_connection: str,
        auth_config: Any,
    ):
        self._raw_url = http_connection
        self._auth_config = auth_config
        self._session = requests.Session()
        self._session.headers.update(
            {
                "Content-Type": "text/xml; charset=utf-8",
                "SOAPAction": '"urn:schemas-microsoft-com:xml-analysis:Discover"',
            }
        )
        self._endpoint: Optional[str] = None
        self._token: Optional[str] = None

    # ------------------------------------------------------------------
    # Authentication helpers
    # ------------------------------------------------------------------

    def _is_azure_auth(self) -> bool:
        auth_type = getattr(self._auth_config, "authType", None)
        return str(auth_type) == "azureServicePrincipal"

    def _resolve_endpoint(self) -> str:
        if self._endpoint is None:
            self._endpoint = _aas_server_to_https(self._raw_url)
        return self._endpoint

    def _get_azure_token(self) -> str:
        try:
            import msal  # pylint: disable=import-outside-toplevel
        except ImportError as exc:
            raise ImportError(
                "The 'msal' package is required for Azure Analysis Services authentication. "
                "Install it with: pip install 'openmetadata-ingestion[ssas]'"
            ) from exc

        authority = getattr(
            self._auth_config,
            "authorityURI",
            "https://login.microsoftonline.com/",
        )
        tenant_id = self._auth_config.tenantId
        client_id = self._auth_config.clientId
        client_secret = self._auth_config.clientSecret.get_secret_value()

        authority_url = f"{authority.rstrip('/')}/{tenant_id}"
        app = msal.ConfidentialClientApplication(
            client_id=client_id,
            client_credential=client_secret,
            authority=authority_url,
        )
        result = app.acquire_token_for_client(
            scopes=["https://*.asazure.windows.net/.default"]
        )
        if "access_token" not in result:
            raise ConnectionError(
                f"Failed to acquire Azure AD token: {result.get('error_description', result)}"
            )
        return result["access_token"]

    def _prepare_session(self) -> None:
        if self._is_azure_auth():
            token = self._get_azure_token()
            self._session.headers["Authorization"] = f"Bearer {token}"
        else:
            username = self._auth_config.username
            password = self._auth_config.password.get_secret_value()
            self._session.auth = (username, password)

    # ------------------------------------------------------------------
    # XMLA helpers
    # ------------------------------------------------------------------

    def _datasource_info(self) -> str:
        """Build the DataSourceInfo value for XMLA requests."""
        return f"Provider=MSOLAP;Data Source={self._raw_url}"

    def _discover(
        self,
        request_type: str,
        restrictions: str = "",
        catalog: Optional[str] = None,
    ) -> List[Dict[str, str]]:
        """Send an XMLA Discover request and return parsed rows."""
        catalog_element = (
            f"<Catalog>{catalog}</Catalog>" if catalog else ""
        )
        body = _DISCOVER_TEMPLATE.format(
            soap_ns=_SOAP_NS,
            xmla_ns=_XMLA_NS,
            request_type=request_type,
            restrictions=restrictions,
            datasource_info=self._datasource_info(),
            catalog_element=catalog_element,
        )
        endpoint = self._resolve_endpoint()
        response = self._session.post(endpoint, data=body.encode("utf-8"), timeout=60)
        response.raise_for_status()
        return _parse_rowset(response.text)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def connect(self) -> None:
        """Initialise auth and verify the endpoint is reachable."""
        self._prepare_session()
        self._discover("DBSCHEMA_CATALOGS")

    def get_catalogs(self) -> List[str]:
        """Return list of catalog (database) names."""
        rows = self._discover("DBSCHEMA_CATALOGS")
        return [r["CATALOG_NAME"] for r in rows if "CATALOG_NAME" in r]

    def get_tables(self, catalog: str) -> List[Dict[str, str]]:
        """Return table rows for the given catalog."""
        restrictions = (
            f"<CATALOG_NAME>{catalog}</CATALOG_NAME>"
            "<TABLE_TYPE>TABLE</TABLE_TYPE>"
        )
        return self._discover("DBSCHEMA_TABLES", restrictions=restrictions, catalog=catalog)

    def get_columns(self, catalog: str, table_name: str) -> List[Dict[str, str]]:
        """Return column rows for the given table."""
        restrictions = (
            f"<CATALOG_NAME>{catalog}</CATALOG_NAME>"
            f"<TABLE_NAME>{table_name}</TABLE_NAME>"
        )
        return self._discover(
            "DBSCHEMA_COLUMNS", restrictions=restrictions, catalog=catalog
        )

    def get_measures(self, catalog: str) -> List[Dict[str, str]]:
        """Return measure rows for the given catalog."""
        restrictions = f"<CATALOG_NAME>{catalog}</CATALOG_NAME>"
        return self._discover(
            "MDSCHEMA_MEASURES", restrictions=restrictions, catalog=catalog
        )

    def close(self) -> None:
        self._session.close()


# ------------------------------------------------------------------
# XML parsing helpers
# ------------------------------------------------------------------

def _parse_rowset(xml_text: str) -> List[Dict[str, str]]:
    """Parse the rows out of an XMLA Discover Tabular response."""
    try:
        root = ET.fromstring(xml_text)
        rows = []
        for row_el in root.iter(f"{{{_ROWSET_NS}}}row"):
            row: Dict[str, str] = {}
            for child in row_el:
                local = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                row[local] = child.text or ""
            rows.append(row)
        return rows
    except ET.ParseError:
        logger.debug(traceback.format_exc())
        return []
