from openai import OpenAI
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

    def __init__(self,model: str = "gpt-4.1-nano"):
        # self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.client = OpenAI(api_key = os.environ.get("OPENAI_API_KEY"))
        self.model = model

    def summarize(self, email_text: str) -> str:
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {"role": "user", "content": email_text}
                ],
                temperature=0.0
            )
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            print(f"OpenAI API Error: {e}")
            return "Error: Could not generate summary due to an API issue."
