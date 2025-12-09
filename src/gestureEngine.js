import { stateStore } from './stateStore';
import { audioEngine } from './audioEngine';

export class GestureEngine {
    constructor() {
        this.pinchThreshold = 0.05;
        this.lastPinchState = { Left: { index: false, middle: false }, Right: { index: false, middle: false } };

        // Control state tracking for each hand
        this.controlState = {
            // Right hand: Master volume control (pinch)
            Right: { isPinching: false, startY: 0, startValue: 0, hasMoved: false },
            // Left hand: Crossfader control (pinch)
            Left: { isPinching: false, startY: 0, startValue: 0, hasMoved: false }
        };

        // EQ control state tracking for fist gestures
        this.eqControlState = {
            // Right fist: Bass control
            Right: { isFist: false, startY: 0, startValue: 0 },
            // Left fist: Treble control
            Left: { isFist: false, startY: 0, startValue: 0 }
        };

        // Sensitivity settings
        this.volumeSensitivity = 0.3;  // For master volume (vertical movement)
        this.crossfaderSensitivity = 0.5;  // For crossfader (vertical movement)
        this.eqSensitivity = 0.25;  // For bass/treble (vertical movement)

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
            const eqState = this.eqControlState[label];

            // Determine what this hand is controlling
            let controlType = label === 'Right' ? 'Master Volume' : 'Crossfader';
            let isControlling = controlState.isPinching && controlState.hasMoved;

            if (gesture === 'Closed' && !pinches.index) {
                controlType = label === 'Right' ? 'Bass (Fist)' : 'Treble (Fist)';
                isControlling = eqState.isFist;
            }

            // Store data for visualization
            handsData.push({
                label,
                landmarks,
                gesture,
                pinches,
                isControlling,
                controlType
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
                // RIGHT HAND: Play/Pause (tap) + Master Volume (pinch drag)
                this.handleRightHandGesture(landmarks, pinches, gesture);
            } else {
                // LEFT HAND: Crossfader control (pinch drag)
                this.handleLeftHandGesture(landmarks, pinches, gesture);
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
     * - Fist (Closed hand) + UP/DOWN = Bass control
     */
    handleRightHandGesture(landmarks, pinches, gesture) {
        const state = stateStore.getState();
        const controlState = this.controlState.Right;
        const eqState = this.eqControlState.Right;

        // FIST detection: If hand is closed, it's a fist (takes priority over pinch)
        const isFist = gesture === 'Closed';
        // PINCH detection: Only valid when hand is OPEN (not a fist)
        const isPinching = gesture === 'Open' && pinches.index;

        // Get current hand Y position (use wrist for stability)
        const currentY = landmarks[0].y;

        // =============================================
        // FIST CONTROL (Bass) - Takes priority when fist is detected
        // =============================================
        if (isFist) {
            // Cancel any ongoing pinch control
            if (controlState.isPinching) {
                controlState.isPinching = false;
                controlState.hasMoved = false;
            }

            if (!eqState.isFist) {
                // Fist started
                eqState.isFist = true;
                eqState.startY = currentY;
                eqState.startValue = state.bass;
                console.log(`Right Fist: Bass control started at ${(state.bass * 100).toFixed(0)}%`);
            } else {
                // Fist held - adjust bass
                const deltaY = currentY - eqState.startY;
                // Moving UP = boost bass, moving DOWN = cut bass
                const bassChange = -deltaY / this.eqSensitivity;
                let newBass = eqState.startValue + bassChange;
                newBass = Math.max(-1, Math.min(1, newBass));
                audioEngine.setBass(newBass);
            }
            return; // Don't process pinch while fist is active
        } else if (eqState.isFist) {
            // Fist released
            eqState.isFist = false;
            const finalBass = stateStore.getState().bass;
            const dbValue = (finalBass * 12).toFixed(0);
            console.log(`Right Fist: Bass set to ${dbValue > 0 ? '+' : ''}${dbValue}dB`);
        }

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
     * - Pinch + MOVE (vertical) = Crossfader control
     * - 0% = Track A only, 50% = Both, 100% = Track B only
     * - Fist + UP/DOWN = Treble control
     */
    handleLeftHandGesture(landmarks, pinches, gesture) {
        const state = stateStore.getState();
        const controlState = this.controlState.Left;
        const eqState = this.eqControlState.Left;

        // FIST detection: If hand is closed, it's a fist (takes priority over pinch)
        const isFist = gesture === 'Closed';
        // PINCH detection: Only valid when hand is OPEN (not a fist)
        const isPinching = gesture === 'Open' && pinches.index;

        // Use Y position for crossfader (up = Track A, down = Track B)
        const currentY = landmarks[0].y;

        // =============================================
        // FIST CONTROL (Treble) - Takes priority when fist is detected
        // =============================================
        if (isFist) {
            // Cancel any ongoing pinch control
            if (controlState.isPinching) {
                controlState.isPinching = false;
                controlState.hasMoved = false;
            }

            if (!eqState.isFist) {
                // Fist started
                eqState.isFist = true;
                eqState.startY = currentY;
                eqState.startValue = state.treble;
                console.log(`Left Fist: Treble control started at ${(state.treble * 100).toFixed(0)}%`);
            } else {
                // Fist held - adjust treble
                const deltaY = currentY - eqState.startY;
                // Moving UP = boost treble, moving DOWN = cut treble
                const trebleChange = -deltaY / this.eqSensitivity;
                let newTreble = eqState.startValue + trebleChange;
                newTreble = Math.max(-1, Math.min(1, newTreble));
                audioEngine.setTreble(newTreble);
            }
            return; // Don't process pinch while fist is active
        } else if (eqState.isFist) {
            // Fist released
            eqState.isFist = false;
            const finalTreble = stateStore.getState().treble;
            const dbValue = (finalTreble * 12).toFixed(0);
            console.log(`Left Fist: Treble set to ${dbValue > 0 ? '+' : ''}${dbValue}dB`);
        }

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
