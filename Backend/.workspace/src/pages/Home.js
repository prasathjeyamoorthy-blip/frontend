import React from 'react';
import { Link } from 'react-router-dom';

function Home() {
  return (
    <div>
      <h1>Welcome to Our E-commerce Store</h1>
      <p>Explore our wide range of products.</p>
      <Link to="/products">View Products</Link>
    </div>
  );
}

export default Home;