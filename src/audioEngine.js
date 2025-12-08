import * as Tone from 'tone';
import { stateStore } from './stateStore';

export class AudioEngine {
    constructor() {
        this.initialized = false;
        this.synth = null;
        this.instruments = {};

        // User-uploaded track players
        this.leftTrackPlayer = null;
        this.rightTrackPlayer = null;

        // Pause state tracking for resume functionality
        this.pauseState = {
            Left: { isPaused: false, pauseTime: 0, startTime: 0 },
            Right: { isPaused: false, pauseTime: 0, startTime: 0 }
        };

        // Subscribe to state changes
        stateStore.subscribe((state) => {
            this.handleStateChange(state);
        });
    }

    async init() {
        if (this.initialized) return;

        await Tone.start();
        console.log('Audio Engine Initialized');

        // Initialize Instruments
        this.instruments = {
            0: new Tone.MembraneSynth().toDestination(), // Kick
            1: new Tone.NoiseSynth({
                noise: { type: 'white' },
                envelope: { attack: 0.005, decay: 0.1, sustain: 0 }
            }).toDestination(), // Snare
            2: new Tone.MetalSynth({
                frequency: 200,
                envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
                harmonicity: 5.1,
                modulationIndex: 32,
                resonance: 4000,
                octaves: 1.5
            }).toDestination(), // Hi-hat
            3: new Tone.MembraneSynth({
                pitchDecay: 0.008,
                octaves: 4,
                oscillator: { type: 'sine' }
            }).toDestination() // Tom
        };

        // Adjust volumes
        this.instruments[0].volume.value = 0;
        this.instruments[1].volume.value = -10;
        this.instruments[2].volume.value = -15;
        this.instruments[3].volume.value = -5;

        this.initialized = true;
        this.startSequencer();
    }

    handleStateChange(state) {
        if (!this.initialized) return;

        // Handle Play/Stop
        if (state.isPlaying && Tone.Transport.state !== 'started') {
            Tone.Transport.start();
        } else if (!state.isPlaying && Tone.Transport.state === 'started') {
            Tone.Transport.stop();
        }

        // Handle Tempo
        Tone.Transport.bpm.value = state.tempo;

        // Handle Track Volumes (convert 0-1 to dB scale)
        // Map 0-1 to -40dB to 0dB
        if (this.leftTrackPlayer) {
            const leftDb = state.leftTrackVolume === 0 ? -Infinity : -40 * (1 - state.leftTrackVolume);
            this.leftTrackPlayer.volume.value = leftDb;
        }
        if (this.rightTrackPlayer) {
            const rightDb = state.rightTrackVolume === 0 ? -Infinity : -40 * (1 - state.rightTrackVolume);
            this.rightTrackPlayer.volume.value = rightDb;
        }
    }

    startSequencer() {
        // Clear previous events to avoid duplicates
        Tone.Transport.cancel();

        // Schedule a repeating loop every 16th note
        Tone.Transport.scheduleRepeat((time) => {
            const state = stateStore.getState();
            const currentStep = state.currentStep;

            // 1. Play sounds for the current step
            state.beatGrid.forEach((row, rowIndex) => {
                if (row[currentStep]) {
                    this.playSound(rowIndex, time);
                }
            });

            // 2. Advance step
            const nextStep = (currentStep + 1) % 16;

            // 3. Update state
            // Use Tone.Draw to sync UI updates with the audio loop
            Tone.Draw.schedule(() => {
                stateStore.setState({ currentStep: nextStep });
            }, time);

        }, "16n");
    }

    playSound(row, time) {
        if (!this.initialized) return;

        const instrument = this.instruments[row];
        if (instrument) {
            switch (parseInt(row)) {
                case 0: // Kick
                    instrument.triggerAttackRelease("C2", "8n", time);
                    break;
                case 1: // Snare
                    instrument.triggerAttackRelease("8n", time);
                    break;
                case 2: // Hi-hat
                    instrument.triggerAttackRelease("32n", time);
                    break;
                case 3: // Tom
                    instrument.triggerAttackRelease("G2", "8n", time);
                    break;
            }
        }
    }

    /**
     * Load an audio track from a File object
     * @param {File} file - The audio file to load
     * @param {'Left'|'Right'} hand - Which hand to associate the track with
     */
    async loadTrack(file, hand) {
        // Ensure audio context is started
        if (!this.initialized) {
            await this.init();
        }

        // Make sure Tone.js context is running
        if (Tone.context.state !== 'running') {
            await Tone.start();
            console.log('Tone.js audio context started');
        }

        // Create object URL from file
        const url = URL.createObjectURL(file);
        console.log(`Loading ${hand} track from: ${url}`);

        // Stop and dispose of existing player if any
        if (hand === 'Left' && this.leftTrackPlayer) {
            this.leftTrackPlayer.stop();
            this.leftTrackPlayer.dispose();
            this.leftTrackPlayer = null;
        } else if (hand === 'Right' && this.rightTrackPlayer) {
            this.rightTrackPlayer.stop();
            this.rightTrackPlayer.dispose();
            this.rightTrackPlayer = null;
        }

        // Reset pause state for this track
        this.pauseState[hand] = { isPaused: false, pauseTime: 0, startTime: 0 };

        // Create new player with promise-based loading
        return new Promise((resolve, reject) => {
            const player = new Tone.Player({
                url: url,
                loop: true,
                autostart: false,
                onload: () => {
                    console.log(`${hand} track loaded successfully: ${file.name}`);

                    // Store the player
                    if (hand === 'Left') {
                        this.leftTrackPlayer = player;
                        stateStore.setState({ leftTrackLoaded: true });
                    } else {
                        this.rightTrackPlayer = player;
                        stateStore.setState({ rightTrackLoaded: true });
                    }

                    // Apply current volume
                    const state = stateStore.getState();
                    const volume = hand === 'Left' ? state.leftTrackVolume : state.rightTrackVolume;
                    // Map 0-1 to -40dB to 0dB (logarithmic scale)
                    const db = volume === 0 ? -Infinity : -40 * (1 - volume);
                    player.volume.value = db;
                    console.log(`${hand} track volume set to ${db}dB (${(volume * 100).toFixed(0)}%)`);

                    resolve(player);
                },
                onerror: (error) => {
                    console.error(`Error loading ${hand} track:`, error);
                    reject(error);
                }
            }).toDestination();
        });
    }

    /**
     * Start playing a track
     * @param {'Left'|'Right'} hand - Which hand's track to play
     */
    async playTrack(hand) {
        // Ensure audio context is running
        if (Tone.context.state !== 'running') {
            await Tone.start();
            console.log('Tone.js audio context started before playback');
        }

        const player = hand === 'Left' ? this.leftTrackPlayer : this.rightTrackPlayer;
        console.log(`playTrack called for ${hand}:`, player ? `loaded=${player.loaded}, state=${player.state}` : 'no player');

        if (player && player.loaded) {
            player.start();
            if (hand === 'Left') {
                stateStore.setState({ leftTrackPlaying: true });
            } else {
                stateStore.setState({ rightTrackPlaying: true });
            }
            console.log(`${hand} track started playing`);
        } else {
            console.warn(`Cannot play ${hand} track - player not ready`);
        }
    }

    /**
     * Stop playing a track
     * @param {'Left'|'Right'} hand - Which hand's track to stop
     */
    stopTrack(hand) {
        const player = hand === 'Left' ? this.leftTrackPlayer : this.rightTrackPlayer;
        if (player) {
            player.stop();
            if (hand === 'Left') {
                stateStore.setState({ leftTrackPlaying: false });
            } else {
                stateStore.setState({ rightTrackPlaying: false });
            }
            console.log(`${hand} track stopped`);
        }
    }

    /**
     * Toggle play/pause for a track with proper resume functionality
     * @param {'Left'|'Right'} hand - Which hand's track to toggle
     */
    async toggleTrack(hand) {
        // Ensure audio context is running
        if (Tone.context.state !== 'running') {
            await Tone.start();
            console.log('Tone.js audio context started before toggle');
        }

        const player = hand === 'Left' ? this.leftTrackPlayer : this.rightTrackPlayer;
        const pauseState = this.pauseState[hand];

        console.log(`toggleTrack called for ${hand}:`, player ? `loaded=${player.loaded}, state=${player.state}` : 'no player');

        if (player && player.loaded) {
            if (player.state === 'started') {
                // PAUSE: Save current position and stop
                const elapsed = Tone.now() - pauseState.startTime;
                pauseState.pauseTime = elapsed;
                pauseState.isPaused = true;

                player.stop();

                if (hand === 'Left') {
                    stateStore.setState({ leftTrackPlaying: false });
                } else {
                    stateStore.setState({ rightTrackPlaying: false });
                }
                console.log(`${hand} track paused at ${elapsed.toFixed(2)}s`);
            } else {
                // RESUME/PLAY: Start from saved position
                let offset = 0;

                if (pauseState.isPaused && pauseState.pauseTime > 0) {
                    // Calculate offset within the track duration (for looping)
                    const duration = player.buffer.duration;
                    offset = pauseState.pauseTime % duration;
                    console.log(`${hand} track resuming from ${offset.toFixed(2)}s (duration: ${duration.toFixed(2)}s)`);
                } else {
                    console.log(`${hand} track starting from beginning`);
                }

                // Record the start time (adjusted for offset)
                pauseState.startTime = Tone.now() - offset;
                pauseState.isPaused = false;

                // Start playback with offset
                player.start(undefined, offset);

                if (hand === 'Left') {
                    stateStore.setState({ leftTrackPlaying: true });
                } else {
                    stateStore.setState({ rightTrackPlaying: true });
                }
            }
        } else {
            console.warn(`Cannot toggle ${hand} track - player not ready`);
        }
    }

    /**
     * Set volume for a track
     * @param {'Left'|'Right'} hand - Which hand's track
     * @param {number} volume - Volume from 0 to 1
     */
    setTrackVolume(hand, volume) {
        const clampedVolume = Math.max(0, Math.min(1, volume));
        if (hand === 'Left') {
            stateStore.setState({ leftTrackVolume: clampedVolume });
        } else {
            stateStore.setState({ rightTrackVolume: clampedVolume });
        }
    }
}

export const audioEngine = new AudioEngine();
