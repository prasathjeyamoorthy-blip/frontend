```python
from sqlalchemy.orm import Session
from .models import User, Product
from .schemas import UserCreate, UserRead, ProductCreate, ProductRead

def create_user(db: Session, user: UserCreate):
    db_user = User(username=user.username, email=user.email)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return