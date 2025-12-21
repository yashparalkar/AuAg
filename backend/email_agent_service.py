from email_writer import EmailWriter

# Create a single shared instance (optional but recommended)
email_writer = EmailWriter()

def generate_email_from_description(description: str):
    return email_writer.generate_email(description)
