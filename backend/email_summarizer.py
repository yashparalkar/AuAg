from openai import OpenAI
from dotenv import load_dotenv
import os

load_dotenv()

class EmailSummarizer:
    SYSTEM_PROMPT = (
        "You are an Email Summarizer.\n\n"
        "Your only task is to summarize the content of an email provided by the user.\n\n"
        "Rules:\n"
        "- Output only a concise, clear summary of the email’s content.\n"
        "- Capture the main purpose, key points, and any explicit requests or deadlines.\n"
        "- Do not add interpretation, advice, or new information.\n"
        "- Do not rewrite, edit, or respond to the email.\n"
        "- Do not ask questions.\n"
        "- Do not produce any output other than the summary.\n"
        "- If the input is not an email or contains no meaningful content, output: "
        "`No email content to summarize.`\n\n"
        "Be accurate, neutral, and brief."
    )

    def __init__(self, model: str = "openai/gpt-5-nano"):
        self.client = OpenAI(
            base_url=os.environ.get("AICREDITS_BASE_URL", "https://api.aicredits.in/v1"),
            api_key=os.environ.get("AICREDITS_API_KEY"),
        )
        self.model = model

    def summarize(self, email_text: str) -> str:
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {"role": "user", "content": email_text},
                ],
                temperature=0.0,
            )
            return response.choices[0].message.content.strip()

        except Exception as e:
            print(f"AICredits API Error: {e}")
            return "Error: Could not generate summary due to an API issue."
