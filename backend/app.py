# app.py
from flask import Flask, jsonify, request, session, redirect, send_from_directory
from flask_cors import CORS
from gmail_oauth import GmailOAuthManager
import secrets
from email_agent_service import generate_email_from_description
from info_extractor import EmailMediator
from werkzeug.middleware.proxy_fix import ProxyFix
import os
import tempfile
from transcriber import transcribe

from google_auth_web import (
    build_flow,
    credentials_to_dict,
    get_gmail_service_from_session
)


# BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# FRONTEND_BUILD_DIR = os.path.join(BASE_DIR, "frontend", "build")

# app = Flask(
#     __name__,
#     static_folder=os.path.join(FRONTEND_BUILD_DIR, "static"),
#     static_url_path="/static"
# )

# @app.route("/", defaults={"path": ""})
# @app.route("/<path:path>")
# def serve_react_app(path):
#     if path.startswith("api"):
#         return jsonify({"error": "Not found"}), 404

#     return send_from_directory(FRONTEND_BUILD_DIR, "index.html")
app = Flask(__name__)
app.secret_key = secrets.token_hex(16)

app.config.update(
    SESSION_COOKIE_SAMESITE="None",
    SESSION_COOKIE_SECURE=True
)


app.wsgi_app = ProxyFix(
    app.wsgi_app,
    x_proto=1,
    x_host=1
)


# Configure CORS properly
# CORS(
#     app,
#     origins=[
#         "http://localhost:3000", 
#         "http://192.168.0.102:3000"
#         ],
#     supports_credentials=True
# )

CORS(
    app,
    origins=[
        "http://localhost:3000",
        "https://yourdomain.com",
        "https://auag-assistant.vercel.app"
    ],
    supports_credentials=True
)


gmail_manager = None
gmail_managers = {}

mediators = {}


def get_gmail_manager():
    global gmail_manager

    if gmail_manager is None:
        gmail_manager = GmailOAuthManager(token_file="token.json")
        gmail_manager.authenticate()

    return gmail_manager


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok'})


@app.route("/api/auth/status")
def auth_status():
    authenticated = "google_creds" in session
    email = None

    if authenticated:
        service = get_gmail_service_from_session()
        profile = service.users().getProfile(userId="me").execute()
        email = profile.get("emailAddress")

    return jsonify({
        "authenticated": authenticated,
        "email": email
    })


@app.route("/auth/google/callback", methods=["GET"])
def google_callback():
    flow = build_flow()
    flow.fetch_token(authorization_response=request.url)

    creds = flow.credentials
    session["google_creds"] = credentials_to_dict(creds)

    return redirect("https://auag-assistant.vercel.app")




@app.route("/api/auth/google/login")
def google_login():
    flow = build_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent"
    )
    session["oauth_state"] = state
    return redirect(auth_url)


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True})


@app.route('/api/contacts/search', methods=['GET'])
def search_contacts():
    try:
        query = request.args.get('q', '').strip()

        if len(query) < 2:
            return jsonify({'contacts': []})

        service = get_gmail_service_from_session()
        if not service:
            return jsonify({'error': 'Not authenticated'}), 401

        creds = service._http.credentials

        contacts = GmailOAuthManager.search_contacts_with_creds(creds, query)

        print(f"[CONTACT SEARCH] Query='{query}' | Results={len(contacts)}")
        for c in contacts:
            print(f"  - {c['name']} <{c['email']}>")

        return jsonify({'contacts': contacts})

    except Exception as e:
        print(f"[CONTACT SEARCH ERROR] Query='{query}' | Error={e}")
        return jsonify({'error': 'Failed to search contacts'}), 500


@app.route('/api/email/send', methods=['POST'])
def send_email():
    """Send an email"""
    try:
        data = request.json
        to = data.get('to')
        subject = data.get('subject')
        body = data.get('body', '')
        
        if not to or not subject:
            return jsonify({
                'success': False,
                'error': 'Missing required fields: to, subject'
            }), 400
        gmail = get_gmail_manager()

        if not gmail.creds or not gmail.creds.valid:
            return jsonify({
                'success': False,
                'error': 'Not authenticated'
            }), 401
        
        message_id = gmail.send_email(to, subject, body)
        
        if message_id:
            return jsonify({
                'success': True,
                'message_id': message_id
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to send email'
            }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
    


def get_mediator():
    session_id = session.get('session_id')
    if not session_id:
        session_id = secrets.token_hex(16)
        session['session_id'] = session_id

    if session_id not in mediators:
        mediators[session_id] = EmailMediator()

    return mediators[session_id]


@app.route('/api/compose/context', methods=['GET'])
def compose_context():
    mediator = get_mediator()
    state = mediator.json_state

    return jsonify({
        "recipient_name": state.get("recipient_name"),
        "recipient_option_index": state.get("recipient_options"),
        "description": state.get("description")
    })


@app.route('/api/email/generate', methods=['POST'])
def generate_email():
    mediator = get_mediator()
    description = mediator.json_state.get("description")
    revision = mediator.json_state.get("mail_revision") if mediator.json_state.get("mail_revision") else None

    if not description:
        return jsonify({
            "success": False,
            "error": "Description not ready"
        }), 400

    if revision:
        description += f"\n\nPlease revise the email as follows:\n{revision}"
    email_data = generate_email_from_description(description)

    return jsonify({
        "success": True,
        "subject": email_data["subject"],
        "body": email_data["body"]
    })

@app.route('/api/mediator/advance', methods=['POST'])
def advance_mediator():
    mediator = get_mediator()
    user_input = request.json.get('input')

    if not user_input:
        return jsonify({'success': False, 'error': 'Missing input'}), 400

    state = mediator.advance(user_input)

    return jsonify({
        'success': True,
        'state': state
    })

@app.route('/api/mediator/state', methods=['GET'])
def mediator_state():
    mediator = get_mediator()
    return jsonify(mediator.json_state)


@app.route("/api/audio/transcribe", methods=["POST"])
def transcribe_audio():
    if "audio" not in request.files:
        return jsonify({"success": False, "error": "No audio file"}), 400

    audio_file = request.files["audio"]

    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        audio_file.save(tmp.name)
        audio_path = tmp.name

    try:
        text = transcribe(audio_path)
        return jsonify({ "success": True, "text": text })
    finally:
        os.remove(audio_path)



if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5001)
