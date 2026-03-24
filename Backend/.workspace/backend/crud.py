from sqlalchemy.orm import Session
from .models import User, Product
from .schemas import UserCreate, UserRead
import bcrypt

def create_user(db: Session, user: UserCreate):
    hashed_password = bcrypt.hashpw(user.password.encode(), bcrypt.gensalt())
    db_user = User(username=user.username, email=user.email, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def authenticate_user(fake_db, username: str, password: str):
    user = fake_db.get(username)
    if not user:
        return False
    if not bcrypt.checkpw(password.encode(), user.hashed_password):
        return False
    return user