import React, { useState, useEffect } from 'react';
import { Container, Grid, Typography } from '@material-ui/core';
import axios from 'axios';

function App() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/products');
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  return (
    <Container>
      <Typography variant="h4" component="h1" gutterBottom>
        E-commerce Store
      </Typography>
      <Grid container spacing={2}>
        {products.map(product => (
          <Grid item xs={12} sm={6} md={4} key={product.id}>
            <div style={{ border: '1px solid #ccc', padding: '10px' }}>
              <img src={product.image} alt={product.name} style={{ width: '100%' }} />
              <Typography variant="h5" component="h2">
                {product.name}
              </Typography>
              <Typography variant="body1" color="textSecondary">
                ${product.price}
              </Typography>
            </div>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}

export default App;