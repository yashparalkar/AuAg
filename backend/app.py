from flask import Flask, jsonify, request, session, redirect, send_from_directory
from flask_cors import CORS
from gmail_oauth import GmailOAuthManager
from google.auth.transport.requests import Request
from email_summarizer import EmailSummarizer
import secrets
from email_agent_service import generate_email_from_description
from info_extractor import EmailMediator
from werkzeug.middleware.proxy_fix import ProxyFix
import os
import tempfile
from transcriber import transcribe
import base64
from email.mime.text import MIMEText
import firebase_admin
from firebase_admin import credentials, firestore
import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

from apscheduler.schedulers.background import BackgroundScheduler
from dateutil import parser
from datetime import datetime, timedelta
import time
import threading
import pytz

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from flask import send_file
import io

from google_auth_web import (
    build_flow,
    credentials_to_dict,
    get_gmail_service_from_session
)


if not firebase_admin._apps:
    if os.environ.get('FIREBASE_CREDENTIALS'):
        cred_dict = json.loads(os.environ.get('FIREBASE_CREDENTIALS'))
        cred = credentials.Certificate(cred_dict)
    else:
        cred = credentials.Certificate('firebase_credentials.json')
        
    firebase_admin.initialize_app(cred)

# Global variable to hold the client for this specific worker process
_db_client = None

def get_db():
    """Lazily initialize Firestore client to avoid gRPC fork issues"""
    global _db_client
    if _db_client is None:
        _db_client = firestore.client()
    return _db_client

scheduler = BackgroundScheduler(timezone=pytz.utc)
scheduler.start()

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
app.secret_key = os.environ["FLASK_SECRET_KEY"]
# app.secret_key =  secrets.token_hex(16)


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
        "https://auag-assistant.vercel.app"
    ],
    supports_credentials=True
)

mediators = {}


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok'})


@app.route("/auth/google/callback", methods=["GET"])
def google_callback():
    try:
        flow = build_flow()
        
        # Disable strict scope checking for openid
        os.environ['OAUTHLIB_RELAX_TOKEN_SCOPE'] = '1'
        
        flow.fetch_token(authorization_response=request.url)

        creds = flow.credentials
        session["google_creds"] = credentials_to_dict(creds)
        
        try:
            user_info_service = build('oauth2', 'v2', credentials=creds)
            user_info = user_info_service.userinfo().get().execute()
            
            email = user_info.get('email')
            name = user_info.get('name', 'Unknown')
            picture = user_info.get('picture', '')

            # Save to Firebase
            if get_db():
                user_ref = get_db().collection('users').document(email)

                doc_snap = user_ref.get()
                
                user_data = {
                    'email': email,
                    'name': name,
                    'picture': picture,
                    'last_seen': firestore.SERVER_TIMESTAMP,
                }

                if not doc_snap.exists:
                    user_data['relations'] = {} 

                user_ref.set(user_data, merge=True)
            
            # Cache in session for quick access
            session['user_info'] = {
                'email': email,
                'name': name,
                'picture': picture
            }
                
        except Exception as e:
            print(f"Error fetching/storing user info: {e}")

        return redirect("https://auag-assistant.vercel.app")
        
    except Exception as e:
        print(f"OAuth Callback Error: {e}")
        return jsonify({'error': 'Authentication failed', 'details': str(e)}), 500
    

@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    if 'google_creds' not in session:
        return jsonify({'authenticated': False})

    try:
        creds_data = session['google_creds']
        creds = Credentials(
            token=creds_data['token'],
            refresh_token=creds_data.get('refresh_token'),
            token_uri=creds_data['token_uri'],
            client_id=creds_data['client_id'],
            client_secret=creds_data['client_secret'],
            scopes=creds_data['scopes']
        )
        
        user_info_service = build('oauth2', 'v2', credentials=creds)
        user_info = user_info_service.userinfo().get().execute()
        
        email = user_info.get('email')
        name = user_info.get('name', 'Unknown')
        picture = user_info.get('picture', '')

        return jsonify({
            'authenticated': True, 
            'email': email,
            'name': name,
            'picture': picture
        })

    except Exception as e:
        print(f"Auth Status Check Error: {e}")
        session.pop('google_creds', None)
        return jsonify({'authenticated': False, 'error': str(e)})




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

        google_contacts = GmailOAuthManager.search_contacts_with_creds(creds, query)
        
        user_email = get_current_user_email()
        relation_contacts = []
        
        if user_email and get_db():
            try:
                user_ref = get_db().collection('users').document(user_email)
                user_doc = user_ref.get()
                
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    relations = user_data.get('relations', {})
                    
                    query_lower = query.lower()
                    
                    for relation, emails in relations.items():
                        if query_lower in relation.lower():
                            for email in emails:
                                relation_contacts.append({
                                    'name': f"{relation.capitalize()} - {email.split('@')[0]}",
                                    'email': email,
                                    'source': 'saved_relation'
                                })
                        else:
                            for email in emails:
                                if query_lower in email.lower():
                                    relation_contacts.append({
                                        'name': f"{relation.capitalize()} - {email.split('@')[0]}",
                                        'email': email,
                                        'source': 'saved_relation'
                                    })
                    
            except Exception as e:
                print(f"Error searching saved relations: {e}")
        
        all_contacts = []
        seen_emails = set()
        
        for contact in relation_contacts:
            if contact['email'] not in seen_emails:
                all_contacts.append(contact)
                seen_emails.add(contact['email'])
        
        for contact in google_contacts:
            if contact['email'] not in seen_emails:
                contact['source'] = 'google_contacts'
                all_contacts.append(contact)
                seen_emails.add(contact['email'])
        
        print(f"[CONTACT SEARCH] Query='{query}' | Google={len(google_contacts)} | Relations={len(relation_contacts)} | Total={len(all_contacts)}")

        return jsonify({'contacts': all_contacts})

    except Exception as e:
        print(f"[CONTACT SEARCH ERROR] Query='{query}' | Error={e}")
        return jsonify({'error': 'Failed to search contacts'}), 500


def get_current_user_email():
    """Get current user's email from session"""
    try:
        if 'google_creds' not in session:
            return None
        
        creds_data = session['google_creds']
        creds = Credentials(
            token=creds_data['token'],
            refresh_token=creds_data.get('refresh_token'),
            token_uri=creds_data['token_uri'],
            client_id=creds_data['client_id'],
            client_secret=creds_data['client_secret'],
            scopes=creds_data['scopes']
        )
        
        user_info_service = build('oauth2', 'v2', credentials=creds)
        user_info = user_info_service.userinfo().get().execute()
        return user_info.get('email')
        
    except Exception as e:
        print(f"Error fetching user email: {e}")
        return None


def save_email_relationship(user_email, recipient_email, relation):
    """Save the relationship between user and recipient to Firebase"""
    if not user_email or not recipient_email or not relation or not get_db():
        return False
    
    try:
        user_ref = get_db().collection('users').document(user_email)
        user_doc = user_ref.get()
        
        if user_doc.exists:
            user_data = user_doc.to_dict()
            relations = user_data.get('relations', {})
            
            if relation not in relations:
                relations[relation] = []
            
            if recipient_email not in relations[relation]:
                relations[relation].append(recipient_email)
            
            user_ref.update({'relations': relations})
            print(f"Saved relationship: {relation} -> {recipient_email} for user {user_email}")
            return True
        else:
            print(f"User document not found for {user_email}")
            return False
            
    except Exception as e:
        print(f"Error saving relationship: {e}")
        return False


def get_email_by_relation(user_email, relation):
    """Get list of emails for a given relation"""
    if not user_email or not relation or not get_db():
        return []
    
    try:
        user_ref = get_db().collection('users').document(user_email)
        user_doc = user_ref.get()
        
        if user_doc.exists:
            user_data = user_doc.to_dict()
            relations = user_data.get('relations', {})
            
            # Return list of emails for this relation (case-insensitive match)
            for key, emails in relations.items():
                if key.lower() == relation.lower():
                    return emails
            
            return []
        else:
            return []
            
    except Exception as e:
        print(f"Error fetching relationship: {e}")
        return []


def send_scheduled_draft_task(credentials_dict, draft_id):
    """Background task to send a scheduled draft"""
    print(f"\n{'='*80}")
    print(f"🚀🚀🚀 SCHEDULED TASK TRIGGERED 🚀🚀🚀")
    print(f"{'='*80}")
    print(f"📧 Draft ID: {draft_id}")
    print(f"⏰ Execution time: {datetime.now(pytz.UTC)}")
    
    try:
        print(f"1️⃣ Reconstructing credentials...")
        creds = Credentials(
            token=credentials_dict['token'],
            refresh_token=credentials_dict.get('refresh_token'),
            token_uri=credentials_dict.get('token_uri'),
            client_id=credentials_dict.get('client_id'),
            client_secret=credentials_dict.get('client_secret'),
            scopes=credentials_dict.get('scopes')
        )
        print(f"   ✅ Credentials OK")
        
        print(f"2️⃣ Building Gmail service...")
        service = build('gmail', 'v1', credentials=creds)
        print(f"   ✅ Service built")
        
        print(f"3️⃣ Sending draft {draft_id}...")
        sent_message = service.users().drafts().send(
            userId='me',
            body={'id': draft_id}
        ).execute()
        
        print(f"✅✅✅ SUCCESS! Email sent!")
        print(f"   Message ID: {sent_message['id']}")
        print(f"{'='*80}\n")
        return True
        
    except Exception as e:
        print(f"❌❌❌ TASK EXECUTION FAILED")
        print(f"   Error: {str(e)}")
        import traceback
        traceback.print_exc()
        print(f"{'='*80}\n")
        raise 

@app.route('/api/email/send', methods=['POST'])
def send_email():
    try:
        service = get_gmail_service_from_session()
        if not service:
            return jsonify({'success': False, 'error': 'Auth required'}), 401

        to_email = request.form.get('to')
        subject = request.form.get('subject')
        body_text = request.form.get('body')
        thread_id = request.form.get('threadId')
        reply_to_id = request.form.get('messageId')
        scheduled_time_str = request.form.get('scheduledTime')
        
        uploaded_files = request.files.getlist('attachments')
        
        message = MIMEMultipart()
        message['to'] = to_email
        message['from'] = 'me'
        message['subject'] = subject
        message.attach(MIMEText(body_text, 'html'))

        if uploaded_files:
            for file in uploaded_files:
                try:
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(file.read())
                    encoders.encode_base64(part)
                    part.add_header('Content-Disposition', f'attachment; filename="{file.filename}"')
                    message.attach(part)
                except Exception as e:
                    print(f"Error attaching file {file.filename}: {e}")

        if reply_to_id:
            try:
                original_msg = service.users().messages().get(
                    userId='me', 
                    id=reply_to_id, 
                    format='metadata', 
                    metadataHeaders=['Message-ID', 'References']
                ).execute()
                headers = original_msg.get('payload', {}).get('headers', [])
                rfc_message_id = next((h['value'] for h in headers if h['name'] == 'Message-ID'), None)
                if rfc_message_id:
                    message['In-Reply-To'] = rfc_message_id
                    message['References'] = rfc_message_id
            except Exception as e:
                print(f"Threading error: {e}")
        
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
        body_payload = {'raw': raw_message}

        if scheduled_time_str:
            try:
                draft_body = {'message': body_payload}
                
                draft = service.users().drafts().create(userId='me', body=draft_body).execute()
                draft_id = draft['id']

                run_date = parser.parse(scheduled_time_str)
                if run_date.tzinfo is None:
                    run_date = pytz.UTC.localize(run_date)
                else:
                    run_date = run_date.astimezone(pytz.UTC)

                creds = service._http.credentials
                creds_data = {
                    'token': creds.token,
                    'refresh_token': creds.refresh_token,
                    'token_uri': creds.token_uri,
                    'client_id': creds.client_id,
                    'client_secret': creds.client_secret,
                    'scopes': creds.scopes
                }

                doc_ref = get_db().collection('scheduled_emails').document()
                doc_ref.set({
                    'draft_id': draft_id,
                    'user_email': get_current_user_email(), 
                    'recipient': to_email,
                    'subject': subject,
                    'scheduled_at': run_date,
                    'status': 'pending',
                    'credentials': creds_data,
                    'created_at': datetime.now(pytz.utc)
                })
                
                print(f"✅ Scheduled email saved to DB: {doc_ref.id}")

                return jsonify({
                    'success': True, 
                    'scheduled': True, 
                    'time': scheduled_time_str,
                    'db_id': doc_ref.id
                })

            except Exception as e:
                print(f"❌ Scheduling Error: {e}")
                import traceback
                traceback.print_exc()
                return jsonify({'success': False, 'error': f"Failed to schedule: {str(e)}"}), 500

       
        
        if thread_id:
            body_payload['threadId'] = thread_id

        sent_message = service.users().messages().send(userId='me', body=body_payload).execute()
        
        try:
            user_email = get_current_user_email()
            mediator = get_mediator()
            recipient_relation = mediator.json_state.get('recipient_relation')
            if user_email and recipient_relation:
                clean_email = to_email.split('<')[1].split('>')[0].strip() if '<' in to_email else to_email
                save_email_relationship(user_email, clean_email, recipient_relation)
        except: 
            pass
        
        return jsonify({'success': True, 'id': sent_message['id']})

    except Exception as e:
        print(f"❌ Send error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500
    

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
    if mediator.json_state.get("recipient_name"):
        description += "recipient_name: " + mediator.json_state.get("recipient_name")

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
    
    name = session.get('user_info', {}).get('name', 'User')
    
    if name == 'User':
        # Fallback: fetch from database if not in session
        try:
            if 'google_creds' in session:
                creds_data = session['google_creds']
                creds = Credentials(
                    token=creds_data['token'],
                    refresh_token=creds_data.get('refresh_token'),
                    token_uri=creds_data['token_uri'],
                    client_id=creds_data['client_id'],
                    client_secret=creds_data['client_secret'],
                    scopes=creds_data['scopes']
                )
                
                user_info_service = build('oauth2', 'v2', credentials=creds)
                user_info = user_info_service.userinfo().get().execute()
                email = user_info.get('email')
                name = user_info.get('name', 'User')
                
                # Cache in session for future requests
                session['user_info'] = {
                    'email': email,
                    'name': name
                }
        except Exception as e:
            print(f"Error fetching user name: {e}")
    
    state = mediator.advance(user_input + f" sender_name: {name}")   # <-- Pass sender's name to mediator, fetched from the DB
    print(f"[MEDIATOR ADVANCE] Input='{user_input}' | New State={state}")
    
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



@app.route('/api/inbox/messages', methods=['GET'])
def get_inbox_messages():
    """Fetch recent emails from user's inbox, sent folder, OR SEARCH RESULTS"""
    try:
        page_token = request.args.get('pageToken')
        max_results = int(request.args.get('maxResults', 20))
        label_id = request.args.get('label', 'INBOX').upper()
        
        query = request.args.get('q') 
        
        service = get_gmail_service_from_session()
        if not service:
            return jsonify({'error': 'Not authenticated'}), 401

        if query:
            # If searching, use the 'q' parameter
            # We don't restrict by labelIds when searching (usually user wants to search all mail)
            results = service.users().messages().list(
                userId='me',
                maxResults=max_results,
                pageToken=page_token,
                q=query  # Pass the search query to Gmail
            ).execute()
        else:
            results = service.users().messages().list(
                userId='me',
                maxResults=max_results,
                pageToken=page_token,
                labelIds=[label_id]
            ).execute()

        messages = results.get('messages', [])
        next_page_token = results.get('nextPageToken')
        
        detailed_messages = []
        for msg in messages:
            try:
                message = service.users().messages().get(
                    userId='me',
                    id=msg['id'],
                    format='full'
                ).execute()

                headers = message['payload'].get('headers', [])
                subject = next((h['value'] for h in headers if h['name'].lower() == 'subject'), '(No Subject)')
                from_email = next((h['value'] for h in headers if h['name'].lower() == 'from'), 'Unknown')
                to_email = next((h['value'] for h in headers if h['name'].lower() == 'to'), 'Unknown')
                date = next((h['value'] for h in headers if h['name'].lower() == 'date'), '')
                
                body = ''
                if 'parts' in message['payload']:
                    for part in message['payload']['parts']:
                        if part['mimeType'] == 'text/plain' and 'body' in part and 'data' in part['body']:
                            body = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8', errors='ignore')
                            break
                elif 'body' in message['payload'] and 'data' in message['payload']['body']:
                    body = base64.urlsafe_b64decode(message['payload']['body']['data']).decode('utf-8', errors='ignore')

                is_unread = 'UNREAD' in message.get('labelIds', [])
        
                # Extract attachments for inbox list
                attachments = extract_attachments(message['payload'])

                detailed_messages.append({
                    'id': message['id'],
                    'threadId': message['threadId'],
                    'subject': subject,
                    'from': from_email,
                    'to': to_email,
                    'date': date,
                    'snippet': message.get('snippet', ''),
                    'body': body[:500],
                    'isUnread': is_unread,
                    'attachments': attachments  # ADD THIS LINE
                })

            except Exception as e:
                print(f"Error fetching message {msg['id']}: {e}")
                continue

        return jsonify({
            'success': True,
            'messages': detailed_messages,
            'nextPageToken': next_page_token
        })

    except Exception as e:
        print(f"Inbox fetch error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    

def extract_attachments(payload):
    """Extract attachment metadata from message payload"""
    if not payload:
        print("DEBUG: No payload provided")
        return []
    
    attachments = []
    
    def traverse(parts):
        if not parts:
            return
        for part in parts:
            filename = part.get('filename')
            body = part.get('body', {})
            attachment_id = body.get('attachmentId')
            
            print(f"DEBUG traverse: filename={filename}, has_attachmentId={bool(attachment_id)}, mimeType={part.get('mimeType')}")
            
            if filename and attachment_id:
                att = {
                    'filename': filename,
                    'mimeType': part.get('mimeType'),
                    'size': body.get('size', 0),
                    'attachmentId': attachment_id
                }
                print(f"DEBUG: Found attachment: {att}")
                attachments.append(att)
            
            if part.get('parts'):
                traverse(part['parts'])
    
    if payload.get('parts'):
        print(f"DEBUG: Payload has {len(payload.get('parts'))} parts")
        traverse(payload['parts'])
    else:
        print("DEBUG: Payload has no parts")
    
    print(f"DEBUG: Total attachments extracted: {len(attachments)}")
    return attachments

@app.route('/api/scheduled/messages', methods=['GET'])
def get_scheduled_messages():
    """Fetch pending scheduled emails from Firestore"""
    try:
        user_email = get_current_user_email()
        if not user_email:
            return jsonify({'success': False, 'error': 'Auth required'}), 401

        # Query Firestore for pending emails for this user
        docs_stream = get_db().collection('scheduled_emails')\
            .where('user_email', '==', user_email)\
            .where('status', '==', 'pending')\
            .stream()

        scheduled_messages = []
        for doc in docs_stream:
            data = doc.to_dict()
            
            scheduled_at = data.get('scheduled_at')
            if hasattr(scheduled_at, 'isoformat'):
                scheduled_at = scheduled_at.isoformat()
            
            scheduled_messages.append({
                'id': doc.id, # Firestore ID
                'draft_id': data.get('draft_id'),
                'subject': data.get('subject', '(No Subject)'),
                'from': user_email,
                'to': data.get('recipient'),
                'date': scheduled_at, # Using scheduled time as the date
                'snippet': 'Scheduled for delivery...', # Placeholder
                'isUnread': False,
                'isScheduled': True # Flag for frontend
            })

        scheduled_messages.sort(key=lambda x: x['date'])

        return jsonify({
            'success': True,
            'messages': scheduled_messages,
            'nextPageToken': None
        })

    except Exception as e:
        print(f"Scheduled fetch error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/inbox/message/<message_id>', methods=['GET'])
def get_message_detail(message_id):
    """Fetch full message details"""
    try:
        service = get_gmail_service_from_session()
        if not service:
            return jsonify({'error': 'Not authenticated'}), 401

        message = service.users().messages().get(
            userId='me',
            id=message_id,
            format='full'
        ).execute()

        headers = message['payload'].get('headers', [])
        subject = next((h['value'] for h in headers if h['name'].lower() == 'subject'), '(No Subject)')
        from_email = next((h['value'] for h in headers if h['name'].lower() == 'from'), 'Unknown')
        to_email = next((h['value'] for h in headers if h['name'].lower() == 'to'), '')
        date = next((h['value'] for h in headers if h['name'].lower() == 'date'), '')
        
        body = ''
        body_html = ''
        body_plain = ''
        
        if 'parts' in message['payload']:
            for part in message['payload']['parts']:
                if part['mimeType'] == 'text/plain' and 'data' in part['body']:
                    body_plain = base64.urlsafe_b64decode(
                        part['body']['data']
                    ).decode('utf-8', errors='ignore')
                elif part['mimeType'] == 'text/html' and 'data' in part['body']:
                    body_html = base64.urlsafe_b64decode(
                        part['body']['data']
                    ).decode('utf-8', errors='ignore')

                elif part['mimeType'].startswith('multipart/') and 'parts' in part:
                    for subpart in part['parts']:
                        if subpart['mimeType'] == 'text/plain' and 'data' in subpart['body']:
                            body_plain = base64.urlsafe_b64decode(
                                subpart['body']['data']
                            ).decode('utf-8', errors='ignore')
                        elif subpart['mimeType'] == 'text/html' and 'data' in subpart['body']:
                            body_html = base64.urlsafe_b64decode(
                                subpart['body']['data']
                            ).decode('utf-8', errors='ignore')
        elif 'body' in message['payload'] and 'data' in message['payload']['body']:
            content = base64.urlsafe_b64decode(
                message['payload']['body']['data']
            ).decode('utf-8', errors='ignore')
            
            if message['payload']['mimeType'] == 'text/html':
                body_html = content
            else:
                body_plain = content
        
        body = body_html if body_html else body_plain
        is_html = bool(body_html)

        # Extract attachments
        # Extract attachments
        attachments = extract_attachments(message['payload'])
        
        # DEBUG LOGGING
        print(f"\n{'='*60}")
        print(f"DEBUG: Message ID: {message_id}")
        print(f"DEBUG: Attachments found: {len(attachments)}")
        print(f"DEBUG: Attachment details: {attachments}")
        print(f"DEBUG: Payload keys: {message['payload'].keys()}")
        if 'parts' in message['payload']:
            print(f"DEBUG: Number of parts: {len(message['payload']['parts'])}")
            for i, part in enumerate(message['payload']['parts']):
                print(f"DEBUG: Part {i}: mimeType={part.get('mimeType')}, filename={part.get('filename')}, has_attachmentId={bool(part.get('body', {}).get('attachmentId'))}")
        print(f"{'='*60}\n")
        
        service.users().messages().modify(
            userId='me',
            id=message_id,
            body={'removeLabelIds': ['UNREAD']}
        ).execute()

        return jsonify({
            'success': True,
            'message': {
                'id': message['id'],
                'threadId': message['threadId'],
                'subject': subject,
                'from': from_email,
                'to': to_email,
                'date': date,
                'body': body,
                'isHtml': is_html,
                'attachments': attachments
            }
        })

    except Exception as e:
        print(f"Message detail error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
    


summarizer_service = EmailSummarizer()
@app.route('/api/email/summarize', methods=['POST', 'OPTIONS'])
def summarize_email_route():
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200

    try:
        data = request.get_json(force=True, silent=True) 
        
        if not data:
            return jsonify({'success': False, 'error': 'No JSON data received'}), 400

        text_content = data.get('text', '')
        
        if not text_content:
            return jsonify({'success': False, 'error': 'Missing text'}), 400

        summary_result = summarizer_service.summarize(text_content)

        return jsonify({
            'success': True,
            'summary': summary_result
        })

    except Exception as e:
        print(f"API Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    


@app.route('/api/email/attachment', methods=['GET'])
def download_attachment():
    if not get_gmail_service_from_session():
        return jsonify({'error': 'Auth required'}), 401

    message_id = request.args.get('messageId')
    attachment_id = request.args.get('attachmentId')
    filename = request.args.get('filename', 'download')

    if not message_id or not attachment_id:
        return jsonify({'error': 'Missing parameters'}), 400

    try:
        service = get_gmail_service_from_session()
        
        attachment = service.users().messages().attachments().get(
            userId='me', 
            messageId=message_id, 
            id=attachment_id
        ).execute()

        file_data = base64.urlsafe_b64decode(attachment['data'].encode('UTF-8'))
        
        return send_file(
            io.BytesIO(file_data),
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        print(f"Attachment error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/scheduler/status', methods=['GET'])
def scheduler_status():
    try:
        jobs = scheduler.get_jobs()
        return jsonify({
            'running': scheduler.running,
            'jobs_count': len(jobs),
            'jobs': [{
                'id': job.id,
                'next_run': str(job.next_run_time),
                'func': job.func.__name__
            } for job in jobs]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    



def run_schedule_checker():
    """Continuously checks Firestore for due emails"""
    print("🔄🔄🔄 Scheduler Worker Started 🔄🔄🔄")
    print(f"⏰ Starting at: {datetime.now(pytz.utc)}")
    
    while True:
        try:
            now_utc = datetime.now(pytz.utc)
            print(f"\n{'='*60}")
            print(f"🔍 Checking for due emails at {now_utc}")
            
            docs_stream = get_db().collection('scheduled_emails')\
                .where('status', '==', 'pending')\
                .stream()
            
            pending_emails = []
            for doc in docs_stream:
                data = doc.to_dict()
                scheduled_at = data.get('scheduled_at')
                
                if scheduled_at and scheduled_at <= now_utc:
                    pending_emails.append(doc)
            
            if len(pending_emails) > 0:
                print(f"🔎 Found {len(pending_emails)} due email(s) in database!")
            else:
                print(f"✓ No due emails at this time")
                print(f"{'='*60}\n")
                time.sleep(60)
                continue
            
            for doc in pending_emails:
                data = doc.to_dict()
                email_id = doc.id
                
                print(f"\n📧 Processing email: {email_id}")
                print(f"   Scheduled for: {data.get('scheduled_at')}")
                print(f"   Draft ID: {data.get('draft_id')}")
                
                try:
                    creds_data = data.get('credentials')
                    if not creds_data:
                        raise Exception("No credentials found in document")
                    
                    print(f"   1️⃣ Reconstructing credentials...")
                    creds = Credentials(
                        token=creds_data['token'],
                        refresh_token=creds_data.get('refresh_token'),
                        token_uri=creds_data['token_uri'],
                        client_id=creds_data['client_id'],
                        client_secret=creds_data['client_secret'],
                        scopes=creds_data['scopes']
                    )
                    
                    print(f"   2️⃣ Building Gmail service...")
                    service = build('gmail', 'v1', credentials=creds)
                    
                    draft_id = data.get('draft_id')
                    if not draft_id:
                        raise Exception("No draft_id found in document")
                    
                    print(f"   3️⃣ Sending draft {draft_id}...")
                    sent_msg = service.users().drafts().send(
                        userId='me', 
                        body={'id': draft_id}
                    ).execute()
                    
                    print(f"   4️⃣ Updating status to 'sent'...")
                    get_db().collection('scheduled_emails').document(email_id).update({
                        'status': 'sent',
                        'sent_at': datetime.now(pytz.utc),
                        'message_id': sent_msg['id']
                    })
                    
                    print(f"   ✅✅✅ Email {email_id} sent successfully!")
                    print(f"   Message ID: {sent_msg['id']}")
                    
                except Exception as e:
                    print(f"   ❌ Failed to send {email_id}:")
                    print(f"   Error: {str(e)}")
                    import traceback
                    traceback.print_exc()
                    
                    # Mark as failed
                    try:
                        get_db().collection('scheduled_emails').document(email_id).update({
                            'status': 'failed',
                            'error': str(e),
                            'failed_at': datetime.now(pytz.utc)
                        })
                        print(f"   Marked as failed in database")
                    except Exception as update_error:
                        print(f"   ⚠️ Couldn't update status: {update_error}")
            
            print(f"{'='*60}\n")
            
            print(f"😴 Sleeping for 60 seconds...")
            time.sleep(60)
            
        except Exception as e:
            print(f"\n⚠️⚠️⚠️ Scheduler Loop Error: {e}")
            import traceback
            traceback.print_exc()
            print(f"😴 Sleeping for 60 seconds after error...\n")
            time.sleep(60)


print("🚀 Initializing scheduler thread...")

scheduler_thread = threading.Thread(
    target=run_schedule_checker, 
    daemon=True,
    name="EmailSchedulerThread"
)
scheduler_thread.start()

print(f"✅ Scheduler thread started: {scheduler_thread.is_alive()}")

@app.route('/api/scheduler/health', methods=['GET'])
def scheduler_health():
    return jsonify({
        'thread_alive': scheduler_thread.is_alive(),
        'thread_name': scheduler_thread.name,
        'current_time_utc': str(datetime.now(pytz.utc))
    })

@app.route("/api/health")
def health():
    return {"status": "ok"}, 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5001)