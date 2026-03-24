import React, { useState } from 'react';

function CartPage() {
  const [cartItems, setCartItems] = useState([]);

  return (
    <div>
      <h1>Shopping Cart</h1>
      <ul>
        {cartItems.map(item => (
          <li key={item.id}>
            {item.name} - ${item.price}
          </li>
        ))}
      </ul>
      <p>Total: ${cartItems.reduce((acc, item) => acc + item.price, 0)}</p>
    </div>
  );
}

export default CartPage;