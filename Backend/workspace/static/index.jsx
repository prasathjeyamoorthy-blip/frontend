import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';

const CoffeeList = () => {
    const [coffees, setCoffees] = useState([]);

    useEffect(() => {
        fetch('/api/coffees/')
            .then(response => response.json())
            .then(data => setCoffees(data));
    }, []);

    return (
        <ul>
            {coffees.map(coffee => (
                <li key={coffee.id}>
                    {coffee.name} - ${coffee.price.toFixed(2)}
                </li>
            ))}
        </ul>
    );
};

ReactDOM.render(<CoffeeList />, document.getElementById('root'));