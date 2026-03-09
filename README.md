# AI Personas - Interactive Chat Application

A web-based application for creating and interacting with AI-powered personas. Perfect for IT education—create personas of IT teachers and engage in interactive conversations while providing feedback.

## Features

- **Session-based Chat**: Start a new session with a persona after providing your name
- **Personality Descriptions**: Each persona has a detailed description defining their character and expertise
- **Interactive Chat**: Real-time conversations with AI personas powered by OpenRouter
- **Feedback System**: Like or dislike answers to help refine persona responses
- **Async Backend**: Built with FastAPI for high-performance async operations
- **Extensible Architecture**: Easy to add new personas, customize behaviors, and extend functionality

## Project Structure

```
personas/
├── backend/               # FastAPI backend
│   ├── main.py           # Application entry point
│   ├── config.py         # Configuration settings
│   ├── models.py         # Database models
│   ├── schemas.py        # Pydantic schemas
│   ├── ai_service.py     # OpenRouter integration
│   ├── database.py       # Database operations
│   ├── config.example.json # Config template
│   └── requirements.txt  # Python dependencies
├── frontend/             # Web frontend
│   ├── index.html        # Main HTML file
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css # Application styles
│   │   └── js/
│   │       └── app.js    # Frontend logic
└── data/                 # Data storage (sessions, personas)
```

## Setup Instructions

### Prerequisites

- Python 3.10+
- OpenRouter API key (get it at https://openrouter.ai)

### Installation

1. **Clone or navigate to the project**
   ```bash
   cd personas
   ```

2. **Set up Python environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

4. **Create your config file**
   Copy the example and fill in your OpenRouter API key:
   ```bash
   cp backend/config.example.json backend/config.json
   ```
   Then edit `backend/config.json` and set `openrouter.api_key`.

5. **Run the application**
   ```bash
   python backend/main.py --config backend/config.json
   ```

   The application will be available at `http://localhost:8000`

## Usage

1. **Open the application** in your browser at `http://localhost:8000`
2. **Enter your name** in the text field
3. **Select or create a persona** with a personality description
4. **Start chatting** with the AI persona
5. **Provide feedback** by clicking the like/dislike buttons on responses

## API Endpoints

- `GET /` - Serves the main HTML interface
- `POST /api/sessions` - Create a new chat session
- `GET /api/sessions/{session_id}` - Get session details
- `POST /api/sessions/{session_id}/messages` - Send a message to the persona
- `POST /api/messages/{message_id}/feedback` - Submit feedback (like/dislike)
- `GET /api/personas` - List available personas

## Database Schema

### personas
| column | type | notes |
|---|---|---|
| id | integer | primary key |
| name | string | unique |
| description | text | |
| specialty | string | nullable |
| created_at | datetime | |

### sessions
| column | type | notes |
|---|---|---|
| id | integer | primary key |
| user_name | string | |
| persona_id | integer | FK → personas.id |
| created_at | datetime | |
| updated_at | datetime | |

### messages
| column | type | notes |
|---|---|---|
| id | integer | primary key |
| session_id | integer | FK → sessions.id |
| role | string | `"user"` or `"assistant"` |
| content | text | |
| liked | boolean | nullable — null = no feedback |
| created_at | datetime | |

## Extending the Application

### Adding New Personas

Edit `backend/models.py` or create personas via the API. Each persona needs:
- Name
- Personality description
- Specialty/expertise area

### Customizing AI Behavior

Modify `backend/ai_service.py` to:
- Change the AI model used (default: OpenRouter's best available)
- Adjust temperature and other parameters
- Add custom processing for responses

### Frontend Customization

- Modify `frontend/static/css/style.css` for styling
- Update `frontend/static/js/app.js` for new features
- Edit `frontend/index.html` for layout changes

## Technologies Used

- **Backend**: FastAPI, Pydantic, SQLAlchemy
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **AI**: OpenRouter API
- **Database**: SQLite (default, easily switched)

## License

This project is provided for educational use.

## Support

For issues or questions, refer to the architecture and see the extensible codebase for integration points.
