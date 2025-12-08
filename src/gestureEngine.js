import { stateStore } from './stateStore';
import { audioEngine } from './audioEngine';

export class GestureEngine {
    constructor() {
        this.pinchThreshold = 0.05;
        this.lastPinchState = { Left: { index: false, middle: false }, Right: { index: false, middle: false } };

        // Volume control state - tracks pinch start position for volume adjustment
        this.volumeControlState = {
            Left: { isPinching: false, startY: 0, startVolume: 0, hasMoved: false },
            Right: { isPinching: false, startY: 0, startVolume: 0, hasMoved: false }
        };

        // Sensitivity: how much Y movement (0-1) changes volume
        // Lower value = more sensitive (less movement needed)
        this.volumeSensitivity = 0.3;

        // Minimum movement threshold to distinguish tap (play/pause) from drag (volume)
        // If movement is less than this, it's a tap
        this.movementThreshold = 0.03;
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

            // 3. Check if this hand has a track loaded
            const state = stateStore.getState();
            const hasTrackLoaded = label === 'Left' ? state.leftTrackLoaded : state.rightTrackLoaded;

            // Get volume control state for this hand
            const volumeState = this.volumeControlState[label];

            // Store data for visualization
            handsData.push({
                label,
                landmarks,
                gesture,
                pinches, // { index: bool, middle: bool }
                hasTrackLoaded,
                isControllingVolume: volumeState.isPinching && volumeState.hasMoved
            });

            // Update pinch states
            if (!this.lastPinchState[label]) {
                this.lastPinchState[label] = { index: false, middle: false };
            }

            // Debug logging for pinches
            if (pinches.index && !this.lastPinchState[label].index) {
                console.log(`${label} Hand Index Pinch Started`);
            }
            if (pinches.middle && !this.lastPinchState[label].middle) {
                console.log(`${label} Hand Middle Pinch Detected`);
            }

            // =============================================
            // PINCH HANDLING: Play/Pause OR Volume Control
            // - Quick pinch (no/little movement) = Play/Pause
            // - Pinch + vertical movement = Volume Control
            // =============================================
            this.handlePinchGesture(label, landmarks, pinches, hasTrackLoaded);

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
     * Handle pinch gestures for both Play/Pause and Volume Control
     * 
     * Logic:
     * - Pinch START: Record starting position
     * - Pinch HOLD + MOVE: Adjust volume
     * - Pinch RELEASE + NO MOVEMENT: Toggle play/pause
     * - Pinch RELEASE + MOVEMENT: Just end volume control (no play/pause)
     */
    handlePinchGesture(label, landmarks, pinches, hasTrackLoaded) {
        const state = stateStore.getState();
        const volumeState = this.volumeControlState[label];
        const isPinching = pinches.index;

        // Get current hand Y position (use wrist for stability)
        const currentY = landmarks[0].y;

        // =============================================
        // PINCH STARTED
        // =============================================
        if (isPinching && !volumeState.isPinching) {
            const currentVolume = label === 'Left' ? state.leftTrackVolume : state.rightTrackVolume;
            volumeState.isPinching = true;
            volumeState.startY = currentY;
            volumeState.startVolume = currentVolume;
            volumeState.hasMoved = false; // Reset movement flag
            console.log(`${label} Pinch Started - Y: ${currentY.toFixed(3)}`);
        }
        // =============================================
        // PINCH HELD - Check for volume control
        // =============================================
        else if (isPinching && volumeState.isPinching) {
            // Calculate Y delta
            const deltaY = currentY - volumeState.startY;
            const absDeltaY = Math.abs(deltaY);

            // Check if moved enough to be volume control
            if (absDeltaY > this.movementThreshold) {
                volumeState.hasMoved = true;

                // Calculate volume change
                const volumeChange = -deltaY / this.volumeSensitivity;
                let newVolume = volumeState.startVolume + volumeChange;
                newVolume = Math.max(0, Math.min(1, newVolume));

                // Apply volume change
                audioEngine.setTrackVolume(label, newVolume);
            }
        }
        // =============================================
        // PINCH RELEASED
        // =============================================
        else if (!isPinching && volumeState.isPinching) {
            volumeState.isPinching = false;

            // If no significant movement occurred, it's a TAP = Play/Pause toggle
            if (!volumeState.hasMoved) {
                console.log(`${label} Pinch Tap Detected - Toggling Play/Pause`);

                // Toggle play/pause for this hand's track
                if (hasTrackLoaded) {
                    audioEngine.toggleTrack(label);
                    console.log(`${label} Track Toggled`);
                } else {
                    console.log(`${label} No track loaded - cannot toggle`);
                }
            } else {
                // Movement occurred, it was volume control
                const finalVolume = label === 'Left' ? state.leftTrackVolume : state.rightTrackVolume;
                console.log(`${label} Volume Control Ended - Final Vol: ${(finalVolume * 100).toFixed(0)}%`);
            }

            // Reset movement flag
            volumeState.hasMoved = false;
        }
    }
}

export const gestureEngine = new GestureEngine();
