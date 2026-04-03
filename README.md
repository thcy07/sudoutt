# SudoUTT – Sudoku Ultimate Tic-Tac-Toe (Web App)

SudoUTT is a two-player, web-based strategy game that combines the rules of Sudoku with the forced-move mechanics of Ultimate Tic-Tac-Toe. Players create accounts, start a game, and invite a friend via a shareable link. On each turn, a player places one of their drawn numbers on the 9×9 grid while following Sudoku constraints (no repeated numbers in rows, columns, or 3×3 subgrids). Each placement also determines the subgrid in which the opposing player must play next. The game tracks scores in real time, persists state in MongoDB, and uses JWT-based authentication for secure multiplayer sessions.

---

## Instructions for Build and Use

### Steps to build and/or run the software

1. Clone the project repository to your local machine.
2. Create a `.env` file in the backend directory with the following variables:

   ```
   MONGO_URI=mongodb://localhost:27017/sudoutt
   JWT_SECRET=your_secret_here
   PORT=3001
   ```

3. Navigate to the backend directory and install dependencies:

   ```
   npm install
   npm run dev
   ```

4. In a separate terminal, navigate to the frontend directory and install dependencies:

   ```
   npm install
   npm run dev
   ```

5. Open a browser and navigate to the frontend URL (typically `http://localhost:5173`).

---

### Instructions for using the software

1. **Sign up or log in** with a username and password on the auth screen.
2. **Create a game** from the lobby and copy the shareable link.
3. **Send the link** to a friend — they log in and join via the link.
4. On your turn, **click a cell** on the board to select it, then **click a number** from your hand to place it.
5. The board indicator shows which 3×3 subgrid your opponent must play in next.
6. Scores update live — points are awarded for majority control of rows, columns, and boxes.
7. The game ends when all 81 cells are filled; the player with the most points wins.

---

## Development Environment

To recreate the development environment, the following software and libraries are required:

- Node.js (v18+)
- npm (v9+)
- MongoDB (local or Atlas)
- React (via Vite)
- Vite (latest)
- Express.js
- Mongoose
- bcryptjs
- jsonwebtoken
- zod
- JavaScript (ES6+)
- HTML5 / CSS3
- Visual Studio Code (recommended)

---

## Useful Websites to Learn More

The following resources were helpful in developing this project:

- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [Express.js Documentation](https://expressjs.com/)
- [Mongoose Documentation](https://mongoosejs.com/docs/)
- [MDN Web Docs – Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [MDN Web Docs – Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)

---

## Future Work

The following features and improvements are planned for future development:

- [X] Add click-to-select cell input instead of manual form entry
- [X] Implement live score previews before the game ends
- [X] Store game state using a database (MongoDB)
- [X] Add multiplayer support with JWT authentication
- [ ] Add AI opponent support for single-player mode
- [ ] Add real-time sync via WebSockets (currently uses polling)
- [ ] Improve mobile responsiveness and touch input
