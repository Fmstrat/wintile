Gnome.org requires that extensions have roughly the same styles.  

Here are a few important ones and their explanations.<br>
**NOTE: This doc is best viewed in markdown and not as plaintext**
1.  Statements must end a semicolon (even if it runs properly without it)
1.  Lines must not have any extra space at the end (including blank lines)
1.  Use 4 spaces instead of tabs
3.  Switch statements and their cases must be at the same indent level
    ```javascript
    // good
    switch (direction) {
    case 'left':
        doStuff();
    }
    
    // bad
    switch (direction) {
        case 'left':
            doStuff();
    }
        
    ```
1.  If statements and their curly braces must have a space between them
1.  If statements and their else block that only have a single command must not be surrounded with curly braces.
    ```javascript
    // good
    if ( user.age > 21 )
        user.canDrink = true;
    
    // bad
    if ( user.age > 18 ) {
        user.canSmoke = true;
    }
    ```
1.  Multi-line objects must have a trailing comma as if there was another element
    ```javascript
    var goodObject = {
        firstElement: 1, // <--- trailing comma
    };
    
    var badObject = {
        onlyElement: 1
    }
    ```
1.  Use camelCase names instead of snake_case_names
    ```javascript
    var goodName; // good
    var bad_name; // bad
    ```
1.  Strings MUST be single quoted
    ```javascript
    var blah = 'I\'m a single quoted string'; // good
    var blah = "I'm a double quoted string"; // bad 
    ```
1.  Use backtick interpolation instead of concatenation
    ```javascript
    var builtString = `Hello, ${useName}!`; // good
    var concatString = 'Hello, ' + userName + '!'; // bad
    ```
1.  Functions must have jsdoc strings that give the variable name, type, and explanation for EACH variable
    ```javascript
    // good example
    /**
     *
     * @param {object} app - the window object
     * @param {number} x - desired x value
     * @param {number} y - desired y value
     * @param {number} w - desired width
     * @param {number} h - desired height
     */
    function moveAppCoordinates(app, x, y, w, h) {
    .....

    ```
1.  Comparisons must use 3 signs instead of 2. ( === and !== instead of == and != )
    ```javascript
    // good
    log( firstName === 'Weadababy' );
    
    // bad
    log( lastName == 'Eetzaboi' );

It's highly suggested that you lint your code with the .eslintrc.yml we included in the base of the repo with the `--fix` option before submitting Pull requests.
Pull requests that fail the lint test will not be accepted and must be fixed before consideration.

I also suggest adding this .git/hooks/pre-commit to your copy of the repo.
```bash
#!/bin/bash
cd "$(git rev-parse --show-toplevel)"
ESLINT="node_modules/.bin/eslint"
pwd

if [[ ! -x "$ESLINT" ]]; then
  printf "\t\033[41mPlease install ESlint\033[0m (npm install eslint)\n"
  exit 1
fi

STAGED_FILES=($(git diff --cached --name-only --diff-filter=ACM | grep ".jsx\{0,1\}$"))

echo "ESLint'ing ${#STAGED_FILES[@]} files"

if [[ "$STAGED_FILES" = "" ]]; then
  exit 0
fi

$ESLINT "${STAGED_FILES[@]}" --fix

ESLINT_EXIT="$?"

# Re-add files since they may have been fixed
git add "${STAGED_FILES[@]}"

if [[ "${ESLINT_EXIT}" == 0 ]]; then
  printf "\n\033[42mCOMMIT SUCCEEDED\033[0m\n"
else
  printf "\n\033[41mCOMMIT FAILED:\033[0m Fix eslint errors and try again\n"
  exit 1
fi

exit $?
```
