// src/components/Calculator.js
import React, { useState } from 'react';

function Calculator() {
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [result, setResult] = useState(null);

  const handleAdd = () => {
    setResult(a + b);
  };

  const handleSubtract = () => {
    setResult(a - b);
  };

  const handleMultiply = () => {
    setResult(a * b);
  };

  const handleDivide = () => {
    if (b !== 0) {
      setResult(a / b);
    } else {
      setResult('Error: Division by zero');
    }
  };

  return (
    <div className="Calculator">
      <h1>Basic Calculator</h1>
      <input
        type="number"
        value={a}
        onChange={(e) => setA(Number(e.target.value))}
        placeholder="Number A"
      />
      <input
        type="number"
        value={b}
        onChange={(e) => setB(Number(e.target.value))}
        placeholder="Number B"
      />
      <button onClick={handleAdd}>+</button>
      <button onClick={handleSubtract}>-</button>
      <button onClick={handleMultiply}>*</button>
      <button onClick={handleDivide}>/</button>
      {result !== null && <p>Result: {result}</p>}
    </div>
  );
}

export default Calculator;