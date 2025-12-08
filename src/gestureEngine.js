import { stateStore } from './stateStore';
import { audioEngine } from './audioEngine';

export class GestureEngine {
    constructor() {
        this.pinchThreshold = 0.05;
        this.lastPinchState = { Left: { index: false, middle: false }, Right: { index: false, middle: false } };

        // Volume control state - tracks pinch start position for volume adjustment
        this.volumeControlState = {
            Left: { isPinching: false, startY: 0, startVolume: 0 },
            Right: { isPinching: false, startY: 0, startVolume: 0 }
        };

        // Sensitivity: how much Y movement (0-1) changes volume
        // Lower value = more sensitive (less movement needed)
        this.volumeSensitivity = 0.3;
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

            // Store data for visualization
            handsData.push({
                label,
                landmarks,
                gesture,
                pinches, // { index: bool, middle: bool }
                hasTrackLoaded
            });

            // Update pinch states
            if (!this.lastPinchState[label]) {
                this.lastPinchState[label] = { index: false, middle: false };
            }

            // Debug logging for pinches
            if (pinches.index && !this.lastPinchState[label].index) {
                console.log(`${label} Hand Index Pinch Detected${hasTrackLoaded ? ' - Volume Control Active' : ' - No track loaded'}`);
            }
            if (pinches.middle && !this.lastPinchState[label].middle) {
                console.log(`${label} Hand Middle Pinch Detected`);
            }

            // =============================================
            // VOLUME CONTROL: Pinch + Vertical Movement
            // Each hand independently controls its own track
            // =============================================
            this.handleVolumeControl(label, landmarks, pinches);

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
     * Handle volume control via pinch + vertical movement
     * When user pinches and moves up, volume increases
     * When user pinches and moves down, volume decreases
     * 
     * Each hand is INDEPENDENT - Left hand controls left track, Right hand controls right track
     */
    handleVolumeControl(label, landmarks, pinches) {
        const state = stateStore.getState();
        const volumeState = this.volumeControlState[label];
        const isPinching = pinches.index; // Use index finger pinch for volume control

        // Get current hand Y position (use wrist for stability)
        const currentY = landmarks[0].y;

        // Volume control works regardless of whether a track is loaded
        // This allows testing the gesture even without audio files

        // Pinch just started
        if (isPinching && !volumeState.isPinching) {
            const currentVolume = label === 'Left' ? state.leftTrackVolume : state.rightTrackVolume;
            volumeState.isPinching = true;
            volumeState.startY = currentY;
            volumeState.startVolume = currentVolume;
            console.log(`${label} Volume Control Started - Y: ${currentY.toFixed(3)}, Vol: ${currentVolume.toFixed(2)}`);
        }
        // Currently pinching - adjust volume based on movement
        else if (isPinching && volumeState.isPinching) {
            // Calculate Y delta (positive = moved down, negative = moved up)
            const deltaY = currentY - volumeState.startY;

            // Invert because moving UP should INCREASE volume
            // deltaY is negative when moving up, so we invert
            const volumeChange = -deltaY / this.volumeSensitivity;

            // Calculate new volume (clamped between 0 and 1)
            let newVolume = volumeState.startVolume + volumeChange;
            newVolume = Math.max(0, Math.min(1, newVolume));

            // Apply volume change
            audioEngine.setTrackVolume(label, newVolume);
        }
        // Pinch released
        else if (!isPinching && volumeState.isPinching) {
            volumeState.isPinching = false;
            const finalVolume = label === 'Left' ? state.leftTrackVolume : state.rightTrackVolume;
            console.log(`${label} Volume Control Ended - Final Vol: ${finalVolume.toFixed(2)}`);
        }
    }
}

export const gestureEngine = new GestureEngine();
