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
const playAllBtn = document.getElementById('play-all-btn')
const masterVolumeDisplay = document.getElementById('master-volume-display')
const crossfaderDisplay = document.getElementById('crossfader-display')
const bassDisplay = document.getElementById('bass-display')
const trebleDisplay = document.getElementById('treble-display')
const hintsPanel = document.getElementById('hints-panel')
const hintsHeader = document.getElementById('hints-header')

// Initialize Visual Engine
visualEngine.init(canvasElement);

// Initialize Audio Engine on user interaction
document.body.addEventListener('click', async () => {
    await audioEngine.init();
}, { once: true });

// Toggle hints panel collapse
hintsHeader?.addEventListener('click', () => {
    hintsPanel?.classList.toggle('collapsed');
});

// =============================================
// TRACK UPLOAD HANDLERS
// =============================================
trackAInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        await audioEngine.init();
        await audioEngine.loadTrack(file, 'A');
        console.log(`Track A loaded: ${file.name}`);
    }
});

trackBInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        await audioEngine.init();
        await audioEngine.loadTrack(file, 'B');
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
    }

    // Update bass display
    if (bassDisplay) {
        const bassDb = Math.round(state.bass * 12);
        bassDisplay.textContent = `Bass: ${bassDb >= 0 ? '+' : ''}${bassDb}dB`;
    }

    // Update treble display
    if (trebleDisplay) {
        const trebleDb = Math.round(state.treble * 12);
        trebleDisplay.textContent = `Treble: ${trebleDb >= 0 ? '+' : ''}${trebleDb}dB`;
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
