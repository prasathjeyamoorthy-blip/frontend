from fastapi import FastAPI
from sqlalchemy.orm import Session
from .models import Base, Product

app = FastAPI()

# ... rest of the code ...

By installing the `sqlalchemy` package, you should be able to run your application without encountering the syntax error.