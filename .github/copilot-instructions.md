# AI Personas - Development Instructions

## Project Overview
A web-based chat application for interactive AI personas with FastAPI backend and vanilla JavaScript frontend. Built for IT education use cases.

## Architecture
- **Backend**: FastAPI (Python) with async support
- **Frontend**: HTML5 + CSS3 + Vanilla JavaScript
- **Database**: SQLite (easily switchable)
- **AI**: OpenRouter API integration
- **Session Management**: Per-user persona conversations with feedback

## Key Features
- Session-based chat requiring user name entry
- Multiple personas with customizable descriptions
- Like/dislike feedback on AI responses
- Extensible persona system
- Real-time message streaming

## Development Guidelines

### Backend (Python/FastAPI)
- Located in `/backend`
- Uses `async/await` throughout
- Models: Persona, Session, Message (with feedback)
- API-first design with clear separation of concerns
- All responses follow OpenRouter format

### Frontend (JavaScript)
- Single-page application in `/frontend`
- Vanilla JavaScript (no frameworks initially)
- Responsive CSS Grid layout
- Real-time UI updates without page reloads
- Modal for persona selection

### Adding Features
1. **New Persona Fields**: Update `models.py`, `schemas.py`, API endpoints
2. **Database Schema Changes**: Modify `models.py`, SQLAlchemy handles migrations
3. **Frontend Components**: Add to `app.js` following existing patterns
4. **Styling**: Extend `/static/css/style.css` with new classes
5. **API Endpoints**: Follow existing REST pattern in `main.py`

### Configuration
- Environment variables in `.env`
- Required: `OPENROUTER_API_KEY`
- Optional: `DEBUG=True` for development

## File Structure
```
personas/
├── README.md              # User documentation
├── backend/
│   ├── main.py           # FastAPI app & endpoints
│   ├── config.py         # Settings management
│   ├── models.py         # Database models
│   ├── schemas.py        # Request/response schemas
│   ├── ai_service.py     # OpenRouter integration
│   ├── database.py       # DB initialization
│   └── requirements.txt  # Dependencies
├── frontend/
│   ├── index.html        # Main HTML
│   └── static/
│       ├── css/style.css # Styling
│       └── js/app.js     # Application logic
├── data/                 # Database storage
└── .env                  # API keys (gitignored)
```

## Common Tasks

### Running the Application
```bash
cd backend
python main.py
```

### Installing Dependencies
```bash
pip install -r backend/requirements.txt
```

### Adding a New Persona
Via API: `POST /api/personas` with name, description, specialty
Or: Direct database modification

### Customizing AI Behavior
Edit `ai_service.py`:
- Temperature: 0.7 (balanced) - increase for more creative
- Max tokens: 1000 - adjust response length
- Model: "auto" - change to specific model if needed

### Extending Chat Features
1. Add fields to Message model (e.g., confidence_score)
2. Update schema in schemas.py
3. Modify API endpoint in main.py
4. Update frontend in app.js to display/use new field
