import os
import json
from flask import redirect, request, session, url_for
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

SCOPES = [
    'openid',
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/contacts.readonly",
    "https://www.googleapis.com/auth/contacts.other.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

CLIENT_SECRETS_FILE = "credentials.json"


# ----------------------------------------------------------------------
# Internal helper (new, private)
# ----------------------------------------------------------------------
def _load_client_config():
    """
    Load OAuth client config.

    Priority:
    1. GOOGLE_OAUTH_CREDENTIALS env var (production)
    2. credentials.json (local dev fallback)
    """
    credentials_env = os.getenv("GOOGLE_OAUTH_CREDENTIALS")
    if credentials_env:
        return json.loads(credentials_env)

    if os.path.exists(CLIENT_SECRETS_FILE):
        with open(CLIENT_SECRETS_FILE, "r") as f:
            return json.load(f)

    raise RuntimeError("OAuth client credentials not found")


# ----------------------------------------------------------------------
# build_flow (name preserved)
# ----------------------------------------------------------------------
def build_flow():
    """
    Build OAuth flow suitable for cloud deployment.
    """
    client_config = _load_client_config()

    return Flow.from_client_config(
        client_config=client_config,
        scopes=SCOPES,
        redirect_uri=url_for(
            "google_callback",
            _external=True,
            _scheme="https"
        )
    )


# ----------------------------------------------------------------------
# credentials_to_dict (unchanged behavior)
# ----------------------------------------------------------------------
def credentials_to_dict(creds):
    return {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": creds.scopes,
    }


# ----------------------------------------------------------------------
# get_gmail_service_from_session (name preserved)
# ----------------------------------------------------------------------
def get_gmail_service_from_session():
    """
    Build Gmail service from credentials stored in Flask session.
    """
    if "google_creds" not in session:
        return None

    creds = Credentials(**session["google_creds"])
    return build("gmail", "v1", credentials=creds)
