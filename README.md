# HTML Game Experiment

A simple grayscale pixel platformer game built with HTML, CSS, and JavaScript. Jump between platforms, collect items, and explore endlessly to the right!

## Demo

![Game Demo](Demo.png)

## How to Play

- **Controls**: Use arrow keys or WASD to move left/right and jump (spacebar or up arrow/W).
- **Objective**: Collect gray items to increase your point. Avoid falling off the screen.
- **Gameplay**: The camera follows you right, with no backtracking allowed. Platforms and items generate procedurally.

## Running the Game

1. Clone or download the repository.
2. Open `index.html` directly in a web browser, or run a local server for better experience:
   ```bash
   python -m http.server 8000
   ```
3. Visit `http://localhost:8000` in your browser.

## Features

- Physics-based movement with gravity and collision detection
- Infinite side-scrolling terrain generation
- Responsive full-screen design
- Grayscale aesthetic with Montserrat font
- Point tracking
- Animated player spinning in air and bouncing collectibles

## Technologies Used

- HTML5 Canvas for rendering
- Vanilla JavaScript for game logic
- CSS for styling

Enjoy the game! Feel free to contribute or modify.