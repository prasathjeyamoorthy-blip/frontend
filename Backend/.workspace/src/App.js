import React from 'react';
import { Route, Switch } from 'react-router-dom';
import Home from './pages/Home';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import CartPage from './pages/CartPage';

function App() {
  return (
    <div className="App">
      <Switch>
        <Route exact path="/" component={Home} />
        <Route path="/products" component={Products} />
        <Route path="/product/:id" component={ProductDetail} />
        <Route path="/cart" component={CartPage} />
      </Switch>
    </div>
  );
}

export default App;