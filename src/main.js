import './style.css'
import { Hands } from '@mediapipe/hands'
import { Camera } from '@mediapipe/camera_utils'
import { gestureEngine } from './gestureEngine'
import { visualEngine } from './visualEngine'
import { audioEngine } from './audioEngine'

const videoElement = document.getElementById('input_video')
const canvasElement = document.getElementById('output_canvas')

// Initialize Visual Engine
visualEngine.init(canvasElement);

// Initialize Audio Engine on user interaction
document.body.addEventListener('click', async () => {
    await audioEngine.init();
}, { once: true });

function onResults(results) {
    // Process gestures and get data
    const handsData = gestureEngine.process(results);

    // Draw everything
    visualEngine.draw(results, handsData);
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
