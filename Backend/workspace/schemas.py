from pydantic import BaseModel

class CartItemCreate(BaseModel):
    product_id: str
    quantity: int = 1
    price: float