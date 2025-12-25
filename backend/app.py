# app.py
from flask import Flask, jsonify, request, session, redirect, send_from_directory
from flask_cors import CORS
from gmail_oauth import GmailOAuthManager
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

db = firestore.client()


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
        
        # Fetch and store user info
        try:
            user_info_service = build('oauth2', 'v2', credentials=creds)
            user_info = user_info_service.userinfo().get().execute()
            
            email = user_info.get('email')
            name = user_info.get('name', 'Unknown')
            picture = user_info.get('picture', '')

            # Save to Firebase
            if db:
                user_ref = db.collection('users').document(email)
                user_ref.set({
                    'email': email,
                    'name': name,
                    'picture': picture,
                    'last_seen': firestore.SERVER_TIMESTAMP,
                    'relations': {}  # Initialize empty relations on first login
                }, merge=True)
            
            # Cache in session for quick access
            session['user_info'] = {
                'email': email,
                'name': name,
                'picture': picture
            }
                
        except Exception as e:
            print(f"Error fetching/storing user info: {e}")

        return redirect("https://auag-assistant.vercel.app")
        # return redirect("http://localhost:3000")
        
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
        
        # Fetch user info from Google
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

        # 1. Search Google Contacts
        google_contacts = GmailOAuthManager.search_contacts_with_creds(creds, query)
        
        # 2. Search Saved Relations
        user_email = get_current_user_email()
        relation_contacts = []
        
        if user_email and db:
            try:
                user_ref = db.collection('users').document(user_email)
                user_doc = user_ref.get()
                
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    relations = user_data.get('relations', {})
                    
                    query_lower = query.lower()
                    
                    # Search through relations
                    for relation, emails in relations.items():
                        # Match by relation name (e.g., "manager", "professor")
                        if query_lower in relation.lower():
                            for email in emails:
                                relation_contacts.append({
                                    'name': f"{relation.capitalize()} - {email.split('@')[0]}",
                                    'email': email,
                                    'source': 'saved_relation'
                                })
                        # Match by email
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
        
        # 3. Merge results (remove duplicates, prioritize saved relations)
        all_contacts = []
        seen_emails = set()
        
        # Add saved relations first (higher priority)
        for contact in relation_contacts:
            if contact['email'] not in seen_emails:
                all_contacts.append(contact)
                seen_emails.add(contact['email'])
        
        # Add Google Contacts
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


# Add this helper function after the get_mediator() function

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
    if not user_email or not recipient_email or not relation or not db:
        return False
    
    try:
        user_ref = db.collection('users').document(user_email)
        user_doc = user_ref.get()
        
        if user_doc.exists:
            user_data = user_doc.to_dict()
            relations = user_data.get('relations', {})
            
            # Update or add the relation
            if relation not in relations:
                relations[relation] = []
            
            # Add email if not already present
            if recipient_email not in relations[relation]:
                relations[relation].append(recipient_email)
            
            # Update Firebase
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
    if not user_email or not relation or not db:
        return []
    
    try:
        user_ref = db.collection('users').document(user_email)
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


# Update the /api/email/send endpoint to save relationships

@app.route('/api/email/send', methods=['POST'])
def send_email():
    try:
        if not get_gmail_service_from_session():
            return jsonify({'success': False, 'error': 'Auth required'}), 401

        data = request.json
        to_email = data.get('to')
        subject = data.get('subject')
        body_text = data.get('body')
        thread_id = data.get('threadId')
        reply_to_id = data.get('messageId')

        service = get_gmail_service_from_session()
        
        message = MIMEText(body_text)
        message['to'] = to_email
        message['from'] = 'me'
        message['subject'] = subject
        
        # Threading logic
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
                existing_references = next((h['value'] for h in headers if h['name'] == 'References'), '')

                if rfc_message_id:
                    message['In-Reply-To'] = rfc_message_id
                    if existing_references:
                        new_references = existing_references.strip() + ' ' + rfc_message_id
                    else:
                        new_references = rfc_message_id
                    message['References'] = new_references
                    print(f"Threading headers set - In-Reply-To: {rfc_message_id}")

            except Exception as e:
                print(f"Threading error: {e}")
        
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
        body_payload = {'raw': raw_message}
        
        if thread_id:
            body_payload['threadId'] = thread_id
            print(f"Sending with threadId: {thread_id}")

        sent_message = service.users().messages().send(
            userId='me',
            body=body_payload
        ).execute()

        print(f"Message sent successfully: {sent_message['id']}")
        
        # ===== SAVE RELATIONSHIP TO DATABASE =====
        try:
            user_email = get_current_user_email()
            mediator = get_mediator()
            recipient_relation = mediator.json_state.get('recipient_relation')
            
            if user_email and recipient_relation:
                # Clean the email (remove any name prefix like "John <email@example.com>")
                clean_email = to_email
                if '<' in to_email and '>' in to_email:
                    clean_email = to_email.split('<')[1].split('>')[0].strip()
                
                save_email_relationship(user_email, clean_email, recipient_relation)
                print(f"Relationship saved: {recipient_relation} -> {clean_email}")
            else:
                print("Skipping relationship save - missing user_email or recipient_relation")
        except Exception as e:
            print(f"Error saving relationship after send: {e}")
        
        return jsonify({'success': True, 'id': sent_message['id']})

    except Exception as e:
        print(f"Send error: {e}")
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
    """Fetch recent emails from user's inbox"""
    try:
        # Get pagination parameters
        page_token = request.args.get('pageToken')
        max_results = int(request.args.get('maxResults', 20))
        
        service = get_gmail_service_from_session()
        if not service:
            return jsonify({'error': 'Not authenticated'}), 401

        # Fetch messages list
        results = service.users().messages().list(
            userId='me',
            maxResults=max_results,
            pageToken=page_token,
            labelIds=['INBOX']
        ).execute()

        messages = results.get('messages', [])
        next_page_token = results.get('nextPageToken')

        # Fetch full details for each message
        detailed_messages = []
        for msg in messages:
            try:
                message = service.users().messages().get(
                    userId='me',
                    id=msg['id'],
                    format='full'
                ).execute()

                # Extract headers
                headers = message['payload'].get('headers', [])
                subject = next((h['value'] for h in headers if h['name'].lower() == 'subject'), '(No Subject)')
                from_email = next((h['value'] for h in headers if h['name'].lower() == 'from'), 'Unknown')
                date = next((h['value'] for h in headers if h['name'].lower() == 'date'), '')
                
                # Extract body
                body = ''
                if 'parts' in message['payload']:
                    for part in message['payload']['parts']:
                        if part['mimeType'] == 'text/plain':
                            if 'data' in part['body']:
                                body = base64.urlsafe_b64decode(
                                    part['body']['data']
                                ).decode('utf-8', errors='ignore')
                                break
                elif 'body' in message['payload'] and 'data' in message['payload']['body']:
                    body = base64.urlsafe_b64decode(
                        message['payload']['body']['data']
                    ).decode('utf-8', errors='ignore')

                # Check if unread
                is_unread = 'UNREAD' in message.get('labelIds', [])

                detailed_messages.append({
                    'id': message['id'],
                    'threadId': message['threadId'],
                    'subject': subject,
                    'from': from_email,
                    'date': date,
                    'snippet': message.get('snippet', ''),
                    'body': body[:500],  # Preview only
                    'isUnread': is_unread
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

        # Extract headers
        headers = message['payload'].get('headers', [])
        subject = next((h['value'] for h in headers if h['name'].lower() == 'subject'), '(No Subject)')
        from_email = next((h['value'] for h in headers if h['name'].lower() == 'from'), 'Unknown')
        to_email = next((h['value'] for h in headers if h['name'].lower() == 'to'), '')
        date = next((h['value'] for h in headers if h['name'].lower() == 'date'), '')
        
        # Extract full body
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
                # Handle multipart/alternative nested structure
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
        
        # Prefer HTML, fallback to Plain Text
        body = body_html if body_html else body_plain
        is_html = bool(body_html)

        # Mark as read
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
                'isHtml': is_html
            }
        })

    except Exception as e:
        print(f"Message detail error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
    
@app.route('api/email/summarize', methods=['POST'])
def summarize_email_route():
    try:
        data = request.json
        text_content = data.get('text', '')

        if not text_content:
            return jsonify({'success': False, 'error': 'Missing text content'}), 400

        # Call the static function
        summary_result = EmailSummarizer.summarize(text_content)

        return jsonify({
            'success': True,
            'summary': summary_result
        })

    except Exception as e:
        print(f"API Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True, port=5001)
