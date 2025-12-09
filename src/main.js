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
const trackAInput = document.getElementById('track-a-input')
const trackBInput = document.getElementById('track-b-input')
const trackAStatus = document.getElementById('track-a-status')
const trackBStatus = document.getElementById('track-b-status')
const playAllBtn = document.getElementById('play-all-btn')
const masterVolumeDisplay = document.getElementById('master-volume-display')
const crossfaderDisplay = document.getElementById('crossfader-display')

// Initialize Visual Engine
visualEngine.init(canvasElement);

// Initialize Audio Engine on user interaction
document.body.addEventListener('click', async () => {
    await audioEngine.init();
}, { once: true });

// =============================================
// TRACK UPLOAD HANDLERS
// =============================================
trackAInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        if (trackAStatus) {
            trackAStatus.textContent = 'Loading...';
        }
        await audioEngine.init();
        await audioEngine.loadTrack(file, 'A');
        if (trackAStatus) {
            trackAStatus.textContent = `✓ ${file.name}`;
            trackAStatus.classList.add('loaded');
        }
        console.log(`Track A loaded: ${file.name}`);
    }
});

trackBInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        if (trackBStatus) {
            trackBStatus.textContent = 'Loading...';
        }
        await audioEngine.init();
        await audioEngine.loadTrack(file, 'B');
        if (trackBStatus) {
            trackBStatus.textContent = `✓ ${file.name}`;
            trackBStatus.classList.add('loaded');
        }
        console.log(`Track B loaded: ${file.name}`);
    }
});

// =============================================
// PLAY ALL BUTTON HANDLER
// =============================================
playAllBtn?.addEventListener('click', async () => {
    await audioEngine.init(); // Ensure audio is initialized
    await audioEngine.toggleAllTracks();
});

// =============================================
// STATE DISPLAY UPDATES
// =============================================
stateStore.subscribe((state) => {
    // Update master volume display
    if (masterVolumeDisplay) {
        const masterPercent = Math.round(state.masterVolume * 100);
        masterVolumeDisplay.textContent = `Master: ${masterPercent}%`;
        masterVolumeDisplay.style.color = '#ffd700';
    }

    // Update crossfader display
    if (crossfaderDisplay) {
        const crossPercent = Math.round(state.crossfaderPosition * 100);
        let description;
        if (state.crossfaderPosition < 0.25) {
            description = 'A';
        } else if (state.crossfaderPosition > 0.75) {
            description = 'B';
        } else {
            description = 'Both';
        }
        crossfaderDisplay.textContent = `Crossfader: ${crossPercent}% (${description})`;
        crossfaderDisplay.style.color = '#8a2be2';
    }

    // Update play button text
    if (playAllBtn) {
        const anyPlaying = state.trackAPlaying || state.trackBPlaying;
        playAllBtn.textContent = anyPlaying ? '⏸️ Pause All' : '▶️ Play All';
    }
});

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
