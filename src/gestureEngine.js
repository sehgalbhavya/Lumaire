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
}

export const gestureEngine = new GestureEngine();
