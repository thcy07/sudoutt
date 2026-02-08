# SudoUTT – Sudoku Ultimate Tic-Tac-Toe (Web App)

SudoUTT is a two-player, web-based strategy game that combines the rules of Sudoku with the forced-move mechanics of Ultimate Tic-Tac-Toe. Players take turns placing numbers on a 9×9 Sudoku grid while following Sudoku constraints (no repeated numbers in rows, columns, or 3×3 subgrids). Each move also determines the subgrid in which the opposing player must play next. The game dynamically tracks player turns, validates moves, updates scores, and renders the board in real time using a full-stack JavaScript architecture.

---

## Instructions for Build and Use

### Steps to build and/or run the software

1. Clone the project repository to your local machine.
2. Navigate to the backend directory and install dependencies:\
`npm install`\
`npm run dev`
3. In a separate terminal, navigate to the frontend directory and install dependencies:\
`npm install`\
`npm run dev`

4. Open a browser and navigate to the frontend URL (typically `http://localhost:5173`).

---

### Instructions for using the software

1. View the current player, available numbers, and forced board displayed at the top of the page.
2. Enter a move using the form by specifying:

- Row (A–I)
- Column (1–9)
- Value (1–9)

3. Click **Play Move** to submit the move.
2. The board, scores, and turn indicator update automatically.
3. Use the **Reset** button to restart the game at any time.

---

## Development Environment

To recreate the development environment, the following software and libraries are required:

- Node.js (v18+)
- npm (v9+)
- React (via Vite)
- Vite (latest)
- Express.js
- JavaScript (ES6+)
- HTML5 / CSS3
- Visual Studio Code (recommended)

---

## Useful Websites to Learn More

The following resources were helpful in developing this project:

- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [Express.js Documentation](https://expressjs.com/)
- [MDN Web Docs – CSS Grid](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Grid_Layout)
- [MDN Web Docs – Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)

---

## Future Work

The following features and improvements are planned for future development:

- [X] Add click-to-select cell input instead of manual form entry
- [X] Implement live score previews before the game ends
- [ ] Add AI opponent support for single-player mode
- [ ] Store game state using a database (SQLite or MongoDB)
- [ ] Improve mobile responsiveness and touch input
