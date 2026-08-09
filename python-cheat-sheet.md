# Python Cheat Sheet for Beginners

This sheet is built for the topics you have covered so far in `PY101`.

Use it like this:
- Read one section at a time.
- Copy the examples and run them.
- Change the values and see what happens.
- Keep adding your own notes under each section.

---

## 1. Your First Python Program

The most common first program is:

```python
print("Hello, world!")
```

### What `print()` does
`print()` displays output on the screen.

Examples:

```python
print("Welcome to Python")
print(5)
print(3 + 2)
```

Output:

```python
Welcome to Python
5
5
```

### Important idea
Python runs code from top to bottom.

```python
print("First")
print("Second")
print("Third")
```

---

## 2. `print()` Power-Ups

You can print:
- text
- numbers
- results of calculations
- variable values

```python
print("Score:")
print(98)
print(10 + 5)
```

### Printing multiple things

```python
name = "Jordan"
age = 19

print(name, age)
```

Output:

```python
Jordan 19
```

Python adds a space between items separated by commas in `print()`.

### Strings vs numbers

```python
print("5")
print(5)
```

These look similar, but they are different:
- `"5"` is text
- `5` is a number

---

## 3. Variables

A variable stores a value so you can use it later.

```python
name = "Ava"
score = 100
price = 4.99
```

### Variable rules
- Put the variable name on the left
- Put `=` in the middle
- Put the value on the right

```python
city = "Indianapolis"
temperature = 72
```

### Reading a variable

```python
favorite_color = "blue"
print(favorite_color)
```

### Updating a variable

```python
points = 10
points = 15
print(points)
```

The old value is replaced by the new one.

### Good variable names

```python
student_name = "Maya"
quiz_score = 87
item_price = 12.50
```

Try to make names clear and descriptive.

### Bad variable names
- `x` when the meaning is not obvious
- `thing`
- `stuff`

---

## 4. Working With Text

Text in Python is called a **string**.

Strings go inside quotes:

```python
"hello"
'hello'
```

Both single quotes and double quotes work.

### Examples

```python
name = "Chris"
message = "Welcome back!"
print(name)
print(message)
```

### Combining text

```python
first_name = "Sam"
last_name = "Lee"
full_name = first_name + " " + last_name
print(full_name)
```

Output:

```python
Sam Lee
```

This is called **concatenation**.

### Repeating text

```python
print("ha" * 3)
```

Output:

```python
hahaha
```

### Common beginner mistake

```python
name = "Alex"
print("Hello " + name)      # works
print("Hello", name)        # also works
```

But this can cause an error:

```python
age = 15
print("Age: " + age)
```

Why? Because `"Age: "` is text, but `age` is a number.

A safer beginner version:

```python
age = 15
print("Age:", age)
```

---

## 5. Working With Numbers

Python works with:
- integers: whole numbers like `3`, `10`, `-7`
- floats: decimal numbers like `2.5`, `9.99`

### Basic math

```python
print(2 + 3)   # addition
print(7 - 4)   # subtraction
print(6 * 5)   # multiplication
print(8 / 2)   # division
```

### Storing results

```python
price = 10
tax = 2
total = price + tax
print(total)
```

### Order of operations
Python follows normal math order:
1. parentheses
2. multiplication/division
3. addition/subtraction

```python
print(2 + 3 * 4)      # 14
print((2 + 3) * 4)    # 20
```

---

## 6. Modeling Real-World Calculations

This means using variables and math to represent real situations.

### Example: shopping total

```python
item_price = 12.50
quantity = 3
subtotal = item_price * quantity
print(subtotal)
```

### Example: area of a rectangle

```python
length = 8
width = 5
area = length * width
print(area)
```

### Example: average score

```python
test1 = 85
test2 = 90
test3 = 95
average = (test1 + test2 + test3) / 3
print(average)
```

Tip: break big problems into small variables.

---

## 7. Division: `/` vs `//`

These are not the same.

### Regular division: `/`

`/` gives the full answer, including decimals.

```python
print(7 / 2)
```

Output:

```python
3.5
```

### Floor division: `//`

`//` gives the whole-number quotient.

```python
print(7 // 2)
```

Output:

```python
3
```

### Quick comparison

```python
print(9 / 4)   # 2.25
print(9 // 4)  # 2
```

### When `//` is useful
- number of full groups
- number of boxes needed before remainder
- whole steps completed

Example:

```python
cookies = 17
plates = 4
cookies_per_plate = cookies // plates
print(cookies_per_plate)
```

---

## 8. Remainder and Modulo `%`

The modulo operator `%` gives the remainder after division.

```python
print(7 % 2)
```

Output:

```python
1
```

Because `7 ÷ 2` is `3` remainder `1`.

### More examples

```python
print(10 % 3)   # 1
print(12 % 4)   # 0
print(14 % 5)   # 4
```

### Modulo for even and odd

```python
number = 8
print(number % 2)
```

If the result is:
- `0`, the number is even
- `1`, the number is odd

Examples:

```python
print(6 % 2)   # 0
print(7 % 2)   # 1
```

### Modulo for cycles and positions

You can use `%` when something repeats.

Examples:
- days of the week
- player turns
- wrapping around a list

```python
turn = 5
player = turn % 2
print(player)
```

---

## 9. Quotient and Remainder Together

Sometimes you need both:
- quotient with `//`
- remainder with `%`

Example:

```python
total_minutes = 135
hours = total_minutes // 60
minutes = total_minutes % 60

print(hours)
print(minutes)
```

Output:

```python
2
15
```

This means `135` minutes is `2` hours and `15` minutes.

---

## 10. Rounding

Python can round numbers using `round()`.

```python
print(round(3.2))
print(round(3.8))
```

Output:

```python
3
4
```

### Rounding to decimal places

```python
price = 4.567
print(round(price, 2))
```

Output:

```python
4.57
```

### Money formatting idea

For beginner work, this is often enough:

```python
price = 12.5
print(round(price, 2))
```

If you want the value to always *look* like money with two decimal places:

```python
price = 12.5
print(f"{price:.2f}")
```

Output:

```python
12.50
```

You may not have covered f-strings deeply yet, so if this feels new, just remember:
- `round()` changes the numeric value
- formatting changes how the value is displayed

---

## 11. Checking the Facts

This usually means checking whether your program is doing what you think it is doing.

### Good habits
- test small pieces of code
- print values to inspect them
- compare expected output with actual output

Example:

```python
price = 10
tax = 2
total = price + tax

print("price =", price)
print("tax =", tax)
print("total =", total)
```

This helps you catch mistakes early.

### Ask yourself
- Did I use the right variable?
- Did I use text when I meant a number?
- Did I forget parentheses?
- Am I printing the result I actually want?

---

## 12. Getting Input From Users

Use `input()` to let the user type something.

```python
name = input("What is your name? ")
print("Hello,", name)
```

### Important rule
`input()` always gives you **text**.

That means this:

```python
age = input("Enter your age: ")
print(age)
```

`age` is a string, not a number.

### If you need a number
Convert the input:

```python
age = int(input("Enter your age: "))
print(age + 1)
```

### Common pattern

```python
num1 = float(input("Enter first number: "))
num2 = float(input("Enter second number: "))
print(num1 + num2)
```

### `int()` vs `float()`
- `int()` for whole numbers
- `float()` for decimals

---

## 13. Python Errors and the Traceback

An error means Python found a problem and stopped.

The **traceback** is Python’s error report.

It tells you:
- where the error happened
- what kind of error it was

### Example error

```python
print(unknown_name)
```

This causes a `NameError` because the variable does not exist.

### Common beginner errors

#### `NameError`
Using a variable that was never created:

```python
print(score)
```

#### `SyntaxError`
Your code is written in an invalid way:

```python
print("Hello"
```

#### `TypeError`
You used the wrong type of value:

```python
age = 15
print("Age: " + age)
```

#### `ValueError`
You tried to convert text into a number, but the text was not a valid number:

```python
age = int("hello")
```

### How to read a traceback
Look at:
1. the last line of the error message
2. the line number where it happened
3. the code on that line

---

## 14. Functions: Why They Matter

A function is a reusable block of code.

Functions help you:
- avoid repeating yourself
- organize your code
- give a task a clear name

### Defining a function

```python
def greet():
    print("Hello!")
```

### Calling a function

```python
greet()
```

Output:

```python
Hello!
```

### Important syntax
- use `def`
- write the function name
- use parentheses `()`
- end the first line with `:`
- indent the code inside the function

---

## 15. Functions: Inside the Function

Everything indented under the function belongs to the function.

```python
def show_steps():
    print("Step 1")
    print("Step 2")
    print("Step 3")
```

Nothing inside the function runs until you call it:

```python
show_steps()
```

### Functions can use variables made inside them

```python
def make_message():
    word = "Hi"
    print(word)
```

`word` exists only inside that function.

---

## 16. `return` vs `print`

This is one of the most important beginner ideas.

### `print()`
`print()` shows something on the screen.

```python
def add_and_print():
    print(2 + 3)
```

### `return`
`return` sends a value back.

```python
def add_and_return():
    return 2 + 3
```

### Compare them

```python
def greet_print():
    print("Hello")

def greet_return():
    return "Hello"

result = greet_return()
print(result)
```

### Big idea
- use `print()` when you want to display something
- use `return` when you want to give a result back to the rest of the program

### Early return
A function stops immediately when it reaches `return`.

```python
def check_number(num):
    if num < 0:
        return "negative"
    return "zero or positive"
```

Once a `return` runs, the function ends.

---

## 17. Scope

**Scope** means where a variable can be used.

### Local scope
Variables created inside a function belong only to that function.

```python
def show_score():
    score = 100
    print(score)
```

You cannot use `score` outside that function:

```python
show_score()
print(score)   # error
```

### Example of local vs outside

```python
name = "Jamie"

def greet():
    message = "Hello"
    print(message, name)
```

Here:
- `message` is local to the function
- `name` was made outside the function

For now, the safest beginner habit is:
- create values you need inside the function
- or pass them in later when you learn parameters

---

## 18. Comments

Comments are notes for humans.

Python ignores them.

```python
# This calculates the area of a rectangle
length = 10
width = 4
area = length * width
```

Use comments to explain:
- what a section does
- why you wrote something
- what you want to remember later

---

## 19. Common Patterns You’ll Reuse

### Ask for a name

```python
name = input("Enter your name: ")
print("Hello,", name)
```

### Ask for two numbers and add them

```python
num1 = float(input("First number: "))
num2 = float(input("Second number: "))
total = num1 + num2
print("Total:", total)
```

### Calculate hours and leftover minutes

```python
minutes = 145
hours = minutes // 60
leftover_minutes = minutes % 60
print(hours, leftover_minutes)
```

### Create and call a function

```python
def welcome():
    print("Welcome to class!")

welcome()
```

### Return a value from a function

```python
def square(number):
    return number * number

result = square(4)
print(result)
```

---

## 20. Super Common Beginner Mistakes

### Forgetting quotes around text

Wrong:

```python
print(hello)
```

Right:

```python
print("hello")
```

### Mixing text and numbers incorrectly

Wrong:

```python
age = 15
print("Age: " + age)
```

Better:

```python
age = 15
print("Age:", age)
```

### Forgetting to convert `input()`

Wrong:

```python
num = input("Enter a number: ")
print(num + 1)
```

Right:

```python
num = int(input("Enter a number: "))
print(num + 1)
```

### Using `=` when you mean “is equal to”

For now, remember:
- `=` assigns a value to a variable
- later you’ll likely learn `==` for comparison

### Bad indentation in functions

Wrong:

```python
def greet():
print("Hello")
```

Right:

```python
def greet():
    print("Hello")
```

---

## 21. Mini Vocabulary List

- `print()`: displays output
- variable: a named place to store a value
- string: text in quotes
- integer: whole number
- float: decimal number
- operator: symbol like `+`, `-`, `*`, `/`
- expression: code that produces a value
- function: reusable block of code
- `def`: keyword used to define a function
- `return`: sends a value back from a function
- scope: where a variable is available
- `input()`: gets text typed by the user
- traceback: Python’s error report
- modulo `%`: remainder after division
- floor division `//`: whole-number quotient

---

## 22. Quick Reference

### Output

```python
print("Hello")
print(5)
print("Age:", 14)
```

### Variables

```python
name = "Mia"
age = 16
price = 2.99
```

### Math

```python
+   add
-   subtract
*   multiply
/   divide
//  floor divide
%   remainder
```

### Input

```python
name = input("Name: ")
age = int(input("Age: "))
price = float(input("Price: "))
```

### Functions

```python
def say_hi():
    print("Hi")

def add(a, b):
    return a + b
```

---

## 23. Practice Questions

Try these on your own:

1. Write a program that prints your name and favorite hobby.
2. Make two variables for two test scores and print their average.
3. Ask the user for their age and print what their age will be next year.
4. Use `//` and `%` to turn `200` minutes into hours and leftover minutes.
5. Write a function that prints `"Good job!"`.
6. Write a function that returns the result of multiplying two numbers.
7. Create a bug on purpose and practice reading the traceback.

---

## 24. Study Tips

- Type code yourself instead of only reading it.
- Change one thing at a time and rerun it.
- When confused, print your variables.
- Read errors slowly. The last line is often the most helpful.
- Focus on understanding small examples first.
- Repetition matters a lot in programming.

---

## 25. One-Page Summary

If you remember only the basics, remember these:

```python
print("text")              # show output
name = "Ava"               # store text
score = 10                 # store number
total = 4 + 5              # do math
7 / 2                      # 3.5
7 // 2                     # 3
7 % 2                      # 1
round(4.567, 2)            # 4.57
user = input("Name: ")     # gets text
age = int(input("Age: "))  # gets whole number

def greet():
    print("Hello")

def add(a, b):
    return a + b
```

---

## 26. Space for Your Own Notes

Add your own examples here:

```python
# Write examples from class here
```
