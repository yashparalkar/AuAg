from google import genai
import os

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

    def __init__(self, model: str = "gemini-3.5-flash"):
        self.client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
        self.model = model

    def summarize(self, email_text: str) -> str:
        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=email_text,
                config=genai.types.GenerateContentConfig(
                    system_instruction=self.SYSTEM_PROMPT,
                    temperature=0.0,
                ),
            )
            return response.text.strip()

        except Exception as e:
            print(f"Gemini API Error: {e}")
            return "Error: Could not generate summary due to an API issue."
