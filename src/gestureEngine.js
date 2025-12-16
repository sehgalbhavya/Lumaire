import { stateStore } from './stateStore';
import { audioEngine } from './audioEngine';

export class GestureEngine {
    constructor() {
        this.pinchThreshold = 0.03; // Fingers must be very close (almost touching)
        this.lastPinchState = { Left: { index: false, middle: false }, Right: { index: false, middle: false } };

        // Control state tracking for each hand
        this.controlState = {
            // Right hand: Master volume control (pinch)
            Right: { isPinching: false, startY: 0, startValue: 0, hasMoved: false },
            // Left hand: Crossfader control (pinch)
            Left: { isPinching: false, startX: 0, startValue: 0, hasMoved: false }
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
        // Simple: horizontal delta of this.crossfaderFullDelta (normalized 0..1) => full crossfade (0..1)
        this.crossfaderFullDelta = 0.10;  // default: 0.10 normalized units (adjust if needed)
        this.eqSensitivity = 0.25;  // For bass/treble (vertical movement)

        // Minimum movement threshold to distinguish tap from drag (smaller for quicker response)
        this.movementThreshold = 0.01;

        // Clap detection params
        this.clapDistThreshold = 0.09;      // relaxed distance (normalized frame units) considered "together"
        this.clapApproachThreshold = 0.015; // required decrease in distance between frames to count as a fast approach
        this.clapCooldownMs = 400;          // don't retrigger within this ms
        this.lastHandCentroids = { Left: null, Right: null }; // remembers recent centroids even if a hand disappears
        this.lastHandsDistance = null;      // last measured distance between hands (when available)
        this.lastClapTime = 0;

        // indices used to compute a palm-centroid (wrist + MCPs)
        this._centroidIndices = [0, 5, 9, 13, 17];
    }

    process(results) {
        if (!results.multiHandLandmarks || !results.multiHandedness) return [];

        const handsData = [];
        const state = stateStore.getState();

        // ---------- Clap detection () ----------
        // Build centroids for detected hands (apply same mirrored label mapping used later)
        const now = Date.now();
        const detectedCentroids = {};
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const rawLabel = results.multiHandedness[i].label;
            const label = rawLabel === 'Left' ? 'Right' : 'Left'; // mirror fix
            const lms = results.multiHandLandmarks[i];

            // compute centroid of a few palm-representative landmarks
            let sx = 0, sy = 0;
            for (const idx of this._centroidIndices) {
                sx += lms[idx].x;
                sy += lms[idx].y;
            }
            const cx = sx / this._centroidIndices.length;
            const cy = sy / this._centroidIndices.length;

            detectedCentroids[label] = { x: cx, y: cy, ts: now };
            // update memory for this hand
            this.lastHandCentroids[label] = { x: cx, y: cy, ts: now };
        }

        // Decide source positions for distance calc:
        // prefer both currently detected, else use a recent memory (within 400ms)
        const recentThreshold = 400;
        const left = detectedCentroids.Left || (this.lastHandCentroids.Left && (now - this.lastHandCentroids.Left.ts < recentThreshold) ? this.lastHandCentroids.Left : null);
        const right = detectedCentroids.Right || (this.lastHandCentroids.Right && (now - this.lastHandCentroids.Right.ts < recentThreshold) ? this.lastHandCentroids.Right : null);

        let clapDetected = false;
        if (left && right) {
            const dx = left.x - right.x;
            const dy = left.y - right.y;
            const dist = Math.hypot(dx, dy);

            const approach = (this.lastHandsDistance !== null) ? (this.lastHandsDistance - dist) : 0;
            console.debug(`clap-debug dist=${dist.toFixed(3)} approach=${approach.toFixed(4)} lastClap=${now - this.lastClapTime}ms`);

            if (approach > this.clapApproachThreshold && dist < this.clapDistThreshold && (now - this.lastClapTime) > this.clapCooldownMs) {
                clapDetected = true;
                this.lastClapTime = now;
                console.log('👏 Clap detected (gestureEngine)');
            }
            // store last distance for next frame
            this.lastHandsDistance = dist;
        } else {
            // not enough info to compute a pair distance; decay stored distance so a slow drift doesn't trigger later
            this.lastHandsDistance = null;
        }

        // ---------------------------------------------------------------------

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

            // 3. Easter Egg: Middle Finger Detection
            const isMiddleFinger = this.detectMiddleFinger(landmarks);

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
                controlType,
                isMiddleFinger,
                clap: clapDetected 
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
     * Detect if user is showing middle finger
     * Returns true if middle finger is extended and other fingers (except thumb) are curled
     */
    detectMiddleFinger(landmarks) {
        const wrist = landmarks[0];

        // Index finger (tips[8], pip[6])
        const indexTip = landmarks[8];
        const indexPip = landmarks[6];
        const indexTipDist = Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y);
        const indexPipDist = Math.hypot(indexPip.x - wrist.x, indexPip.y - wrist.y);
        const indexCurled = indexTipDist < indexPipDist;

        // Middle finger (tips[12], pip[10])
        const middleTip = landmarks[12];
        const middlePip = landmarks[10];
        const middleTipDist = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y);
        const middlePipDist = Math.hypot(middlePip.x - wrist.x, middlePip.y - wrist.y);
        const middleExtended = middleTipDist > middlePipDist;

        // Ring finger (tips[16], pip[14])
        const ringTip = landmarks[16];
        const ringPip = landmarks[14];
        const ringTipDist = Math.hypot(ringTip.x - wrist.x, ringTip.y - wrist.y);
        const ringPipDist = Math.hypot(ringPip.x - wrist.x, ringPip.y - wrist.y);
        const ringCurled = ringTipDist < ringPipDist;

        // Pinky finger (tips[20], pip[18])
        const pinkyTip = landmarks[20];
        const pinkyPip = landmarks[18];
        const pinkyTipDist = Math.hypot(pinkyTip.x - wrist.x, pinkyTip.y - wrist.y);
        const pinkyPipDist = Math.hypot(pinkyPip.x - wrist.x, pinkyPip.y - wrist.y);
        const pinkyCurled = pinkyTipDist < pinkyPipDist;

        // Middle finger gesture: middle extended, others curled
        return middleExtended && indexCurled && ringCurled && pinkyCurled;
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
     * - Pinch + MOVE (horizontal) = Crossfader control
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

        // Use X position for crossfader (left = Track A, right = Track B)
        const currentX = landmarks[8].x;
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
            controlState.startX = currentX;
            controlState.startValue = state.crossfaderPosition;
            controlState.hasMoved = false;
            console.log(`Left Hand: Pinch Started - Crossfader: ${(state.crossfaderPosition * 100).toFixed(0)}%`);
        }
        // =============================================
        // PINCH HELD - Crossfader control
        // =============================================
        else if (isPinching && controlState.isPinching) {
            const deltaX = currentX - controlState.startX;
            const absDeltaX = Math.abs(deltaX);

            if (absDeltaX > this.movementThreshold) {
                controlState.hasMoved = true;

                // Simple mapping: deltaX / fullDelta -> fraction of full crossfade
                // Moving RIGHT (deltaX>0) increases crossfader (towards Track B).
                const crossfaderChange = -deltaX / this.crossfaderFullDelta;
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
