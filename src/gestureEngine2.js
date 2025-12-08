import { stateStore } from './stateStore';

export class GestureEngine {
    constructor() {
        this.pinchThreshold = 0.05;
        this.lastPinchState = { Left: { index: false, middle: false }, Right: { index: false, middle: false } };
        this.lastVolumes = { Left: 50, Right: 50 }; // percent 0-100
        this.lastClapTime = 0;
        this.lastCrossfade = 50; // 0 = Track A, 100 = Track B

        // Crop edges to avoid exact 0%/100% (reduce sensitivity at extremes).
        // Value is fraction of the frame to ignore on each side (e.g. 0.05 = 5% margin).
        this.edgeCrop = 0.2;
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

            // Precompute cropping helpers
            const crop = this.edgeCrop;
            const usableRange = Math.max(0.001, 1 - crop * 2); // avoid div by zero

            // 3. Volume control via pinching up/down (index pinch controls volume)
            let volumePercent = this.lastVolumes[label] ?? 50;
            if (pinches.index) {
                const indexTip = landmarks[8];
                // clamp into [edgeCrop, 1-edgeCrop]
                const clampedY = Math.max(crop, Math.min(1 - crop, indexTip.y));
                // normalized within usable range (0..1), where top => 1
                const normalized = (clampedY - crop) / usableRange;
                const inverted = 1 - normalized;
                const computed = Math.round(inverted * 100);
                const prev = this.lastVolumes[label] ?? computed;
                volumePercent = Math.round(prev * 0.2 + computed * 0.8);
                this.lastVolumes[label] = volumePercent;
            }

            // 4. Crossfader: use RIGHT hand index pinch + horizontal movement
            // left (x=crop) => Track A (0%), right (x=1-crop) => Track B (100%)
            let crossfadePercent = this.lastCrossfade;
            if (label === 'Right' && pinches.index) {
                const indexTip = landmarks[8];
                const clampedX = Math.max(crop, Math.min(1 - crop, indexTip.x));
                const normalizedX = (clampedX - crop) / usableRange;
                const computedX = Math.round(normalizedX * 100);
                const prevX = this.lastCrossfade ?? computedX;
                crossfadePercent = Math.round(prevX * 0.2 + computedX * 0.8);
                this.lastCrossfade = crossfadePercent;
            }

            // 5. Logic Mapping
            if (label === 'Left') {
                this.handleRowSelection(landmarks);
            }

            // Store data for visualization
            handsData.push({
                label,
                landmarks,
                gesture,
                pinches, // { index: bool, middle: bool }
                volumePercent,
                crossfadePercent: label === 'Right' ? crossfadePercent : undefined
            });

            // Update pinch states and log events
            if (!this.lastPinchState[label]) {
                this.lastPinchState[label] = { index: false, middle: false };
            }

            if (pinches.index && !this.lastPinchState[label].index) {
                console.log(`${label} Hand Index Pinch Detected — starting volume control at ${volumePercent}%`);
                if (label === 'Right') console.log(`Crossfade start: ${this.lastCrossfade}%`);
            } else if (pinches.index && this.lastPinchState[label].index) {
                // ongoing pinch -> report volume/crossfade
                console.log(`${label} Volume: ${volumePercent}%`);
                if (label === 'Right') console.log(`Crossfade: ${crossfadePercent}%`);
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
