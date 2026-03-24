# Function to determine if a number is odd or even
def predict_number_type(number):
    if number % 2 == 0:
        return "Even"
    else:
        return "Odd"

# Main function to run the script
if __name__ == "__main__":
    try:
        # Get user input
        user_input = int(input("Enter a number: "))
        
        # Predict and print the result
        result = predict_number_type(user_input)
        print(f"The number {user_input} is {result}.")
    
    except ValueError:
        print("Please enter a valid integer.")