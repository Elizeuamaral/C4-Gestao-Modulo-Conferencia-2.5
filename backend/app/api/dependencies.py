"""Shared authentication dependencies for protected API routes."""
from __future__ import annotations
from datetime import datetime, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from backend.app.core.security import hash_session_token
from backend.app.db.database import get_db
from backend.app.db.models import AuthSession, User
bearer_scheme = HTTPBearer(auto_error=False)

def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme), db: Session = Depends(get_db)) -> User:
    unauthorized = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão ausente ou expirada. Entre novamente.", headers={"WWW-Authenticate":"Bearer"})
    if credentials is None or credentials.scheme.lower() != "bearer": raise unauthorized
    session = db.query(AuthSession).filter(AuthSession.token_hash == hash_session_token(credentials.credentials)).first()
    if session is None: raise unauthorized
    if datetime.fromisoformat(session.expires_at) <= datetime.now(timezone.utc):
        db.delete(session); db.commit(); raise unauthorized
    user = db.query(User).filter(User.id == session.user_id).first()
    if user is None or not user.active: raise unauthorized
    return user

def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Esta operação exige perfil Administrador.")
    return user
