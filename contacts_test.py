import os.path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# Scopes for both "My Contacts" and "Other Contacts"
SCOPES = [
    "https://www.googleapis.com/auth/contacts.readonly",
    "https://www.googleapis.com/auth/contacts.other.readonly"
]

def get_my_connections(service):
    """Fetches standard 'My Contacts' with pagination."""
    all_people = []
    page_token = None
    
    print("Fetching 'My Contacts'...")
    # while True:
    results = service.people().connections().list(
        resourceName="people/me",
        pageSize=1000,
        personFields="names,emailAddresses",
        pageToken=page_token
    ).execute()
    
    all_people.extend(results.get("connections", []))
    page_token = results.get("nextPageToken")
    # if not page_token:
    #     break
            
    return all_people

def get_other_contacts(service):
    """Fetches 'Other Contacts' (auto-saved from Gmail) with pagination."""
    all_other = []
    page_token = None

    print("Fetching 'Other Contacts'...")
    while True:
        results = service.otherContacts().list(
            pageSize=1000,
            readMask="names,emailAddresses",
            pageToken=page_token
        ).execute()
        
        all_other.extend(results.get("otherContacts", []))
        page_token = results.get("nextPageToken")
        if not page_token:
            break
            
    return all_other

def main():
    creds = None
    if os.path.exists("token.json"):
        creds = Credentials.from_authorized_user_file("token.json", SCOPES)
        
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            # Delete token.json if you get scope errors to force re-login
            flow = InstalledAppFlow.from_client_secrets_file(
                "credentials.json", SCOPES
            )
            creds = flow.run_local_server(port=0)
        with open("token.json", "w") as token:
            token.write(creds.to_json())

    try:
        service = build("people", "v1", credentials=creds)

        # 1. Fetch from BOTH sources
        my_contacts = get_my_connections(service)
        other_contacts = get_other_contacts(service)
        all_contacts = my_contacts + other_contacts
        
        print(f"Total contacts fetched: {len(all_contacts)}")

        # 2. Filter Logic
        partial_name_filter = "pr" 
        found_contacts = []

        print(f"Searching for '{partial_name_filter}'...")

        for person in all_contacts:
            names = person.get("names", [])
            
            # Skip if no name exists at all
            if not names:
                continue
                
            display_name = names[0].get("displayName")
            
            if display_name and partial_name_filter.lower() in display_name.lower():
                # --- Extract Emails ---
                email_list = person.get("emailAddresses", [])
                if email_list:
                    # Join multiple emails with a comma if they exist
                    emails_str = ", ".join([e.get("value") for e in email_list if e.get("value")])
                else:
                    emails_str = "<none>"
                
                found_contacts.append((display_name, emails_str))

        # 3. Print Results (Formatted)
        if found_contacts:
            print(f"\nFound {len(found_contacts)} matches:")
            # Simple header
            print(f"{'NAME':<40} {'EMAIL'}") 
            print("-" * 60)
            
            for name, email in found_contacts:
                print(f"{name:<40} {email}")
        else:
            print(f"\nNo contacts found matching '{partial_name_filter}'.")

    except HttpError as err:
        print(f"An error occurred: {err}")

if __name__ == "__main__":
    main()

# import os
# import pickle
# import email.utils
# from google.auth.transport.requests import Request
# from google_auth_oauthlib.flow import InstalledAppFlow
# from googleapiclient.discovery import build

# # SCOPES needed for this demo
# SCOPES = [
#     'https://www.googleapis.com/auth/gmail.readonly',        # To scan inbox headers
#     'https://www.googleapis.com/auth/contacts.readonly',     # To search saved contacts
#     'https://www.googleapis.com/auth/contacts.other.readonly' # To search "sent to" history
# ]

# def get_services():
#     """Authenticates and returns Gmail and People services."""
#     creds = None
#     if os.path.exists('token_demo.pickle'):
#         with open('token_demo.pickle', 'rb') as token:
#             creds = pickle.load(token)
            
#     if not creds or not creds.valid:
#         if creds and creds.expired and creds.refresh_token:
#             creds.refresh(Request())
#         else:
#             flow = InstalledAppFlow.from_client_secrets_file(
#                 'credentials.json', SCOPES)
#             creds = flow.run_local_server(port=0)
        
#         with open('token_demo.pickle', 'wb') as token:
#             pickle.dump(creds, token)

#     gmail_service = build('gmail', 'v1', credentials=creds)
#     people_service = build('people', 'v1', credentials=creds)
#     return gmail_service, people_service

# def scan_recent_inbox(service, limit=20):
#     """Fetches the last 'limit' emails and extracts unique senders."""
#     print(f"\n--- Scanning last {limit} emails in Inbox ---")
#     results = []
#     seen = set()
    
#     try:
#         # 1. Get list of message IDs
#         response = service.users().messages().list(
#             userId='me', maxResults=limit, q='category:primary'
#         ).execute()
#         messages = response.get('messages', [])

#         if not messages:
#             print("No messages found.")
#             return []

#         # 2. Fetch details for each message
#         print(f"Processing {len(messages)} messages...", end='', flush=True)
#         for msg in messages:
#             # We only fetch the 'From' header to keep it fast
#             msg_detail = service.users().messages().get(
#                 userId='me', id=msg['id'], format='metadata', 
#                 metadataHeaders=['From']
#             ).execute()
            
#             headers = msg_detail.get('payload', {}).get('headers', [])
#             for h in headers:
#                 if h['name'] == 'From':
#                     # Parses "Name <email@domain.com>" cleanly
#                     name, addr = email.utils.parseaddr(h['value'])
#                     if addr and addr not in seen:
#                         results.append({'name': name or addr, 'email': addr})
#                         seen.add(addr)
#                         print(".", end='', flush=True)
#         print(" Done.")
#         return results

#     except Exception as e:
#         print(f"\nError scanning inbox: {e}")
#         return []

# def search_api_contacts(people_service, query):
#     """Searches Google's 'Other' and 'Saved' contacts API."""
#     print(f"\n--- Searching API for '{query}' ---")
#     results = []
#     seen = set()
    
#     def add_result(person, source):
#         names = person.get('names', [])
#         emails = person.get('emailAddresses', [])
#         if emails:
#             email_val = emails[0].get('value')
#             name_val = names[0].get('displayName') if names else email_val
            
#             if email_val not in seen:
#                 results.append({'name': name_val, 'email': email_val, 'source': source})
#                 seen.add(email_val)

#     try:
#         # 1. Search "Other Contacts" (Auto-complete list)
#         other_res = people_service.otherContacts().search(
#             query=query, readMask='names,emailAddresses'
#         ).execute()
#         if 'otherContacts' in other_res:
#             for p in other_res['otherContacts']:
#                 add_result(p, 'Suggested')

#         # 2. Search "Saved Contacts" (Directory)
#         saved_res = people_service.people().searchContacts(
#             query=query, readMask='names,emailAddresses'
#         ).execute()
#         if 'results' in saved_res:
#             for p in saved_res['results']:
#                 add_result(p.get('person', {}), 'Saved')
                
#     except Exception as e:
#         print(f"API Search Error: {e}")

#     return results

# def main():
#     if not os.path.exists('credentials.json'):
#         print("ERROR: credentials.json not found in this folder.")
#         return

#     print("Authenticating...")
#     gmail_srv, people_srv = get_services()
#     print("Authentication successful.")

#     # TEST 1: Scan Inbox (Who emailed you recently?)
#     recent_senders = scan_recent_inbox(gmail_srv, limit=20)
#     print("\n[Recent Inbox Senders]:")
#     for i, contact in enumerate(recent_senders[:10], 1): # Show top 10
#         print(f" {i}. {contact['name']} <{contact['email']}>")

#     # TEST 2: Search API (Who have you emailed?)
#     while True:
#         q = input("\nEnter name to search (or 'q' to quit): ")
#         if q.lower() == 'q': break
        
#         api_results = search_api_contacts(people_srv, q)
        
#         print(f"\nFound {len(api_results)} matches:")
#         for res in api_results:
#             print(f" - [{res['source']}] {res['name']} <{res['email']}>")

# if __name__ == '__main__':
#     main()