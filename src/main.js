import './style.css'
import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands'
import { Camera } from '@mediapipe/camera_utils'
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils'
import { gestureEngine } from './gestureEngine'
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

function onResults(results) {
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
