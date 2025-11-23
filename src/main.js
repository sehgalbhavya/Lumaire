import './style.css'
import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands'
import { Camera } from '@mediapipe/camera_utils'
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils'

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

function onResults(results) {
    canvasCtx.save()
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height)

    // Mirror the content
    canvasCtx.translate(canvasElement.width, 0)
    canvasCtx.scale(-1, 1)

    // Draw the video frame
    canvasCtx.drawImage(
        results.image, 0, 0, canvasElement.width, canvasElement.height)

    if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS,
                { color: '#00FF00', lineWidth: 5 })
            drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 2 })
        }
    }
    canvasCtx.restore()
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
