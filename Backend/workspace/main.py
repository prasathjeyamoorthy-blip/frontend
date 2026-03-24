from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from .database import get_db
from .models import CartItem
from .schemas import CartItemCreate

app = FastAPI()

@app.post("/cart/", response_model=CartItem)
def create_cart_item(item: CartItemCreate, db: Session = Depends(get_db)):
    db_item = CartItem(**item.dict())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

@app.get("/cart/{item_id}", response_model=CartItem)
def read_cart_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(CartItem).filter(CartItem.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Cart item not found")
    return item

@app.put("/cart/{item_id}", response_model=CartItem)
def update_cart_item(item_id: int, item: CartItemCreate, db: Session = Depends(get_db)):
    db_item = db.query(CartItem).filter(CartItem.id == item_id).first()
    if db_item is None:
        raise HTTPException(status_code=404, detail="Cart item not found")
    update_data = item.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_item, key, value)
    db.commit()
    db.refresh(db_item)
    return db_item

@app.delete("/cart/{item_id}", response_model=CartItem)
def delete_cart_item(item_id: int, db: Session = Depends(get_db)):
    db_item = db.query(CartItem).filter(CartItem.id == item_id).first()
    if db_item is None:
        raise HTTPException(status_code=404, detail="Cart item not found")
    db.delete(db_item)
    db.commit()
    return db_item