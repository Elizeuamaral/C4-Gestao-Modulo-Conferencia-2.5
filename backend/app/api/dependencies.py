"""Shared authentication dependencies for protected API routes."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from backend.app.core.security import hash_session_token
from backend.app.db.database import get_db
from backend.app.db.models import AuthSession, User
bearer_scheme = HTTPBearer(auto_error=False)
# A session stays valid only while the app keeps using it (heartbeat). Closing the
# app stops the heartbeat and the session expires after the idle window.
SESSION_IDLE_MINUTES = 5
SESSION_MAX_HOURS = 12
_SLIDE_THRESHOLD = timedelta(seconds=30)

def session_expiration(created_at: datetime, now: datetime) -> datetime:
    return min(now + timedelta(minutes=SESSION_IDLE_MINUTES), created_at + timedelta(hours=SESSION_MAX_HOURS))

def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme), db: Session = Depends(get_db)) -> User:
    unauthorized = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão ausente ou expirada. Entre novamente.", headers={"WWW-Authenticate":"Bearer"})
    if credentials is None or credentials.scheme.lower() != "bearer": raise unauthorized
    session = db.query(AuthSession).filter(AuthSession.token_hash == hash_session_token(credentials.credentials)).first()
    if session is None: raise unauthorized
    now = datetime.now(timezone.utc)
    expires_at = datetime.fromisoformat(session.expires_at)
    created_at = datetime.fromisoformat(session.created_at)
    if expires_at <= now or created_at + timedelta(hours=SESSION_MAX_HOURS) <= now:
        db.delete(session); db.commit(); raise unauthorized
    user = db.query(User).filter(User.id == session.user_id).first()
    if user is None or not user.active: raise unauthorized
    new_expiration = session_expiration(created_at, now)
    if new_expiration - expires_at > _SLIDE_THRESHOLD:
        session.expires_at = new_expiration.isoformat(); db.commit()
    return user

def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Esta operação exige perfil Administrador.")
    return user
