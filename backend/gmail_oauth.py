# gmail_oauth.py
import os
import json
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from email.mime.text import MIMEText
import base64

SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/contacts.readonly",
    "https://www.googleapis.com/auth/contacts.other.readonly",
]


class GmailOAuthManager:
    def __init__(self, credentials_file='credentials.json', token_file='token.json'):
        """
        Initialize Gmail OAuth Manager
        
        Args:
            credentials_file: Path to OAuth 2.0 credentials JSON from Google Cloud Console
            token_file: Path to save the token for persistence
        """
        self.credentials_file = credentials_file
        self.token_file = token_file
        self.creds = None
        self.service = None
        
    def authenticate(self):
        if os.path.exists("token.json"):
            print("Loading credentials from token file...")
            self.creds = Credentials.from_authorized_user_file(self.token_file, SCOPES)
        else:
            print("No token file found, need to authenticate.")
        
        # If there are no (valid) credentials available, let the user log in.
        if not self.creds or not self.creds.valid:
            print("No valid credentials available, initiating OAuth flow...")
            if self.creds and self.creds.expired and self.creds.refresh_token:
                # Refresh expired credentials
                self.creds.refresh(Request())
            else:
                # Run OAuth flow
                flow = InstalledAppFlow.from_client_secrets_file(
                    self.credentials_file, SCOPES)
                self.creds = flow.run_local_server(port=0)
            
            # Save the credentials for the next run
            with open(self.token_file, 'w') as token:
                token.write(self.creds.to_json())
        
        # Build Gmail service
        self.service = build('gmail', 'v1', credentials=self.creds)
        return True
    
    def get_user_email(self):
        """Get the authenticated user's email address"""
        try:
            profile = self.service.users().getProfile(userId='me').execute()
            return profile['emailAddress']
        except Exception as e:
            print(f"Error getting user email: {e}")
            return None
    

    def search_contacts_with_creds(creds, query):
        try:
            people_service = build('people', 'v1', credentials=creds)

            all_contacts = []
            page_token = None

            while True:
                results = people_service.otherContacts().list(
                    pageSize=1000,
                    readMask="names,emailAddresses",
                    pageToken=page_token
                ).execute()

                all_contacts.extend(results.get('otherContacts', []))
                page_token = results.get("nextPageToken")
                if not page_token:
                    break

            found_contacts = []
            query_lower = query.lower()

            for person in all_contacts:
                names = person.get('names', [])
                emails = person.get('emailAddresses', [])

                if not names or not emails:
                    continue

                display_name = names[0].get('displayName', '')

                for email_obj in emails:
                    email_value = email_obj.get('value', '')
                    if query_lower in display_name.lower() or query_lower in email_value.lower():
                        found_contacts.append({
                            'name': display_name,
                            'email': email_value
                        })
                        break

            print(f"Found {len(found_contacts)} contacts matching '{query}'")
            return found_contacts

        except Exception as e:
            print(f"Error searching contacts: {e}")
            return []

    
    def create_message(self, to, subject, body):
        message = MIMEText(body)
        message['to'] = to
        message['subject'] = subject
        
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
        return {'raw': raw_message}
    
    def send_email(self, to, subject, body):
        """
        Send an email using Gmail API
        
        Args:
            to: Recipient email address
            subject: Email subject
            body: Email body
            
        Returns:
            Message ID if successful, None otherwise
        """
        try:
            message = self.create_message(to, subject, body)
            sent_message = self.service.users().messages().send(
                userId='me',
                body=message
            ).execute()
            
            print(f"Email sent! Message ID: {sent_message['id']}")
            return sent_message['id']
        except Exception as e:
            print(f"Error sending email: {e}")
            return None
    
    def logout(self):
        """Remove saved credentials (logout)"""
        if os.path.exists(self.token_file):
            os.remove(self.token_file)
            print("Logged out successfully")


# Example usage
def main():
    # Initialize OAuth manager
    gmail = GmailOAuthManager()
    
    # Authenticate (will open browser for first-time auth or auto-login if token exists)
    print("Authenticating with Google...")
    if gmail.authenticate():
        print("✓ Authentication successful!")
        
        # Get user email
        user_email = gmail.get_user_email()
        print(f"Logged in as: {user_email}")
        
        # Example: Search for contacts
        search_query = input("\nEnter name to search: ")
        contacts = gmail.search_contacts(search_query)
        
        if contacts:
            print(f"\nFound {len(contacts)} contacts:")
            for i, contact in enumerate(contacts, 1):
                print(f"{i}. {contact['name']} <{contact['email']}>")
        else:
            print("No contacts found.")
        
        # Example: Send an email
        print("\n--- Compose Email ---")
        to = input("To: ")
        subject = input("Subject: ")
        print("Body (press Ctrl+D when done):")
        body_lines = []
        try:
            while True:
                line = input()
                body_lines.append(line)
        except EOFError:
            pass
        body = '\n'.join(body_lines)
        
        confirm = input("\nSend email? (y/n): ")
        if confirm.lower() == 'y':
            message_id = gmail.send_email(to, subject, body)
            if message_id:
                print("✓ Email sent successfully!")
        
    else:
        print("✗ Authentication failed")


if __name__ == "__main__":
    main()