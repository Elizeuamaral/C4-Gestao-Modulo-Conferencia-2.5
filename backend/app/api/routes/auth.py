"""Login, first-run administrator setup, and user CRUD endpoints."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from backend.app.api.dependencies import bearer_scheme, get_current_user, require_admin
from backend.app.api.schemas.auth import InitialAdminSetup, LoginResponse, PasswordChange, PasswordReset, SetupStatus, UserCreate, UserCredentials, UserResponse, UserUpdate
from backend.app.core.security import create_session_token, hash_password, hash_session_token, verify_password
from backend.app.db.database import get_db
from backend.app.db.models import AuthSession, User
router = APIRouter(prefix="/auth", tags=["authentication"])
SESSION_HOURS = 12

def _create_session(db: Session, user: User) -> LoginResponse:
    token = create_session_token()
    now = datetime.now(timezone.utc)
    db.add(AuthSession(user_id=user.id, token_hash=hash_session_token(token), expires_at=(now + timedelta(hours=SESSION_HOURS)).isoformat(), created_at=now.isoformat()))
    db.commit(); db.refresh(user)
    return LoginResponse(access_token=token, user=user)

@router.get("/setup-status", response_model=SetupStatus)
def setup_status(db: Session = Depends(get_db)) -> SetupStatus:
    return SetupStatus(setup_required=db.query(User.id).first() is None)

@router.post("/setup-admin", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
def setup_admin(payload: InitialAdminSetup, db: Session = Depends(get_db)) -> LoginResponse:
    if db.query(User.id).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="O administrador inicial já foi configurado.")
    user = User(full_name=payload.full_name, username=payload.username, password_hash=hash_password(payload.password), role="ADMIN", active=True)
    db.add(user)
    try: db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível criar o administrador inicial. Atualize a tela e tente novamente.") from exc
    db.refresh(user)
    return _create_session(db, user)

@router.post("/login", response_model=LoginResponse)
def login(payload: UserCredentials, db: Session = Depends(get_db)) -> LoginResponse:
    user = db.query(User).filter(User.username == payload.username).first()
    if user is None or not user.active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário ou senha inválidos, ou usuário inativo.", headers={"WWW-Authenticate":"Bearer"})
    return _create_session(db, user)

@router.get("/me", response_model=UserResponse)
def current_user(user: User = Depends(get_current_user)) -> User: return user

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme), db: Session = Depends(get_db)) -> Response:
    if credentials:
        session = db.query(AuthSession).filter(AuthSession.token_hash == hash_session_token(credentials.credentials)).first()
        if session: db.delete(session); db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.put("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(payload: PasswordChange, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A senha atual está incorreta.")
    user.password_hash = hash_password(payload.new_password); user.updated_at = datetime.now(timezone.utc).isoformat()
    db.query(AuthSession).filter(AuthSession.user_id == user.id).delete(synchronize_session=False); db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.get("/users", response_model=list[UserResponse])
def list_users(search: str | None = Query(default=None, min_length=1, max_length=150), include_inactive: bool = False, _admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[User]:
    query = db.query(User)
    if not include_inactive: query = query.filter(User.active.is_(True))
    if search:
        term = f"%{search.strip()}%"
        query = query.filter((User.full_name.ilike(term)) | (User.username.ilike(term)))
    return query.order_by(User.full_name.asc()).all()

@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, _admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> User:
    user = User(full_name=payload.full_name, username=payload.username, password_hash=hash_password(payload.password), role=payload.role, active=True)
    db.add(user)
    try: db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este nome de usuário já está cadastrado.") from exc
    db.refresh(user); return user

@router.put("/users/{user_id}", response_model=UserResponse)
def update_user(user_id: str, payload: UserUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")
    if payload.full_name is not None: user.full_name = payload.full_name
    if payload.role is not None:
        if user.role == "ADMIN" and payload.role != "ADMIN" and user.active and db.query(User).filter(User.active.is_(True), User.role == "ADMIN").count() <= 1:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não é permitido remover o último administrador ativo.")
        user.role = payload.role
    user.updated_at = datetime.now(timezone.utc).isoformat(); db.commit(); db.refresh(user); return user

@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_user_password(user_id: str, payload: PasswordReset, _admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> Response:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")
    user.password_hash = hash_password(payload.new_password); user.updated_at = datetime.now(timezone.utc).isoformat()
    db.query(AuthSession).filter(AuthSession.user_id == user.id).delete(synchronize_session=False); db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.post("/users/{user_id}/deactivate", response_model=UserResponse)
def deactivate_user(user_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")
    if user.id == admin.id: raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não é permitido inativar o próprio usuário conectado.")
    if user.active and user.role == "ADMIN" and db.query(User).filter(User.active.is_(True), User.role == "ADMIN").count() <= 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não é permitido inativar o último administrador ativo.")
    user.active = False; user.updated_at = datetime.now(timezone.utc).isoformat()
    db.query(AuthSession).filter(AuthSession.user_id == user.id).delete(synchronize_session=False)
    db.commit(); db.refresh(user); return user

@router.post("/users/{user_id}/activate", response_model=UserResponse)
def activate_user(user_id: str, _admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")
    user.active = True; user.updated_at = datetime.now(timezone.utc).isoformat(); db.commit(); db.refresh(user); return user
