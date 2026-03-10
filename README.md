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
│   ├── main.py           # Application entry point and routes
│   ├── config.py         # Configuration settings
│   ├── models.py         # Database models (SQLAlchemy)
│   ├── schemas.py        # Pydantic schemas
│   ├── auth.py           # OTP + bearer token authentication
│   ├── ai_service.py     # OpenRouter integration
│   ├── database.py       # DB engine and session
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

**Auth** (open)
- `POST /api/auth/request` — send a 6-digit OTP to the given email (code logged to console)
- `POST /api/auth/verify` — verify OTP, returns `{ token, user }`
- `GET /api/auth/me` — return current user (requires `Authorization: Bearer <token>`)

**Personas** (reads open, writes require auth)
- `GET /api/personas` — list all personas
- `POST /api/personas` — create a persona (auth required)
- `GET /api/personas/{id}` — get a persona
- `POST /api/personas/{id}` — edit a persona (auth + ownership required)
- `GET /api/personas/{id}/sessions` — list sessions for a persona

**Sessions & messages** (reads open, create requires auth)
- `POST /api/sessions` — start a new session (auth required)
- `GET /api/sessions/{id}` — get session with messages
- `POST /api/sessions/{id}/messages` — send a message, get AI reply
- `POST /api/messages/{id}/feedback` — like/dislike a message

## Database Schema

### users
| column | type | notes |
|---|---|---|
| id | integer | primary key |
| email | string | unique, indexed |
| name | string | |
| role | string | `"admin"` or `"user"` |
| group | string | nullable — arbitrary group/class label |
| created_at | datetime | |

Users are created directly in the database (no self-registration). Insert a row to grant access:
```sql
INSERT INTO users (email, name, role) VALUES ('alice@example.com', 'Alice', 'user');
```

### auth_codes
| column | type | notes |
|---|---|---|
| id | integer | primary key |
| email | string | indexed |
| code_hash | string | SHA-256 of the 6-digit OTP |
| expires_at | datetime | default 10 minutes after issue |
| used | boolean | marked true after successful verify |

### auth_tokens
| column | type | notes |
|---|---|---|
| id | integer | primary key |
| user_id | integer | FK → users.id |
| token | string | UUID, unique, indexed |
| expires_at | datetime | default 1 hour after issue |
| created_at | datetime | |

### personas
| column | type | notes |
|---|---|---|
| id | integer | primary key |
| name | string | unique |
| description | text | |
| specialty | string | nullable |
| created_at | datetime | |
| user_id | integer | FK → users.id, nullable (null = editable by anyone) |

### sessions
| column | type | notes |
|---|---|---|
| id | integer | primary key |
| user_name | string | display name entered at chat start |
| persona_id | integer | FK → personas.id |
| created_at | datetime | |
| updated_at | datetime | |
| user_id | integer | FK → users.id, nullable |

### messages
| column | type | notes |
|---|---|---|
| id | integer | primary key |
| session_id | integer | FK → sessions.id |
| role | string | `"user"` or `"assistant"` |
| content | text | |
| liked | boolean | nullable — null = no feedback |
| prompt_tokens | integer | nullable |
| completion_tokens | integer | nullable |
| total_tokens | integer | nullable |
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
