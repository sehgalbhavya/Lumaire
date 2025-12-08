import { stateStore } from './stateStore';

export class GestureEngine {
    constructor() {
        this.pinchThreshold = 0.05;
        this.lastPinchState = { Left: { index: false, middle: false }, Right: { index: false, middle: false } };
    }

    process(results) {
        if (!results.multiHandLandmarks || !results.multiHandedness) return [];

        const handsData = [];

        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const classification = results.multiHandedness[i];

            // Swap labels because of mirrored video
            const rawLabel = classification.label;
            const label = rawLabel === 'Left' ? 'Right' : 'Left';

            // 1. Pinch Detection (Index and Middle)
            const pinches = this.detectPinches(landmarks);

            // 2. Open vs Fist
            const gesture = this.detectHandPose(landmarks);

            // 3. Logic Mapping
            if (label === 'Left') {
                this.handleRowSelection(landmarks);
            } else if (label === 'Right') {
                this.handleColumnSelection(landmarks);
            }

            // Store data for visualization
            handsData.push({
                label,
                landmarks,
                gesture,
                pinches // { index: bool, middle: bool }
            });

            // Update pinch states
            // Initialize if not exists
            if (!this.lastPinchState[label]) {
                this.lastPinchState[label] = { index: false, middle: false };
            }

            // Handle Right Hand Index Pinch -> Toggle Beat
            if (label === 'Right' && pinches.index && !this.lastPinchState[label].index) {
                console.log(`${label} Hand Index Pinch Detected - Toggling Beat`);
                this.toggleBeat();
            }

            if (pinches.index && !this.lastPinchState[label].index) {
                console.log(`${label} Hand Index Pinch Detected`);
            }
            if (pinches.middle && !this.lastPinchState[label].middle) {
                console.log(`${label} Hand Middle Pinch Detected`);
            }

            this.lastPinchState[label] = pinches;
        }
        return handsData;
    }

    toggleBeat() {
        const state = stateStore.getState();
        const { selectedRow, selectedColumn, beatGrid } = state;

        // Create a deep copy of the grid to avoid direct mutation
        const newGrid = beatGrid.map(row => [...row]);

        // Toggle the cell
        // Note: selectedColumn is 0-7 (8 cols), but sequencer is 16 steps.
        // We need to decide mapping. 
        // Option A: 8 cols = 8 steps (1 bar of 8th notes).
        // Option B: 8 cols = 16 steps (each col is 2 steps? No, that's confusing).
        // Option C: We just use the first 8 steps for now?
        // Let's assume 1 col = 1 step for now, so we only edit the first 8 steps.
        // OR, we can map 8 cols to 16 steps by using 2 pages, but let's keep it simple.
        // Let's map col 0-7 to step 0-7.

        // Wait, if we want 16 steps, we need 16 columns visually or a way to scroll.
        // Given "Simple 4x8 grid" in plan, maybe we only support 8 steps for MVP?
        // Or maybe each column represents 2 steps (16th notes)? 
        // Let's stick to 1:1 mapping for now. Col 0 = Step 0.

        newGrid[selectedRow][selectedColumn] = !newGrid[selectedRow][selectedColumn];

        stateStore.setState({ beatGrid: newGrid });
    }

    detectPinches(landmarks) {
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const middleTip = landmarks[12];

        const indexDistance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
        const middleDistance = Math.hypot(thumbTip.x - middleTip.x, thumbTip.y - middleTip.y);

        return {
            index: indexDistance < this.pinchThreshold,
            middle: middleDistance < this.pinchThreshold
        };
    }

    detectHandPose(landmarks) {
        const fingerTips = [8, 12, 16, 20];
        const fingerPIPs = [6, 10, 14, 18];
        const wrist = landmarks[0];

        let curledCount = 0;
        for (let i = 0; i < 4; i++) {
            const tip = landmarks[fingerTips[i]];
            const pip = landmarks[fingerPIPs[i]];

            const distTip = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
            const distPip = Math.hypot(pip.x - wrist.x, pip.y - wrist.y);

            if (distTip < distPip) {
                curledCount++;
            }
        }

        return curledCount >= 3 ? 'Closed' : 'Open';
    }

    handleRowSelection(landmarks) {
        const y = landmarks[5].y;
        const numRows = 4;
        const clampedY = Math.max(0, Math.min(1, y));
        const row = Math.floor(clampedY * numRows);
        const finalRow = Math.min(numRows - 1, row);

        const currentState = stateStore.getState();
        if (currentState.selectedRow !== finalRow) {
            stateStore.setState({ selectedRow: finalRow });
        }
    }

    handleColumnSelection(landmarks) {
        // Use Index Finger MCP (5) or Tip (8) for X position
        const x = landmarks[8].x;

        // Map x (0 to 1) to columns (0 to 7)
        // Note: x is normalized. 0 is left, 1 is right.
        // Since we mirror the video, 0 (left in video) is actually right side of screen?
        // Wait, MediaPipe coords: x increases from left to right of the IMAGE.
        // If we mirror the image, the visual left is image right (x=1).
        // So visual x = 1 - x.
        // Let's map visual x to columns.

        const visualX = 1 - x;
        const numCols = 8;
        const clampedX = Math.max(0, Math.min(1, visualX));
        const col = Math.floor(clampedX * numCols);
        const finalCol = Math.min(numCols - 1, col);

        const currentState = stateStore.getState();
        if (currentState.selectedColumn !== finalCol) {
            stateStore.setState({ selectedColumn: finalCol });
        }
    }
}

export const gestureEngine = new GestureEngine();
