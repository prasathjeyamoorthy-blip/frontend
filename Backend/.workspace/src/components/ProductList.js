import React, { useEffect, useState } from 'react';
import { getProducts } from '../services/products';

function ProductList() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await getProducts();
        setProducts(response);
      } catch (error) {
        console.error('Error fetching products:', error);
      }
    };

    fetchProducts();
  }, []);

  return (
    <ul style={{ listStyleType: 'none', padding: 0 }}>
      {products.map(product => (
        <li key={product.id} style={{ backgroundColor: '#800080', color: 'white', padding: '10px', marginBottom: '5px' }}>
          <h2>{product.name}</h2>
          <p>{product.description}</p>
          <p>${product.price.toFixed(2)}</p>
        </li>
      ))}
    </ul>
  );
}

export default ProductList;