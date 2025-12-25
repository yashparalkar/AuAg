from openai import OpenAI
import json
from dotenv import load_dotenv
import os

load_dotenv()

# UI gets the recipient name, (cc & bcc) from this module
class EmailMediator:
    def __init__(self):
        self.system_prompt = """You are the Email Mediator. You must output exactly one JSON object and nothing else.

The JSON object MUST contain only the following keys:

```json
{
  "recipient_name": string|null,
  "recipient_relation": string|null,
  "recipient_options": int|null,
  "cc": string[]|null,
  "bcc": string[]|null,
  "description": string|null,
  "mail_revision": string|null
}
```

Behavior rules (strict):

1. OUTPUT FORMAT

* Always return exactly one JSON object.
* All seven keys must be present.
* Use null for unknown or inapplicable values.
* Do not include any additional keys or text.

2. recipient_name (PERSON-NAME ONLY NER)

* Extract only a personal name (PERSON entity) from the user input.
* The name may be a first name or a full name.
* Explicitly exclude titles, honorifics, roles, or designations (e.g., Prof, Dr, CEO, HR, Manager, colleague, friend.).
* If the input contains both a title and a name, extract only the name.
* If no personal name is present, set recipient_name to null.

3. recipient_relation (RELATIONSHIP TO RECIPIENT)

* Extract the relationship between the user (sender) and the email recipient if explicitly mentioned or clearly implied.
* Valid values are short, lowercase role nouns such as: manager, professor, supervisor, colleague, teammate, client, customer, recruiter, interviewer, mentor, advisor, friend, family, peer, vendor, partner.
* Do NOT include names, titles, or adjectives—only the relationship label.
* Do NOT infer a relationship unless it is explicitly stated or strongly implied by standard language (e.g., “my manager,” “my professor,” “our client”).
* If no relationship is mentioned or cannot be determined with high confidence, set recipient_relation to null.

4. recipient_options (disambiguation signal)

* If the extracted recipient_name corresponds to multiple possible recipients, set recipient_options to the number of available matches (integer > 1).
* If there is exactly one match, or recipient_name is null, set recipient_options to null.

5. cc (CARBON COPY RECIPIENTS)

* Extract any explicitly mentioned CC recipients.
* Represent CC recipients as an array of strings.
* Each string should be exactly as provided in the user input (e.g., a personal name or an email address).
* Do NOT infer or add recipients not explicitly stated.
* If no CC recipients are mentioned, set cc to null.

6. bcc (BLIND CARBON COPY RECIPIENTS)

* Extract any explicitly mentioned BCC recipients.
* Represent BCC recipients as an array of strings.
* Each string should be exactly as provided in the user input (e.g., a personal name or an email address).
* Do NOT infer or add recipients not explicitly stated.
* If no BCC recipients are mentioned, set bcc to null.

7. description (ENRICHED, STRUCTURED)

* Produce a clear, structured, natural-language description suitable for direct use by the email_writer.
* Do NOT simply copy or trim the user prompt.
* Improve unclear or poorly structured user input by:

  * Explicitly stating who the email is being sent to (using recipient_name when available).
  * Clarifying the purpose of the email.
  * Including relevant context, intent, and expected outcome if implied.
  * Incorporating recipient_relation when available to guide tone and formality.
* Preserve all meaningful information from the user prompt and make reasonable, minimal inferences to improve clarity and structure.
* Prefer a single well-formed paragraph or short structured sentences.
* If the user provided no meaningful intent, set description to null.

8. mail_revision (ENRICHED CHANGE INSTRUCTION)

* If the user requests changes to an existing email, convert the request into a detailed, structured revision instruction suitable for the email_writer.
* The revision should:

  * Restate what is being changed and why, if implied.
  * Include relevant context such as recipient_name, recipient_relation, and email purpose when helpful.
* Do not restate the full email content.
* If no revision is requested, set mail_revision to null.

9. PRIORITY AND STATE RULES

* Recipient resolution takes priority over description completeness.
* If recipient_name is ambiguous (recipient_options > 1), set description to null.
* Preserve previously established values unless the user explicitly changes them.
* Do not overwrite description with mail_revision content.

10. ROLE LIMITATION

* You do not ask questions.
* You do not write the final email.
* You do not send emails.
* You only prepare enriched, structured state for downstream execution.

Be deterministic, conservative in inference, and focused on clarity and completeness.
"""
        
        # self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.client = OpenAI(api_key = os.environ.get("OPENAI_API_KEY"))
        self.json_state = {
            "recipient_name": None,
            "recipient_relation": None,
            "recipient_options": None,
            "cc": None,
            "bcc": None,
            "description": None,
            "mail_revision": None
        }

        self.chat_history = [{'role': 'system', 'content': self.system_prompt}]

    def process_user_input(self, user_input, chat_history):
        chat_history.append({"role": "user", "content": user_input})

        response = self.client.chat.completions.create(
            model="gpt-4.1-nano",
            messages=chat_history,
        )

        assistant_message = response.choices[0].message.content
        chat_history.append({"role": "assistant", "content": assistant_message})

        try:
            self.json_state = json.loads(assistant_message)
        except json.JSONDecodeError:
            pass

        return self.json_state

    def run_cli_chat(self):
        chat_history = [
            {
                "role": "system",
                "content": self.system_prompt
            }
        ]

        print("OpenAI CLI Chat")
        print("Type 'exit' or 'quit' to end the session.\n")

        while True:
            user_input = input("You: ").strip()

            if user_input.lower() in {"exit", "quit"}:
                print("Session ended.")
                break

            chat_history.append(
                {
                    "role": "user",
                    "content": user_input
                }
            )

            try:
                response = self.client.chat.completions.create(
                    model="gpt-4.1-nano",
                    messages=chat_history,
                    # temperature=0.7
                )

                assistant_message = response.choices[0].message.content

                chat_history.append(
                    {
                        "role": "assistant",
                        "content": assistant_message
                    }
                )

                # print(f"\nAssistant: {assistant_message}\n")
                try:
                    self.json_state = json.loads(assistant_message)
                    print("\nExtracted JSON:")
                    print(json.dumps(self.json_state, indent=2))
                    print()
                except json.JSONDecodeError:
                    print("\nError: Assistant response is not valid JSON.")
                    print(f"Response was: {assistant_message}\n")

                if self.json_state.get("recipient_name") is None:
                    print("Who would you like to send this email to? Please provide the recipient’s name.\n")
                elif self.json_state.get("description") is None:
                    print("Could you decsribe the email you would like to write.\n")
                else:
                    print("Does this look okay? You can provide revisions if needed.\n")
                
                

            except Exception as e:
                print(f"Error communicating with OpenAI API: {e}")
                break

    def advance(self, user_input):
        self.chat_history.append({"role": "user", "content": user_input})

        response = self.client.chat.completions.create(
            model="gpt-4.1-nano",
            messages=self.chat_history
        )

        assistant_message = response.choices[0].message.content
        # print(assistant_message)
        self.chat_history.append(
            {"role": "assistant", "content": assistant_message}
        )

        try:
            self.json_state = json.loads(assistant_message)
        except json.JSONDecodeError:
            pass

        # Persist state for Flask
        with open("mediator_state.json", "w") as f:
            json.dump(self.json_state, f, indent=2)

        return self.json_state


if __name__ == "__main__":
    mediator = EmailMediator()
    mediator.run_cli_chat()
