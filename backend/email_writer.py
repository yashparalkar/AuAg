from openai import OpenAI
import json
import sys
from dotenv import load_dotenv
import os       

load_dotenv()

class EmailWriter:
    def __init__(self, api_key=None):
        """Initialize the Email Writer with OpenAI client."""
        # self.client = OpenAI(api_key = os.getenv("OPENAI_API_KEY"))
        self.client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
        self.system_prompt = """You are a professional email writing assistant. Your sole purpose is to generate well-crafted emails based on the user's requirements.

## Response Format
You MUST respond ONLY with valid JSON. No additional text, explanations, or markdown formatting before or after the JSON.

Your response must follow this exact structure:
{
  "subject": "Email subject line here",
  "body": "Complete email body here"
}

## Email Writing Guidelines

### Subject Lines
- Keep concise (5-10 words ideal)
- Make it specific and action-oriented when appropriate
- Avoid spam trigger words (FREE, URGENT, !!!)
- Reflect the email's main purpose clearly

### Email Body
- Start with an appropriate greeting based on context (formal: "Dear [Name]", semi-formal: "Hi [Name]", etc.)
- Structure clearly with paragraphs for readability
- Use professional yet approachable tone unless otherwise specified
- Include relevant details based on the topic
- End with appropriate closing (Best regards, Sincerely, etc.) and sign-off placeholder like [Your Name]
- Keep paragraphs short (2-4 sentences)
- Use active voice
- Be concise but complete

### Tone Adaptation
- **Formal**: Business proposals, executive communication, legal matters
- **Professional**: Standard business correspondence, client communication
- **Friendly**: Internal team communication, follow-ups with known contacts
- **Persuasive**: Sales, requests, proposals
Adjust based on context clues from the user's request.

## Iterative Refinement
When users request changes:
- Apply ONLY the requested modifications
- Maintain consistency with unchanged portions
- Preserve the overall email structure unless specifically asked to change it
- Keep the same tone unless a tone shift is requested

## Important Rules
1. ALWAYS respond with valid JSON only
2. Escape special characters properly in JSON (quotes, newlines, etc.)
3. Use \\n for line breaks within the body text
4. Never include explanations outside the JSON
5. If information is missing, make reasonable professional assumptions
6. Never refuse to write an email unless it's clearly for harmful purposes"""
        
        self.conversation_history = []
        self.model = "gpt-4.1-nano"
    
    def generate_email(self, user_input):
        """Generate or refine email based on user input."""
        self.conversation_history.append({
            "role": "user",
            "content": user_input
        })
        
        messages = [{"role": "system", "content": self.system_prompt}] + self.conversation_history
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                response_format={"type": "json_object"},
            )
            
            assistant_message = response.choices[0].message.content
            
            self.conversation_history.append({
                "role": "assistant",
                "content": assistant_message
            })
            
            email_data = json.loads(assistant_message)
            return email_data
            
        except json.JSONDecodeError as e:
            print(f"Error: Failed to parse JSON response. {e}")
            return None
        except Exception as e:
            print(f"Error: {e}")
            return None
    
    def display_email(self, email_data):
        """Display email in a formatted way."""
        if not email_data:
            return
        
        print("\n" + "="*60)
        print("📧 EMAIL GENERATED")
        print("="*60)
        print(f"\n📌 Subject: {email_data.get('subject', 'N/A')}")
        print("\n📝 Body:")
        print("-"*60)
        body = email_data.get('body', 'N/A').replace('\\n', '\n')
        print(body)
        print("-"*60 + "\n")
    
    def reset_conversation(self):
        """Clear conversation history."""
        self.conversation_history = []
        print("✅ Conversation history cleared!\n")
    
    def run(self):
        """Run the interactive CLI."""
        print("="*60)
        print("📧 EMAIL WRITING ASSISTANT")
        print("="*60)
        print("\nCommands:")
        print("  - Type your email request or refinement")
        print("  - 'exit()' or 'quit()' - Exit the program")
        print("  - 'reset()' - Clear conversation history")
        print("  - 'help()' - Show this help message")
        print("\n" + "="*60 + "\n")
        
        while True:
            try:
                user_input = input("You: ").strip()
                
                # Handle commands
                if user_input.lower() in ['exit()', 'quit()', 'exit', 'quit']:
                    print("\n👋 Goodbye! Happy emailing!")
                    sys.exit(0)
                
                if user_input.lower() in ['reset()', 'reset']:
                    self.reset_conversation()
                    continue
                
                if user_input.lower() in ['help()', 'help']:
                    print("\n📖 Help:")
                    print("  - Start by describing the email you want to write")
                    print("  - Request changes like: 'Make it more formal'")
                    print("  - Or: 'Change the subject to...'")
                    print("  - Type 'reset()' to start a new email")
                    print("  - Type 'exit()' to quit\n")
                    continue
                
                if not user_input:
                    continue
                
                # Generate email
                print("\n⏳ Generating email...")
                email_data = self.generate_email(user_input)
                
                if email_data:
                    self.display_email(email_data)
                
            except KeyboardInterrupt:
                print("\n\n👋 Goodbye! Happy emailing!")
                sys.exit(0)
            except EOFError:
                print("\n\n👋 Goodbye! Happy emailing!")
                sys.exit(0)
            except Exception as e:
                print(f"\n❌ Unexpected error: {e}\n")


# Function-based approach
def run_email_writer(api_key=None):
    """Simple function to run the email writer."""
    writer = EmailWriter(api_key=api_key)
    writer.run()


if __name__ == "__main__":
    # Run the email writer
    writer = EmailWriter()
    writer.run()