import './style.css'
import { Hands } from '@mediapipe/hands'
import { Camera } from '@mediapipe/camera_utils'
import { gestureEngine } from './gestureEngine'
import { visualEngine } from './visualEngine'
import { audioEngine } from './audioEngine'
import { stateStore } from './stateStore'

const videoElement = document.getElementById('input_video')
const canvasElement = document.getElementById('output_canvas')

// Track upload elements
const leftTrackInput = document.getElementById('left-track-input')
const rightTrackInput = document.getElementById('right-track-input')
const leftPlayBtn = document.getElementById('left-track-play')
const rightPlayBtn = document.getElementById('right-track-play')
const leftVolumeDisplay = document.getElementById('left-volume-display')
const rightVolumeDisplay = document.getElementById('right-volume-display')

// Initialize Visual Engine
visualEngine.init(canvasElement);

// Initialize Audio Engine on user interaction
document.body.addEventListener('click', async () => {
    await audioEngine.init();
}, { once: true });

// =============================================
// TRACK UPLOAD HANDLERS
// =============================================
leftTrackInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        await audioEngine.init(); // Ensure audio is initialized
        await audioEngine.loadTrack(file, 'Left');
        leftPlayBtn.disabled = false;
        leftPlayBtn.textContent = '▶️ Play Left';
    }
});

rightTrackInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        await audioEngine.init(); // Ensure audio is initialized
        await audioEngine.loadTrack(file, 'Right');
        rightPlayBtn.disabled = false;
        rightPlayBtn.textContent = '▶️ Play Right';
    }
});

// =============================================
// PLAY BUTTON HANDLERS
// =============================================
leftPlayBtn.addEventListener('click', () => {
    audioEngine.toggleTrack('Left');
    const player = audioEngine.leftTrackPlayer;
    if (player) {
        leftPlayBtn.textContent = player.state === 'started' ? '⏸️ Pause Left' : '▶️ Play Left';
    }
});

rightPlayBtn.addEventListener('click', () => {
    audioEngine.toggleTrack('Right');
    const player = audioEngine.rightTrackPlayer;
    if (player) {
        rightPlayBtn.textContent = player.state === 'started' ? '⏸️ Pause Right' : '▶️ Play Right';
    }
});

// =============================================
// VOLUME DISPLAY UPDATES
// =============================================
stateStore.subscribe((state) => {
    // Update left volume display
    const leftPercent = Math.round(state.leftTrackVolume * 100);
    leftVolumeDisplay.textContent = `Vol: ${leftPercent}%`;
    leftVolumeDisplay.style.color = getVolumeColor(state.leftTrackVolume);

    // Update right volume display
    const rightPercent = Math.round(state.rightTrackVolume * 100);
    rightVolumeDisplay.textContent = `Vol: ${rightPercent}%`;
    rightVolumeDisplay.style.color = getVolumeColor(state.rightTrackVolume);

    // Update play button text based on playing state (for gesture-triggered changes)
    if (state.leftTrackLoaded) {
        leftPlayBtn.textContent = state.leftTrackPlaying ? '⏸️ Pause Left' : '▶️ Play Left';
    }
    if (state.rightTrackLoaded) {
        rightPlayBtn.textContent = state.rightTrackPlaying ? '⏸️ Pause Right' : '▶️ Play Right';
    }
});

function getVolumeColor(volume) {
    // Gradient from red (low) to green (high)
    if (volume < 0.3) return '#ff4444';
    if (volume < 0.6) return '#ffaa00';
    return '#38ef7d';
}

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

