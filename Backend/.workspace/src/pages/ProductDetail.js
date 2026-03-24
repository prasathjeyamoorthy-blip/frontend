import React, { useEffect, useState } from 'react';
import axios from 'axios';

function ProductDetail({ match }) {
  const [product, setProduct] = useState(null);

  useEffect(() => {
    axios.get(`${process.env.REACT_APP_API_URL}/products/${match.params.id}`)
      .then(response => {
        setProduct(response.data);
      })
      .catch(error => {
        console.error('Error fetching product:', error);
      });
  }, [match.params.id]);

  if (!product) return <div>Loading...</div>;

  return (
    <div>
      <h1>{product.name}</h1>
      <img src={product.image} alt={product.name} />
      <p>${product.price}</p>
      <p>{product.description}</p>
    </div>
  );
}

export default ProductDetail;