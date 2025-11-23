# 🎶 Project Plan — Gesture-Based Music Creation System (with Three.js + MediaPipe + Tone.js)

## 📌 Project Overview

**Goal:**  
Build a web-based beat-creation system where users generate and manipulate music using **two-hand gestures**, powered by:

- **MediaPipe Hands** → gesture recognition  
- **Tone.js** → audio sequencing & effects  
- **Three.js** → visual 3D beat grid & feedback  

**Core Interactions:**  
- Right hand → toggles beats on a 3D grid  
- Left hand → selects instrument row  
- Two hands → tempo, effects, mode switching  

---

## 📆 High-Level Timeline (4 Weeks)

| Week       | Focus Area                     | Deliverables                                           |
| ---------- | ------------------------------ | ------------------------------------------------------ |
| **Week 1** | Hand tracking + basic UI       | Pinch detection, left-hand row switching, initial grid |
| **Week 2** | Beat grid + audio engine       | Tone.js sequencer, beat toggling, playback             |
| **Week 3** | Three.js visuals + effects     | 3D grid, tempo gestures, filter sweep                  |
| **Week 4** | Refinement + Evaluation + Demo | UX polish, user tests, final presentation              |

---

# 🧭 DETAILED PROJECT PLAN

## **Week 1 — Gestures + Core Architecture**

### 🎯 Goal:  
Get input pipeline working (MediaPipe → gesture logic → system state).

### Tasks

#### **1. Hand Tracking Setup**
- Integrate MediaPipe Hands  
- Extract: 21 landmarks, handedness, smoothed positions

#### **2. Gestures (MVP)**
- Pinch detection  
- Open hand vs fist  
- Left-hand vertical row selection  

#### **3. System Architecture**
Define:

- gestureEngine  
- stateStore  
- audioEngine  
- visualEngine  

#### **4. Basic UI (2D)**
- Simple 4×8 grid  
- Left-hand cursor  
- Right-hand pointer  

---

## **Week 2 — Beat Sequencer + Interactions**

### 🎯 Goal:  
Make the system actually *create sound*.

### Tasks
- Load drum samples  
- Create 16-step sequencer  
- Toggle beats using pinch  
- Play/stop via hand gestures  
- Simple visual sequencing  

---

## **Week 3 — Three.js Integration + Effects + Tempo**

### 🎯 Goal:  
Replace 2D visuals with a 3D interface.

### Tasks
- Build 3D scene  
- Create 3D beat grid  
- Add 3D hand cursors  
- Two-hand distance → tempo  
- Two-hand circular gesture → filter sweep  

---

## **Week 4 — Polishing, User Testing, Demo Prep**

### Tasks
- Smoothing, debouncing, reduce jitter  
- Add animations and mode indicators  
- Conduct HCI user test  
- Create demo video and slides  

---

# 🧩 Team Roles

| Member | Role |
|--------|------|
| A | Gesture Recognition Lead |
| B | Audio & Sequencer Lead |
| C | Three.js Visual Lead |
| D | Integration, UX & Evaluation |

---

# 🟩 Minimal Core for Guaranteed Success

- Basic beat grid  
- Gesture toggling  
- Sequencer playback  
- Tempo control  
- One audio effect  
- Simple 3D visuals  
