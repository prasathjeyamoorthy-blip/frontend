def factorial(n):
    """
    Calculate the factorial of a given number using recursion.
    
    Args:
    n (int): The number for which to calculate the factorial. Must be non-negative.
    
    Returns:
    int: The factorial of the number.
    
    Raises:
    ValueError: If the input is negative.
    """
    if n < 0:
        raise ValueError("Input must be a non-negative integer.")
    elif n == 0 or n == 1:
        return 1
    else:
        return n * factorial(n - 1)

# Example usage:
if __name__ == "__main__":
    try:
        number = int(input("Enter a non-negative integer to calculate its factorial: "))
        result = factorial(number)
        print(f"The factorial of {number} is {result}")
    except ValueError as e:
        print(e)