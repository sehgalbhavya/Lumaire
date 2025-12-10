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

// Interactive slider state
let activeSlider = null;
let sliderStartX = 0;
let sliderStartValue = 0;

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
// INTERACTIVE SLIDER FUNCTIONALITY
// =============================================
function initializeSliders() {
    const sliders = document.querySelectorAll('.slider');

    sliders.forEach(slider => {
        slider.addEventListener('mousedown', (e) => {
            e.preventDefault();
            activeSlider = slider;
            sliderStartX = e.clientX;
            slider.classList.add('dragging');

            const sliderType = slider.dataset.slider;
            const state = stateStore.getState();

            // Store starting value based on slider type
            switch (sliderType) {
                case 'volume':
                    sliderStartValue = state.masterVolume;
                    break;
                case 'crossfader':
                    sliderStartValue = state.crossfaderPosition;
                    break;
                case 'bass':
                    sliderStartValue = state.bass;
                    break;
                case 'treble':
                    sliderStartValue = state.treble;
                    break;
            }
        });
    });
}

// Global mouse move handler
document.addEventListener('mousemove', (e) => {
    if (!activeSlider) return;

    const deltaX = e.clientX - sliderStartX;
    const sliderType = activeSlider.dataset.slider;
    const sensitivity = 0.003; // Adjust this for faster/slower dragging

    let newValue;

    switch (sliderType) {
        case 'volume':
            newValue = Math.max(0, Math.min(1, sliderStartValue + deltaX * sensitivity));
            stateStore.setState({ masterVolume: newValue });
            audioEngine.setMasterVolume(newValue);
            break;

        case 'crossfader':
            newValue = Math.max(0, Math.min(1, sliderStartValue + deltaX * sensitivity));
            stateStore.setState({ crossfaderPosition: newValue });
            audioEngine.setCrossfader(newValue);
            break;

        case 'bass':
            newValue = Math.max(-1, Math.min(1, sliderStartValue + deltaX * sensitivity * 2));
            stateStore.setState({ bass: newValue });
            audioEngine.setBass(newValue);
            break;

        case 'treble':
            newValue = Math.max(-1, Math.min(1, sliderStartValue + deltaX * sensitivity * 2));
            stateStore.setState({ treble: newValue });
            audioEngine.setTreble(newValue);
            break;
    }
});

// Global mouse up handler
document.addEventListener('mouseup', () => {
    if (activeSlider) {
        activeSlider.classList.remove('dragging');
        activeSlider = null;
    }
});

// Initialize sliders on load
initializeSliders();

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
