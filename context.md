## 1. System Overview

The system consists of four major engines:

1.  **Gesture Engine**
    - Reads hand landmarks from MediaPipe Hands.\
    - Extracts gestures: pinch, open, fist, row selection, two-hand
      distance, two-hand rotation.\
    - Applies smoothing, debouncing, and mode-based filtering.
2.  **State Engine**
    - Central store (e.g., `getState`, `setState`, `subscribe`).\
    - Holds:
      - beatGrid\
      - tempo\
      - isPlaying\
      - currentStep\
      - selectedRow\
      - selectedColumn\
      - mode\
    - Gesture Engine writes into State Engine; other engines read from
      it.
3.  **Audio Engine**
    - 16-step (or 8/32-step) sequencer.\
    - Row → instrument mapping (kick, snare, hi-hat, clap, etc.).\
    - Responds to state changes: `beatGrid`, `tempo`, `isPlaying`.\
    - Plays samples using Tone.js-like scheduler.
4.  **Visual Engine**
    - 2D grid (MVP) → 3D grid (Three.js).\
    - Renders beatGrid state, selected cell, playhead, hand cursors.\
    - HUD for tempo, mode, effect value, playback state.

---

## 2. Gesture Definitions

### 2.1. Right-Hand Gestures

- **Pinch** → Toggle cell (row, column).\
- **Open / Fist** → Used for play/stop or mode switching.\
- **Right-hand XY position** → Selects column in grid.

### 2.2. Left-Hand Gestures

- **Vertical Y position** → Selects instrument row.\
- **Open / Fist** → May be used for secondary mode input.

### 2.3. Two-Hand Gestures

- **Distance between hands** → Controls tempo when in Tempo Mode.\
- **Angular rotation** → Controls effect (e.g., filter cutoff) in
  Effects Mode.

---

## 3. Modes

System has mutually exclusive modes:

- **Edit Mode**
  - Pinch toggles beat cells.\
  - Left-hand vertical selects row.\
  - Right-hand horizontal selects column.
- **Tempo Mode**
  - Two-hand distance → BPM.\
  - Clamped range (e.g., 80--160 BPM).\
  - Smoothing required.
- **Effects Mode**
  - Two-hand angular rotation → effect parameter.\
  - Requires stable angle tracking and smoothing.

Mode changes should use protected "control zones" or specific gesture
combos to avoid accidental switching.

---

## 4. State Engine Requirements

The store should contain:

```text
beatGrid: boolean[][]
tempo: number
isPlaying: boolean
currentStep: number
selectedRow: number
selectedColumn: number
mode: "edit" | "tempo" | "effects"
```

Features: - Subscribable reactive updates. - Batched or throttled calls
recommended. - All engines must **read** from state; only Gesture Engine
and UI interactions should **write** to state.

---

## 5. Audio Engine Requirements

- Implements a step sequencer:
  - Schedules sounds at each step.
  - Reads `beatGrid[row][step]`.
- Syncs to global tempo.\
- Uses sample-based instruments.\
- Must remain timing-accurate regardless of frame rate.\
- `isPlaying` controls transport.

Key principle: **Audio timing must never depend on rendering frame
rate.**

---

## 6. Visual Engine Requirements

### 6.1. 2D (Early Development)

- Grid of rows × steps.\
- Highlight:
  - Selected row
  - Selected column
  - Active beats
  - Current step\
- Debug overlays for gesture logs.

### 6.2. 3D (Later Development)

- 3D tiles for each cell.\
- Tile state → color/height/brightness.\
- Hand cursors mapped to 3D plane.\
- HUD elements:
  - Tempo readout
  - Mode indicator
  - Effect parameter
  - Transport state

---

## 7. Hand Tracking Pipeline

1.  Webcam → MediaPipe Hands → raw landmarks.\
2.  Landmark normalization and filtering.\
3.  Gesture descriptors:
    - thumb--index distance\
    - finger curl\
    - palm openness\
    - hand vertical/horizontal position\
    - inter-hand distance\
    - inter-hand angle\
4.  Debounced gesture events.\
5.  State Engine updates.

Keep this pipeline deterministic and centralized.

---

## 8. Interaction Rules

### Edit Mode

- **Left-hand Y → selectedRow**\
- **Right-hand X → selectedColumn**\
- **Right-hand pinch (rising edge)** → toggle beat cell

### Tempo Mode

- Two-hand distance → tempo\
- Apply smoothing and clamp values\
- Only active while in Tempo Mode

### Effects Mode

- Two-hand angular movement → effectAmount\
- Display effect value visually

---

## 9. Reliability & Debouncing Requirements

- Pinch: detect rising-edge transitions only.\
- Play/stop: require hand in control zone + gesture stability.\
- Mode switching: require time-based cooldown.\
- Smoothing:
  - Positions → low-pass\
  - Distance/angle → moving average\
  - BPM → damped easing behavior

---

## 10. User Experience Guidelines

- Provide constant visual feedback for:
  - Detected gestures\
  - Modes\
  - Row/column selection\
  - Tempo\
  - Effects\
  - Playhead position\
- Avoid tiny interaction zones.\
- Assume users will move imprecisely.

---

## 11. Development Strategy (Anti-Gravity Workflow)

- Work on subsystems in isolation.\
- Write natural-language change requests describing:
  - Inputs\
  - Outputs\
  - State changes\
  - Edge cases\
- Explicitly instruct Anti-Gravity:
  - What not to modify\
  - What to log

Example: "Do not modify the audio engine. Only update the gesture engine
to expose a smoothed pinch signal and log it in the debug panel."

---

## 12. Integration Sequence

1.  Video feed + MediaPipe\
2.  Raw landmarks → gesture extraction\
3.  State Engine\
4.  2D UI grid\
5.  Audio Engine (basic)\
6.  Gesture → beat editing\
7.  Play/stop controls\
8.  Tempo mode\
9.  Effects mode\
10. Three.js visuals\
11. Debug HUD + refinements

---

## 13. Completion Criteria

- Fully functional gesture-based beat creation.\
- Real-time audio playback.\
- 3D grid visualization synced to audio.\
- Stable gestures with smoothing and debouncing.\
- Ability to edit beats, control tempo, and apply effects without
  physical controllers.

---

This document is optimized to serve as a **contextual, always-loaded
project reference** inside Anti-Gravity.
