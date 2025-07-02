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

"""
Google Sheets connection and helpers
"""
from typing import Optional

from google.auth import default
from google.oauth2 import service_account
from googleapiclient.discovery import Resource, build

from metadata.generated.schema.entity.automations.workflow import (
    Workflow as AutomationWorkflow,
)
from metadata.generated.schema.entity.services.connections.database.googleSheetsConnection import (
    GoogleSheetsConnection,
)
from metadata.generated.schema.entity.services.connections.testConnectionResult import (
    TestConnectionResult,
)
from metadata.generated.schema.security.credentials.gcpCredentials import (
    GcpADC as GCPADCredentials,
)
from metadata.generated.schema.security.credentials.gcpCredentials import (
    GcpCredentialsPath,
)
from metadata.generated.schema.security.credentials.gcpValues import (
    GcpCredentialsValues,
)
from metadata.ingestion.connections.test_connections import TestConnectionStep
from metadata.utils.logger import ingestion_logger

logger = ingestion_logger()


class GoogleSheetsClient:
    """
    Wrapper around Google Sheets and Drive API clients
    """

    def __init__(self, sheets_service: Resource, drive_service: Resource):
        self.sheets = sheets_service
        self.drive = drive_service


def get_connection_url(connection: GoogleSheetsConnection) -> str:
    """
    Build the connection URL - Google Sheets doesn't use SQLAlchemy
    """
    return "googlesheets://localhost"


def get_connection(connection: GoogleSheetsConnection) -> GoogleSheetsClient:
    """
    Create connection to Google Sheets
    """
    scopes = connection.scopes or [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
    ]

    credentials = None

    # Handle different credential types
    if isinstance(connection.credentials.gcpConfig, GcpCredentialsPath):
        logger.info("Using service account credentials from path")
        credentials = service_account.Credentials.from_service_account_file(
            connection.credentials.gcpConfig.path, scopes=scopes
        )
    elif isinstance(connection.credentials.gcpConfig, GcpCredentialsValues):
        logger.info("Using service account credentials from values")
        info = {
            "type": connection.credentials.gcpConfig.type,
            "project_id": connection.credentials.gcpConfig.projectId,
            "private_key_id": connection.credentials.gcpConfig.privateKeyId,
            "private_key": connection.credentials.gcpConfig.privateKey.get_secret_value()
            if connection.credentials.gcpConfig.privateKey
            else None,
            "client_email": connection.credentials.gcpConfig.clientEmail,
            "client_id": connection.credentials.gcpConfig.clientId,
            "auth_uri": str(connection.credentials.gcpConfig.authUri)
            if connection.credentials.gcpConfig.authUri
            else None,
            "token_uri": str(connection.credentials.gcpConfig.tokenUri)
            if connection.credentials.gcpConfig.tokenUri
            else None,
            "auth_provider_x509_cert_url": str(
                connection.credentials.gcpConfig.authProviderX509CertUrl
            )
            if connection.credentials.gcpConfig.authProviderX509CertUrl
            else None,
            "client_x509_cert_url": str(
                connection.credentials.gcpConfig.clientX509CertUrl
            )
            if connection.credentials.gcpConfig.clientX509CertUrl
            else None,
        }
        credentials = service_account.Credentials.from_service_account_info(
            info, scopes=scopes
        )
    elif isinstance(connection.credentials.gcpConfig, GCPADCredentials):
        logger.info("Using Application Default Credentials")
        credentials, project = default(scopes=scopes)

    # Handle impersonation if configured
    if connection.credentials.gcpImpersonateServiceAccount:
        from google.auth import impersonated_credentials

        credentials = impersonated_credentials.Credentials(
            source_credentials=credentials,
            target_principal=connection.credentials.gcpImpersonateServiceAccount.impersonateServiceAccount,
            target_scopes=scopes,
            lifetime=connection.credentials.gcpImpersonateServiceAccount.lifetime,
        )

    # Build the services
    sheets_service = build("sheets", "v4", credentials=credentials)
    drive_service = build("drive", "v3", credentials=credentials)

    return GoogleSheetsClient(sheets_service, drive_service)


def test_connection(connection: GoogleSheetsConnection) -> TestConnectionResult:
    """
    Test connection to Google Sheets
    """
    test_fn = {
        "CheckAccess": check_access,
        "GetSpreadsheets": get_spreadsheets,
    }

    test_connection_steps = [
        TestConnectionStep(
            name="CheckAccess",
            mandatory=True,
            description="Check if the service account has access to Google Sheets API",
            errorMessage="Failed to access Google Sheets API. Please check credentials.",
        ),
        TestConnectionStep(
            name="GetSpreadsheets",
            mandatory=False,
            description="Get a list of spreadsheets to verify access",
            errorMessage="Failed to list spreadsheets. Please check permissions.",
        ),
    ]

    return TestConnectionStep.test_connection_steps(
        test_fn=test_fn,
        service_connection=connection,
        automation_workflow=None,
        test_connection_steps=test_connection_steps,
    )


def check_access(
    connection: GoogleSheetsConnection, _: Optional[AutomationWorkflow] = None
) -> None:
    """
    Check if we can access Google Sheets API
    """
    client = get_connection(connection)
    # Try to get spreadsheet info - this will fail if credentials are invalid
    about = client.drive.about().get(fields="user").execute()
    logger.info(
        f"Successfully authenticated as: {about.get('user', {}).get('emailAddress', 'Unknown')}"
    )


def get_spreadsheets(
    connection: GoogleSheetsConnection, _: Optional[AutomationWorkflow] = None
) -> None:
    """
    Test listing spreadsheets
    """
    client = get_connection(connection)

    # Query for Google Sheets files
    query = "mimeType='application/vnd.google-apps.spreadsheet'"

    results = (
        client.drive.files()
        .list(q=query, pageSize=10, fields="files(id, name)")
        .execute()
    )

    files = results.get("files", [])
    logger.info(f"Found {len(files)} spreadsheets")
    for file in files[:5]:  # Log first 5
        logger.info(f"  - {file['name']} (ID: {file['id']})")
