# ✨ PUYO PUYO AMAZING EDITION ✨

> A fully polished, playable web-based Puyo Puyo game — open `index.html` and play instantly! No installs, no servers, no dependencies.

---

## 🎮 How to Play

1. **Open `index.html`** in any modern browser
2. Choose **Endless Mode** (solo, beat your high score) or **VS CPU** (battle the AI!)
3. Connect **4 or more** same-colored Puyos to pop them — chain reactions = massive points!

---

## 🕹️ Controls

| Key | Action |
|-----|--------|
| ← → | Move piece left/right |
| ↓ | Soft drop |
| ↑ or Space | Hard drop |
| Z | Rotate counter-clockwise |
| X | Rotate clockwise |
| Escape | Pause / Resume |

---

## ✨ Features

- **Classic 6×12 Puyo Puyo grid** with full chain reaction system
- **Cute Puyo blobs** with eyes, highlights, and connection sprites that merge neighbors
- **Ghost piece** showing where your piece will land
- **Chain combos** — pop groups create cascades with escalating multipliers
- **Garbage Puyo system** — chains send nuisance Puyos to your opponent
- **VS CPU Mode** with 3 difficulty levels (Easy / Medium / Hard)
- **Squash & stretch animations** on landing
- **Particle explosions** on every pop
- **Screen shake** that intensifies with chain length
- **Chain popup** with dramatic scaling text ("2 CHAIN!", "3 CHAIN!"…)
- **ALL CLEAR** bonus when you empty the board
- **Synthesized audio** via Web Audio API — pops, chains, landing thuds, chiptune BGM
- **High score tracking** via localStorage
- **Increasing speed** — levels up every 10 clears
- **Title screen**, pause menu, and game over screen with final score

---

## 🚀 Running the Game

```bash
# Just open it in your browser!
open index.html
```

Or drag `index.html` into any browser window.  
Works in Chrome, Firefox, Safari, Edge — no build tools needed.

---

## 📁 File Structure

```
├── index.html   # Game layout & screens
├── style.css    # Vibrant styles, animations, UI polish
├── game.js      # Complete game engine (pure JS, no frameworks)
└── README.md    # This file
```

---

## 🏆 Scoring (Classic Puyo Puyo Tsu Formula)

```
Score = 10 × Puyos_Cleared × (Chain_Power + Color_Bonus + Group_Bonus)
```

- Longer chains multiply your power exponentially
- Clearing multiple colors at once adds a color bonus
- Bigger groups (5+) add a group bonus

---

## 🤖 CPU AI

The CPU opponent uses a board evaluation algorithm that:
- Builds groups to set up chain reactions
- Adapts to your attack (offsets garbage with its own chains)
- Gets faster and smarter on Medium/Hard difficulty

---

*Made with ❤️ using pure HTML5 Canvas + Web Audio API*
