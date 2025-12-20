# AuAg – Audio-Based Email Assistant

AuAg is a real-time, voice-driven email assistant that allows users to compose, edit, and send emails using natural speech. The agent supports conversational interaction, flexible workflows, and iterative refinement without requiring a fixed sequence of steps.

---

## Features

- Voice-first email composition using real-time speech interaction  
- Flexible workflow (recipient, subject, and body can be provided in any order)  
- Smart recipient disambiguation when multiple matches exist  
- Iterative conversational editing of subject and body  
- Live UI updates reflecting all changes  
- Explicit confirmation required before sending emails  

---

## Project Structure

```

AuAg - Assistant/
├── backend/
│   ├── app.py
│   └── ...
├── speech/
│   ├── speech_controller.py
│   └── ...
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
├── .gitignore
└── README.md

````

---

## Tech Stack

### Backend
- Python
- Speech processing and agent logic
- Email generation and sending

### Frontend
- React
- Real-time UI for email composition
- Voice interaction interface

---

## Setup Instructions

### Prerequisites

- Python 3.9+
- Node.js and npm
- Virtual environment (recommended)

---

## System Dependencies (macOS)

This project requires **PortAudio** for audio input.

Install it using Homebrew:

```bash
brew install portaudio
````

---

## Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Run the backend from the project root:

```bash
python -m backend.app
```

---

## Frontend Setup

```bash
cd frontend
npm install
npm start
```

For a production build:

```bash
npm run build
```

---

## Environment Variables & Credentials

This project requires external credentials that must **not** be committed to Git.

Create a `.env` file in the backend directory.

### Google Console (OAuth / API Credentials)

1. Go to **Google Cloud Console**
   [https://console.cloud.google.com/](https://console.cloud.google.com/)

2. Create or select a project.

3. Enable required APIs (Gmail API and People API).

4. Navigate to:
   **APIs & Services → Credentials**

5. Create an **OAuth Client ID**.

6. Download the credentials JSON and extract:

   * Client ID
   * Client Secret


### AssemblyAI API Key

AssemblyAI is used for speech-to-text processing.

1. Go to AssemblyAI and log in:  
   https://www.assemblyai.com/

2. Navigate to your dashboard and copy your **API Key**.

3. Add the key to `speech/.env`:

```env
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
```

### OpenAI API Key

OpenAI is used for language generation and interpretation.

Get your OpenAI API key from https://platform.openai.com/


Add your API key to `backend/.env`:

```env
OPENAI_API_KEY=your_openai_api_key
```

---

### ngrok Setup

ngrok is used to expose the local backend for external callbacks or integrations.

1. Sign up at:
   [https://ngrok.com/](https://ngrok.com/)

2. Get your **ngrok auth token** from the dashboard.

3. Authenticate ngrok locally:

```bash
ngrok config add-authtoken YOUR_NGROK_AUTH_TOKEN
```

4. Run ngrok:

```bash
npx ngrok http 5001      
```


---

## How It Works

1. The user speaks to the agent.
2. The agent extracts intent (recipient, subject, body, edits).
3. Email content is generated or updated.
4. Changes are reflected instantly in the frontend.
5. The user confirms the final email.
6. The email is sent.

---

## Use Cases

* Hands-free email composition
* Accessibility-focused workflows
* Voice-first productivity tools

---

## License

This project is licensed under the MIT License.
