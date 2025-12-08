import './style.css'
import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands'
import { Camera } from '@mediapipe/camera_utils'
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils'
import { gestureEngine } from './gestureEngine2.js'
import { stateStore } from './stateStore'

const videoElement = document.getElementById('input_video')
const canvasElement = document.getElementById('output_canvas')
const canvasCtx = canvasElement.getContext('2d')

// Resize canvas to match window
function resizeCanvas() {
    canvasElement.width = window.innerWidth
    canvasElement.height = window.innerHeight
}
window.addEventListener('resize', resizeCanvas)
resizeCanvas()

function drawGrid(ctx, width, height) {
    const state = stateStore.getState();
    const rows = 4;
    const rowHeight = height / rows;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;

    for (let i = 0; i < rows; i++) {
        const y = i * rowHeight;

        // Highlight selected row
        if (i === state.selectedRow) {
            ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
            ctx.fillRect(0, y, width, rowHeight);
        }

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    ctx.restore();
}

function onResults_original(results) {
    // Process gestures and get data
    const handsData = gestureEngine.process(results);

    canvasCtx.save()
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height)

    // Mirror the content
    canvasCtx.translate(canvasElement.width, 0)
    canvasCtx.scale(-1, 1)

    // Draw the video frame
    canvasCtx.drawImage(
        results.image, 0, 0, canvasElement.width, canvasElement.height)

    // Draw Landmarks
    if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS,
                { color: '#00FF00', lineWidth: 5 })
            drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 2 })
        }
    }

    canvasCtx.restore()

    // Draw UI (not mirrored)
    drawGrid(canvasCtx, canvasElement.width, canvasElement.height);

    // Draw Hand Labels & Gesture Info
    if (handsData) {
        canvasCtx.save();
        canvasCtx.font = "20px Arial";
        canvasCtx.fillStyle = "white";
        canvasCtx.strokeStyle = "black";
        canvasCtx.lineWidth = 3;

        handsData.forEach(hand => {
            const wrist = hand.landmarks[0];
            // Convert normalized coordinates to pixel coordinates
            // Since the video is mirrored, x=0 in normalized space is actually the right side of the screen?
            // No, MediaPipe coordinates are normalized [0,1].
            // If we mirrored the drawing with scale(-1, 1), we drew the image flipped.
            // But now we are in restored context (no flip).
            // So we need to flip the x coordinate manually to match the visual.

            const x = (1 - wrist.x) * canvasElement.width;
            const y = wrist.y * canvasElement.height;

            const text = `${hand.label} | ${hand.gesture}`;

            canvasCtx.strokeText(text, x, y);
            canvasCtx.fillText(text, x, y);

            // Draw Pinch Indicators
            if (hand.pinches) {
                // Index Pinch
                if (hand.pinches.index) {
                    const indexTip = hand.landmarks[8];
                    const ix = (1 - indexTip.x) * canvasElement.width;
                    const iy = indexTip.y * canvasElement.height;

                    canvasCtx.beginPath();
                    canvasCtx.arc(ix, iy, 15, 0, 2 * Math.PI);
                    canvasCtx.fillStyle = "yellow";
                    canvasCtx.fill();

                    canvasCtx.strokeText("INDEX", ix + 20, iy);
                    canvasCtx.fillText("INDEX", ix + 20, iy);
                }

                // Middle Pinch
                if (hand.pinches.middle) {
                    const middleTip = hand.landmarks[12];
                    const mx = (1 - middleTip.x) * canvasElement.width;
                    const my = middleTip.y * canvasElement.height;

                    canvasCtx.beginPath();
                    canvasCtx.arc(mx, my, 15, 0, 2 * Math.PI);
                    canvasCtx.fillStyle = "cyan";
                    canvasCtx.fill();

                    canvasCtx.strokeText("MIDDLE", mx + 20, my);
                    canvasCtx.fillText("MIDDLE", mx + 20, my);
                }
            }
        });
        canvasCtx.restore();
    }
}

function onResults(results) {
    const handsData = gestureEngine.process(results);

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Mirror the content
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);

    // Draw the video frame
    canvasCtx.drawImage(
        results.image, 0, 0, canvasElement.width, canvasElement.height
    );

    // Draw Landmarks
    if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS,
                { color: '#00FF00', lineWidth: 5 });
            drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 2 });
        }
    }

    canvasCtx.restore();

    // Draw UI (not mirrored)
    drawGrid(canvasCtx, canvasElement.width, canvasElement.height);

    if (handsData) {
        canvasCtx.save();
        canvasCtx.font = "22px Arial";
        canvasCtx.lineWidth = 3;

        handsData.forEach(hand => {
            const wrist = hand.landmarks[0];

            const x = (1 - wrist.x) * canvasElement.width;
            const y = wrist.y * canvasElement.height;

            // MAIN LABEL (hand label + open/closed + volume + crossfade)
            const volume = hand.volumePercent ?? 0;
            const cross = hand.crossfadePercent;
            const crossText = cross !== undefined ? ` | Cross: ${cross}%` : '';
            const label = `${hand.label} | ${hand.gesture} | Vol: ${volume}%${crossText}`;
            canvasCtx.strokeStyle = "black";
            canvasCtx.fillStyle = "white";
            canvasCtx.strokeText(label, x, y);
            canvasCtx.fillText(label, x, y);

            // Print to console as well
            if (cross !== undefined) {
                console.log(`Crossfader: ${cross}%  (0=Track A, 100=Track B)`);
            } else {
                console.log(`${hand.label} volume: ${volume}%`);
            }

            // ----------------------------
            // PINCH INDICATORS
            // ----------------------------
            if (hand.pinches?.index) {
                const tip = hand.landmarks[8];
                drawIndicatorCircle("yellow", tip, "INDEX");
            }
            if (hand.pinches?.middle) {
                const tip = hand.landmarks[12];
                drawIndicatorCircle("cyan", tip, "MIDDLE");
            }

            // ----------------------------
            // DIRECTION INDICATORS
            // ----------------------------
            if (hand.direction) {
                const text = `DIR: ${hand.direction}`;
                canvasCtx.strokeText(text, x, y + 25);
                canvasCtx.fillText(text, x, y + 25);
            }

            // ----------------------------
            // PINCH + DIRECTION
            // ----------------------------
            if (hand.pinchGesture) {
                drawGestureBox(hand, "Pinch: " + hand.pinchGesture);
            }

            // ----------------------------
            // OPEN PALM + DIRECTION
            // ----------------------------
            if (hand.openPalmGesture) {
                drawGestureBox(hand, "Palm: " + hand.openPalmGesture);
            }

            // ----------------------------
            // FIST HIT
            // ----------------------------
            if (hand.fistHit) {
                drawGestureBox(hand, "FIST HIT", "red");
            }

            // ----------------------------
            // HAND FLIP
            // ----------------------------
            if (hand.handFlip) {
                drawGestureBox(hand, "HAND FLIP", "orange");
            }
        });

        canvasCtx.restore();
    }

    // ----------------------------
    // CLAP INDICATOR (uses two hands)
    // ----------------------------
    if (results.multiHandLandmarks?.length === 2) {
        const clapped = gestureEngine.lastClapTime > performance.now() - 300;

        if (clapped) {
            canvasCtx.save();
            canvasCtx.font = "32px Arial";
            canvasCtx.fillStyle = "yellow";
            canvasCtx.strokeStyle = "black";
            canvasCtx.lineWidth = 4;

            const text = "👏 CLAP!";
            const x = canvasElement.width / 2 - 70;
            const y = 60;

            canvasCtx.strokeText(text, x, y);
            canvasCtx.fillText(text, x, y);
            canvasCtx.restore();
        }
    }
}

function drawIndicatorCircle(color, landmark, label) {
    const x = (1 - landmark.x) * canvasElement.width;
    const y = landmark.y * canvasElement.height;

    canvasCtx.beginPath();
    canvasCtx.arc(x, y, 18, 0, Math.PI * 2);
    canvasCtx.fillStyle = color;
    canvasCtx.fill();

    canvasCtx.strokeStyle = "black";
    canvasCtx.fillStyle = "white";
    canvasCtx.lineWidth = 3;

    canvasCtx.strokeText(label, x + 25, y + 5);
    canvasCtx.fillText(label, x + 25, y + 5);
}

function drawGestureBox(hand, text, color = "lime") {
    const wrist = hand.landmarks[0];
    const x = (1 - wrist.x) * canvasElement.width;
    const y = wrist.y * canvasElement.height + 50;

    canvasCtx.fillStyle = color;
    canvasCtx.globalAlpha = 0.4;
    canvasCtx.fillRect(x - 10, y - 20, 200, 40);
    canvasCtx.globalAlpha = 1.0;

    canvasCtx.strokeStyle = "black";
    canvasCtx.lineWidth = 3;
    canvasCtx.font = "22px Arial";
    canvasCtx.strokeText(text, x, y);
    canvasCtx.fillStyle = "white";
    canvasCtx.fillText(text, x, y);
}

const hands = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    }
})

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
})

hands.onResults(onResults)

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement })
    },
    width: 1280,
    height: 720
})

camera.start()
