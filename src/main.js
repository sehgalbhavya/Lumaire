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

// Populate dynamic hints (keyboard + mouse mappings)
function populateHintsPanel() {
        if (!hintsPanel) return;
        const content = document.getElementById('hints-content') || document.createElement('div');
        content.id = 'hints-content';
        content.className = 'hints-content';
        content.innerHTML = `
            <div class="hint-section">
                <span class="hint-icon">🖐️</span>
                <div class="hint-content">
                    <strong>Right Hand</strong>
                    <p>Pinch = Play/Pause</p>
                    <p>Pinch + ↕ = Volume (or use keyboard ↕)</p>
                </div>
            </div>
            <div class="hint-section">
                <span class="hint-icon">🖐️</span>
                <div class="hint-content">
                    <strong>Left Hand</strong>
                    <p>Pinch + ←/→ = Crossfader (or use keyboard ←/→)</p>
                </div>
            </div>
            <div class="hint-section">
                <span class="hint-icon">✊</span>
                <div class="hint-content">
                    <strong>Fist Gestures</strong>
                    <p>Right = Bass | Left = Treble.</p>
                    <p>Hold B and use ↑/↓ to change Bass; hold T and use ↑/↓ to change Treble.</p>
                </div>
            </div>
            <div class="hint-section">
                <span class="hint-icon">👏</span>
                <div class="hint-content">
                    <strong id="hint-clap-title">Clap</strong>
                    <p id="hint-clap">Clap = Trigger action (press C to simulate)</p>
                </div>
            </div>
            <div class="hint-section">
                <span class="hint-icon">⌨️</span>
                <div class="hint-content">
                    <strong>Keyboard</strong>
                    <p>Space / P = Play/Pause</p>
                    <p>↑/↓ = Volume (hold B or T + ↑/↓ to edit Bass/Treble)</p>
                    <p>←/→ = Crossfader | C = Clap</p>
                </div>
            </div>
        `;
        // replace or append
        const existing = document.getElementById('hints-content');
        if (existing) existing.replaceWith(content);
        else hintsPanel.appendChild(content);
}

populateHintsPanel();

// --- Keyboard & Cursor control mapping (simulate gestures) -----------------
// Small helper actions that reuse audioEngine functions so keyboard/mouse
// behave the same as gestures.
const CONTROLS = {
    async togglePlay() { await audioEngine.init(); await audioEngine.toggleAllTracks(); },
    incMaster(delta = 0.05) { const s = stateStore.getState(); audioEngine.setMasterVolume(s.masterVolume + delta); },
    decMaster(delta = 0.05) { const s = stateStore.getState(); audioEngine.setMasterVolume(s.masterVolume - delta); },
    moveCross(delta = 0.25) { const s = stateStore.getState(); audioEngine.setCrossfaderPosition(s.crossfaderPosition + delta); },
    incBass(delta = 0.25) { const s = stateStore.getState(); audioEngine.setBass(s.bass + delta); },
    decBass(delta = 0.25) { const s = stateStore.getState(); audioEngine.setBass(s.bass - delta); },
    incTreble(delta = 0.25) { const s = stateStore.getState(); audioEngine.setTreble(s.treble + delta); },
    decTreble(delta = 0.25) { const s = stateStore.getState(); audioEngine.setTreble(s.treble - delta); },
    // Clap trigger: set a short state flag so UI can show it
    triggerClap() { stateStore.setState({ lastClapTs: Date.now() }); console.log('Clap triggered via keyboard/mouse'); }
};

// Keyboard shortcuts
let bassHold = false;
let trebleHold = false;

window.addEventListener('keydown', (ev) => {
    // avoid typing into inputs
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const key = ev.key.toLowerCase();

    // Hold modifiers: T and B put arrows into treble/bass mode while held
    if (key === 't') { trebleHold = true; return; }
    if (key === 'b') { bassHold = true; return; }

    switch (key) {
        case ' ': // space -> toggle play
        case 'p':
            ev.preventDefault();
            CONTROLS.togglePlay();
            break;
        case 'arrowup':
            if (trebleHold) CONTROLS.incTreble();
            else if (bassHold) CONTROLS.incBass();
            else CONTROLS.incMaster();
            break;
        case 'arrowdown':
            if (trebleHold) CONTROLS.decTreble();
            else if (bassHold) CONTROLS.decBass();
            else CONTROLS.decMaster();
            break;
        case 'arrowleft':
            CONTROLS.moveCross(-0.25);
            break;
        case 'arrowright':
            CONTROLS.moveCross(0.25);
            break;
        case 'c': // clap trigger
            CONTROLS.triggerClap();
            break;
    }
});

// Release modifiers when keyup occurs
window.addEventListener('keyup', (ev) => {
    const key = ev.key.toLowerCase();
    if (key === 't') trebleHold = false;
    if (key === 'b') bassHold = false;
});

// Click interactions on the status displays to simulate quick gesture input
masterVolumeDisplay?.addEventListener('click', (e) => {
    if (e.shiftKey) CONTROLS.decMaster(); else CONTROLS.incMaster();
});

crossfaderDisplay?.addEventListener('click', (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    audioEngine.setCrossfaderPosition(pct);
});

bassDisplay?.addEventListener('click', (e) => { if (e.shiftKey) CONTROLS.decBass(); else CONTROLS.incBass(); });
trebleDisplay?.addEventListener('click', (e) => { if (e.shiftKey) CONTROLS.decTreble(); else CONTROLS.incTreble(); });

// Update hints panel clap text briefly when triggered via keyboard/mouse or gestures
function showClapHintTemporary() {
    const el = document.getElementById('hint-clap');
    if (!el) return;
    const prev = el.textContent;
    el.textContent = 'Clap = Triggered!';
    setTimeout(() => { el.textContent = prev; }, 1500);
}


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

    // If a clap was detected by gestureEngine, briefly update hints panel
    if (handsData && handsData.some(h => h.clap)) {
        showClapHintTemporary();
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

// Add video element event listeners for debugging
videoElement.addEventListener('loadedmetadata', () => {
    console.log('✅ Video metadata loaded');
    console.log('Video dimensions:', videoElement.videoWidth, 'x', videoElement.videoHeight);
})

videoElement.addEventListener('loadeddata', () => {
    console.log('✅ Video data loaded');
})

videoElement.addEventListener('canplay', () => {
    console.log('✅ Video can play');
})

videoElement.addEventListener('play', () => {
    console.log('✅ Video started playing');
})

videoElement.addEventListener('error', (e) => {
    console.error('❌ Video element error:', e);
})

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement })
    },
    width: 1280,
    height: 720
})

console.log('🎥 Starting camera...');
camera.start()
    .then(() => {
        console.log('✅ Camera.start() resolved successfully');
        console.log('Video element srcObject:', videoElement.srcObject);
        console.log('Video paused?', videoElement.paused);
        console.log('Video ready state:', videoElement.readyState);

        // Explicitly start video playback
        if (videoElement.paused) {
            console.log('📹 Manually starting video playback...');
            videoElement.play()
                .then(() => {
                    console.log('✅ Video playback started!');
                })
                .catch((err) => {
                    console.error('❌ Failed to start video playback:', err);
                });
        }
    })
    .catch((err) => {
        console.error('❌ Camera.start() failed:', err);
    })
