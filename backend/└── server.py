import os
import re
import sqlite3
import secrets
from pathlib import Path
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from fastapi import (
    FastAPI,
    HTTPException,
    Request,
    Response,
    Cookie,
)
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pwdlib import PasswordHash
from groq import Groq


# =========================================================
# CONFIGURATION
# =========================================================

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "jarvis.db"

load_dotenv(BASE_DIR / ".env")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
JWT_SECRET = os.getenv("JWT_SECRET")

if not JWT_SECRET:
    JWT_SECRET = secrets.token_urlsafe(48)

if not GROQ_API_KEY:
    print("WARNING: GROQ_API_KEY is not configured.")

groq_client = (
    Groq(api_key=GROQ_API_KEY)
    if GROQ_API_KEY
    else None
)

password_hash = PasswordHash.recommended()

app = FastAPI(
    title="JARVIS AI",
    version="10.0.0"
)


# =========================================================
# DATABASE
# =========================================================

def get_db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_database():
    db = get_db()

    db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    db.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)

    db.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(conversation_id) REFERENCES conversations(id)
        )
    """)

    db.commit()
    db.close()


init_database()


# =========================================================
# MODELS
# =========================================================

class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: str
    password: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=12000)
    conversation_id: int | None = None
    tool: str = "chat"


# =========================================================
# AUTHENTICATION
# =========================================================

def create_token(user_id: int, email: str):
    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(user_id),
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int(
            (now + timedelta(days=30)).timestamp()
        )
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm="HS256"
    )


def get_current_user(jarvis_token: str | None):
    if not jarvis_token:
        return None

    try:
        payload = jwt.decode(
            jarvis_token,
            JWT_SECRET,
            algorithms=["HS256"]
        )

        user_id = int(payload["sub"])

        db = get_db()

        user = db.execute(
            "SELECT id, email FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()

        db.close()

        if not user:
            return None

        return dict(user)

    except Exception:
        return None


# =========================================================
# AUTH ROUTES
# =========================================================

@app.post("/api/auth/register")
def register(data: RegisterRequest, response: Response):

    email = data.email.strip().lower()

    if not re.match(
        r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
        email
    ):
        raise HTTPException(
            status_code=400,
            detail="Please enter a valid email address."
        )

    db = get_db()

    existing = db.execute(
        "SELECT id FROM users WHERE email = ?",
        (email,)
    ).fetchone()

    if existing:
        db.close()

        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists."
        )

    hashed = password_hash.hash(data.password)

    created_at = datetime.now(
        timezone.utc
    ).isoformat()

    cursor = db.execute(
        """
        INSERT INTO users
        (email, password_hash, created_at)
        VALUES (?, ?, ?)
        """,
        (
            email,
            hashed,
            created_at
        )
    )

    user_id = cursor.lastrowid

    db.commit()
    db.close()

    token = create_token(
        user_id,
        email
    )

    response.set_cookie(
        "jarvis_token",
        token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=60 * 60 * 24 * 30
    )

    return {
        "success": True,
        "user": {
            "id": user_id,
            "email": email
        }
    }


@app.post("/api/auth/login")
def login(data: LoginRequest, response: Response):

    email = data.email.strip().lower()

    db = get_db()

    user = db.execute(
        """
        SELECT id, email, password_hash
        FROM users
        WHERE email = ?
        """,
        (email,)
    ).fetchone()

    db.close()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password."
        )

    try:
        valid = password_hash.verify(
            data.password,
            user["password_hash"]
        )
    except Exception:
        valid = False

    if not valid:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password."
        )

    token = create_token(
        user["id"],
        user["email"]
    )

    response.set_cookie(
        "jarvis_token",
        token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=60 * 60 * 24 * 30
    )

    return {
        "success": True,
        "user": {
            "id": user["id"],
            "email": user["email"]
        }
    }


@app.post("/api/auth/logout")
def logout(response: Response):

    response.delete_cookie(
        "jarvis_token"
    )

    return {
        "success": True
    }


@app.get("/api/auth/me")
def me(jarvis_token: str | None = Cookie(default=None)):

    user = get_current_user(
        jarvis_token
    )

    if not user:
        return {
            "authenticated": False
        }

    return {
        "authenticated": True,
        "user": user
    }


# =========================================================
# WEB SEARCH DETECTION
# =========================================================

SEARCH_WORDS = [
    "latest",
    "today",
    "current",
    "now",
    "news",
    "recent",
    "this week",
    "this month",
    "2026",
    "weather",
    "price",
    "score",
    "president",
    "prime minister",
    "election",
    "update",
    "who won",
    "when is",
    "what happened",
    "search",
    "look up",
    "find",
    "website"
]


def needs_web_search(message: str) -> bool:

    text = message.lower().strip()

    for word in SEARCH_WORDS:
        if word in text:
            return True

    return False


# =========================================================
# SYSTEM PROMPT
# =========================================================

SYSTEM_PROMPT = """
You are JARVIS AI, a highly capable AI assistant.

Your priorities are:

1. Give accurate answers.
2. Do not invent facts.
3. If the user asks about current, recent, changing,
   or time-sensitive information, use web search.
4. When web search is available, rely on trustworthy
   and relevant sources.
5. Clearly distinguish facts from uncertainty.
6. Keep answers easy to understand.
7. For school questions, explain step-by-step.
8. For coding questions, provide working code.
9. Never claim that you searched the web if you did not.
10. Do not make up sources or URLs.
11. When web sources are used, mention the important
    sources naturally in the answer.
12. If sources disagree, explain the disagreement.
13. Never present an uncertain claim as a confirmed fact.

You are not a fake/demo AI.
You must provide the best real answer available.
"""


# =========================================================
# GROQ AI
# =========================================================

def ask_groq(
    user_message: str,
    history: list[dict],
    tool: str
):

    if not groq_client:
        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY is not configured."
        )

    use_search = needs_web_search(
        user_message
    )

    # Fast model for normal requests.
    # Compound Mini for current web information.
    model = (
        "groq/compound-mini"
        if use_search
        else "llama-3.3-70b-versatile"
    )

    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT
        }
    ]

    # Keep recent conversation context.
    for item in history[-12:]:

        role = item.get("role")

        content = item.get("content")

        if role in ["user", "assistant"] and content:
            messages.append({
                "role": role,
                "content": str(content)[:12000]
            })

    messages.append({
        "role": "user",
        "content": user_message
    })

    try:

        if use_search:

            response = groq_client.chat.completions.create(
                model="groq/compound-mini",
                messages=messages,
                max_completion_tokens=4096,
                temperature=0.2,
                citation_options="enabled"
            )

        else:

            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=messages,
                max_tokens=4096,
                temperature=0.3
            )

        message = response.choices[0].message

        answer = message.content or ""

        executed_tools = getattr(
            message,
            "executed_tools",
            None
        )

        sources = []

        if executed_tools:

            for tool_result in executed_tools:

                search_results = getattr(
                    tool_result,
                    "search_results",
                    None
                )

                if not search_results:
                    continue

                try:

                    for result in search_results:

                        if isinstance(result, dict):

                            url = result.get("url")
                            title = (
                                result.get("title")
                                or result.get("name")
                                or url
                            )

                        else:

                            url = getattr(
                                result,
                                "url",
                                None
                            )

                            title = getattr(
                                result,
                                "title",
                                None
                            ) or url

                        if url:

                            sources.append({
                                "title": title,
                                "url": url
                            })

                except Exception:
                    pass

        # Remove duplicate URLs.
        unique_sources = []
        seen = set()

        for source in sources:

            if source["url"] in seen:
                continue

            seen.add(
                source["url"]
            )

            unique_sources.append(
                source
            )

        return {
            "answer": answer,
            "sources": unique_sources[:8],
            "web_search_used": use_search,
            "model": model
        }

    except Exception as error:

        print(
            "Groq error:",
            repr(error)
        )

        raise HTTPException(
            status_code=502,
            detail="JARVIS could not contact the AI service."
        )


# =========================================================
# CHAT ROUTE
# =========================================================

@app.post("/api/chat")
def chat(
    data: ChatRequest,
    jarvis_token: str | None = Cookie(default=None)
):

    user = get_current_user(
        jarvis_token
    )

    # Guest users can chat.
    # Their conversations are NOT saved to the account.
    history = []

    if user and data.conversation_id:

        db = get_db()

        conversation = db.execute(
            """
            SELECT id
            FROM conversations
            WHERE id = ?
            AND user_id = ?
            """,
            (
                data.conversation_id,
                user["id"]
            )
        ).fetchone()

        if conversation:

            rows = db.execute(
                """
                SELECT role, content
                FROM messages
                WHERE conversation_id = ?
                ORDER BY id ASC
                LIMIT 30
                """,
                (
                    data.conversation_id,
                )
            ).fetchall()

            history = [
                {
                    "role": row["role"],
                    "content": row["content"]
                }
                for row in rows
            ]

        db.close()

    result = ask_groq(
        data.message,
        history,
        data.tool
    )

    # Save only signed-in users.
    if user:

        db = get_db()

        conversation_id = data.conversation_id

        if not conversation_id:

            title = data.message.strip()

            if len(title) > 60:
                title = title[:57] + "..."

            now = datetime.now(
                timezone.utc
            ).isoformat()

            cursor = db.execute(
                """
                INSERT INTO conversations
                (user_id, title, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    user["id"],
                    title or "New Chat",
                    now,
                    now
                )
            )

            conversation_id = cursor.lastrowid

        now = datetime.now(
            timezone.utc
        ).isoformat()

        db.execute(
            """
            INSERT INTO messages
            (conversation_id, role, content, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (
                conversation_id,
                "user",
                data.message,
                now
            )
        )

        db.execute(
            """
            INSERT INTO messages
            (conversation_id, role, content, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (
                conversation_id,
                "assistant",
                result["answer"],
                now
            )
        )

        db.execute(
            """
            UPDATE conversations
            SET updated_at = ?
            WHERE id = ?
            """,
            (
                now,
                conversation_id
            )
        )

        db.commit()
        db.close()

        result["conversation_id"] = conversation_id

    else:

        result["conversation_id"] = None

    return result


# =========================================================
# HISTORY
# =========================================================

@app.get("/api/history")
def get_history(
    jarvis_token: str | None = Cookie(default=None)
):

    user = get_current_user(
        jarvis_token
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Please sign in."
        )

    db = get_db()

    conversations = db.execute(
        """
        SELECT
            id,
            title,
            created_at,
            updated_at
        FROM conversations
        WHERE user_id = ?
        ORDER BY updated_at DESC
        """,
        (
            user["id"],
        )
    ).fetchall()

    db.close()

    return {
        "conversations": [
            dict(item)
            for item in conversations
        ]
    }


@app.get("/api/history/{conversation_id}")
def get_conversation(
    conversation_id: int,
    jarvis_token: str | None = Cookie(default=None)
):

    user = get_current_user(
        jarvis_token
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Please sign in."
        )

    db = get_db()

    conversation = db.execute(
        """
        SELECT *
        FROM conversations
        WHERE id = ?
        AND user_id = ?
        """,
        (
            conversation_id,
            user["id"]
        )
    ).fetchone()

    if not conversation:
        db.close()

        raise HTTPException(
            status_code=404,
            detail="Conversation not found."
        )

    messages = db.execute(
        """
        SELECT role, content, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY id ASC
        """,
        (
            conversation_id,
        )
    ).fetchall()

    db.close()

    return {
        "conversation": dict(conversation),
        "messages": [
            dict(message)
            for message in messages
        ]
    }


@app.delete("/api/history")
def clear_history(
    jarvis_token: str | None = Cookie(default=None)
):

    user = get_current_user(
        jarvis_token
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Please sign in."
        )

    db = get_db()

    conversation_ids = db.execute(
        """
        SELECT id
        FROM conversations
        WHERE user_id = ?
        """,
        (
            user["id"],
        )
    ).fetchall()

    for conversation in conversation_ids:

        db.execute(
            """
            DELETE FROM messages
            WHERE conversation_id = ?
            """,
            (
                conversation["id"],
            )
        )

    db.execute(
        """
        DELETE FROM conversations
        WHERE user_id = ?
        """,
        (
            user["id"],
        )
    )

    db.commit()
    db.close()

    return {
        "success": True
    }


# =========================================================
# HEALTH
# =========================================================

@app.get("/api/health")
def health():

    return {
        "status": "online",
        "ai": groq_client is not None,
        "web_search": True,
        "version": "10.0.0"
    }


# =========================================================
# FRONTEND
# =========================================================

@app.get("/")
def root():

    return FileResponse(
        BASE_DIR / "index.html"
    )


# Serve frontend assets.
app.mount(
    "/static",
    StaticFiles(directory=BASE_DIR),
    name="static"
)


# Direct access to CSS/JS/manifest.
@app.get("/{filename:path}")
def frontend_file(filename: str):

    # Never allow API paths through this handler.
    if filename.startswith("api/"):
        raise HTTPException(
            status_code=404
        )

    requested = (
        BASE_DIR / filename
    ).resolve()

    try:
        requested.relative_to(
            BASE_DIR.resolve()
        )
    except ValueError:

        raise HTTPException(
            status_code=404
        )

    if requested.is_file():

        return FileResponse(
            requested
        )

    return FileResponse(
        BASE_DIR / "index.html"
    )
