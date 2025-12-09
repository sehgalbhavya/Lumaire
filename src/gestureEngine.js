import { stateStore } from './stateStore';
import { audioEngine } from './audioEngine';

export class GestureEngine {
    constructor() {
        this.pinchThreshold = 0.05;
        this.lastPinchState = { Left: { index: false, middle: false }, Right: { index: false, middle: false } };

        // Control state tracking for each hand
        this.controlState = {
            // Right hand: Master volume control
            Right: { isPinching: false, startY: 0, startValue: 0, hasMoved: false },
            // Left hand: Crossfader control
            Left: { isPinching: false, startX: 0, startValue: 0, hasMoved: false }
        };

        // Sensitivity settings
        this.volumeSensitivity = 0.3;  // For master volume (vertical movement)
        this.crossfaderSensitivity = 0.5;  // For crossfader (horizontal movement)

        // Minimum movement threshold to distinguish tap from drag
        this.movementThreshold = 0.03;
    }

    process(results) {
        if (!results.multiHandLandmarks || !results.multiHandedness) return [];

        const handsData = [];
        const state = stateStore.getState();

        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const classification = results.multiHandedness[i];

            // Swap labels because of mirrored video
            const rawLabel = classification.label;
            const label = rawLabel === 'Left' ? 'Right' : 'Left';

            // 1. Pinch Detection
            const pinches = this.detectPinches(landmarks);

            // 2. Open vs Fist
            const gesture = this.detectHandPose(landmarks);

            // Get control state for this hand
            const controlState = this.controlState[label];

            // Store data for visualization
            handsData.push({
                label,
                landmarks,
                gesture,
                pinches,
                isControlling: controlState.isPinching && controlState.hasMoved,
                controlType: label === 'Right' ? 'Master Volume' : 'Crossfader'
            });

            // Update pinch states
            if (!this.lastPinchState[label]) {
                this.lastPinchState[label] = { index: false, middle: false };
            }

            // Debug logging for pinches
            if (pinches.index && !this.lastPinchState[label].index) {
                console.log(`${label} Hand Index Pinch Started`);
            }

            // =============================================
            // HAND-SPECIFIC CONTROLS
            // =============================================
            if (label === 'Right') {
                // RIGHT HAND: Play/Pause (tap) + Master Volume (drag up/down)
                this.handleRightHandGesture(landmarks, pinches);
            } else {
                // LEFT HAND: Crossfader control (drag left/right)
                this.handleLeftHandGesture(landmarks, pinches);
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

    /**
     * RIGHT HAND CONTROLS:
     * - Quick pinch (tap) = Toggle Play/Pause for ALL tracks
     * - Pinch + UP/DOWN = Master Volume control
     */
    handleRightHandGesture(landmarks, pinches) {
        const state = stateStore.getState();
        const controlState = this.controlState.Right;
        const isPinching = pinches.index;

        // Get current hand Y position (use wrist for stability)
        const currentY = landmarks[0].y;

        // =============================================
        // PINCH STARTED
        // =============================================
        if (isPinching && !controlState.isPinching) {
            controlState.isPinching = true;
            controlState.startY = currentY;
            controlState.startValue = state.masterVolume;
            controlState.hasMoved = false;
            console.log(`Right Hand: Pinch Started - Y: ${currentY.toFixed(3)}, Master Vol: ${(state.masterVolume * 100).toFixed(0)}%`);
        }
        // =============================================
        // PINCH HELD - Check for master volume control
        // =============================================
        else if (isPinching && controlState.isPinching) {
            const deltaY = currentY - controlState.startY;
            const absDeltaY = Math.abs(deltaY);

            if (absDeltaY > this.movementThreshold) {
                controlState.hasMoved = true;

                // Calculate volume change (up = increase, down = decrease)
                const volumeChange = -deltaY / this.volumeSensitivity;
                let newVolume = controlState.startValue + volumeChange;
                newVolume = Math.max(0, Math.min(1, newVolume));

                audioEngine.setMasterVolume(newVolume);
            }
        }
        // =============================================
        // PINCH RELEASED
        // =============================================
        else if (!isPinching && controlState.isPinching) {
            controlState.isPinching = false;

            if (!controlState.hasMoved) {
                // TAP = Toggle Play/Pause for ALL tracks
                console.log(`Right Hand: Tap Detected - Toggling ALL tracks Play/Pause`);
                audioEngine.toggleAllTracks();
            } else {
                // Movement occurred, it was master volume control
                const finalVolume = stateStore.getState().masterVolume;
                console.log(`Right Hand: Master Volume set to ${(finalVolume * 100).toFixed(0)}%`);
            }

            controlState.hasMoved = false;
        }
    }

    /**
     * LEFT HAND CONTROLS:
     * - Pinch + MOVE (horizontal or vertical) = Crossfader control
     * - 0% = Track A only, 50% = Both, 100% = Track B only
     */
    handleLeftHandGesture(landmarks, pinches) {
        const state = stateStore.getState();
        const controlState = this.controlState.Left;
        const isPinching = pinches.index;

        // Use Y position for crossfader (up = Track A, down = Track B)
        // This is more natural for the gesture
        const currentY = landmarks[0].y;

        // =============================================
        // PINCH STARTED
        // =============================================
        if (isPinching && !controlState.isPinching) {
            controlState.isPinching = true;
            controlState.startY = currentY;
            controlState.startValue = state.crossfaderPosition;
            controlState.hasMoved = false;
            console.log(`Left Hand: Pinch Started - Crossfader: ${(state.crossfaderPosition * 100).toFixed(0)}%`);
        }
        // =============================================
        // PINCH HELD - Crossfader control
        // =============================================
        else if (isPinching && controlState.isPinching) {
            const deltaY = currentY - controlState.startY;
            const absDeltaY = Math.abs(deltaY);

            if (absDeltaY > this.movementThreshold) {
                controlState.hasMoved = true;

                // Moving DOWN = towards Track B (increase crossfader)
                // Moving UP = towards Track A (decrease crossfader)
                const crossfaderChange = deltaY / this.crossfaderSensitivity;
                let newPosition = controlState.startValue + crossfaderChange;
                newPosition = Math.max(0, Math.min(1, newPosition));

                audioEngine.setCrossfaderPosition(newPosition);
            }
        }
        // =============================================
        // PINCH RELEASED
        // =============================================
        else if (!isPinching && controlState.isPinching) {
            controlState.isPinching = false;

            if (controlState.hasMoved) {
                const finalPosition = stateStore.getState().crossfaderPosition;
                let description;
                if (finalPosition < 0.25) {
                    description = 'Track A';
                } else if (finalPosition > 0.75) {
                    description = 'Track B';
                } else {
                    description = 'Both Tracks';
                }
                console.log(`Left Hand: Crossfader set to ${(finalPosition * 100).toFixed(0)}% (${description})`);
            }

            controlState.hasMoved = false;
        }
    }
}

export const gestureEngine = new GestureEngine();
