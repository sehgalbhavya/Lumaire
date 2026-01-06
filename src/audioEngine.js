import * as Tone from 'tone';
import { stateStore } from './stateStore';

export class AudioEngine {
    constructor() {
        this.initialized = false;
        this.synth = null;
        this.instruments = {};

        // Track players (A and B)
        this.trackAPlayer = null;
        this.trackBPlayer = null;

        // EQ filters for bass and treble
        this.bassFilter = null;
        this.trebleFilter = null;

        // Per-track gain nodes for smooth crossfades and alignment
        this.trackAGain = null;
        this.trackBGain = null;
        // Pitch-shift nodes (used to compensate pitch when adjusting playbackRate)
        this.trackAPitch = null;
        this.trackBPitch = null;
        this.trackABPM = null;
        this.trackBBPM = null;
        // Pause state tracking for resume functionality
        this.pauseState = {
            A: { isPaused: false, pauseTime: 0, startTime: 0 },
            B: { isPaused: false, pauseTime: 0, startTime: 0 }
        };

        // Subscribe to state changes
        stateStore.subscribe((state) => {
            this.handleStateChange(state);
        });
    }

    /**
     * Estimate BPM from an AudioBuffer using a simple autocorrelation of the onset envelope.
     * Returns a numeric BPM estimate (floating).
     */
    estimateBPM(audioBuffer) {
        try {
            const sampleRate = audioBuffer.sampleRate;
            const channelData = audioBuffer.numberOfChannels > 0 ? audioBuffer.getChannelData(0) : null;
            if (!channelData) return 0;

            // Work with up to first 120 seconds to keep computation reasonable
            const maxSeconds = Math.min(120, audioBuffer.duration);
            const maxSamples = Math.floor(maxSeconds * sampleRate);
            const data = channelData.subarray(0, maxSamples);

            // Downsample to ~2000Hz for performance
            const targetRate = 2000;
            const hop = Math.max(1, Math.floor(sampleRate / targetRate));
            const down = new Float32Array(Math.floor(data.length / hop));
            for (let i = 0, j = 0; i < data.length && j < down.length; i += hop, j++) down[j] = Math.abs(data[i]);

            // Smooth envelope with moving average (window ~50ms)
            const smoothWindow = Math.max(1, Math.floor((0.05 * targetRate)));
            const env = new Float32Array(down.length);
            let sum = 0;
            for (let i = 0; i < down.length; i++) {
                sum += down[i];
                if (i >= smoothWindow) sum -= down[i - smoothWindow];
                env[i] = sum / Math.min(i + 1, smoothWindow);
            }

            // Autocorrelation over reasonable BPM range (60..180)
            const minBPM = 60, maxBPM = 180;
            const minLag = Math.floor((60 / maxBPM) * targetRate);
            const maxLag = Math.ceil((60 / minBPM) * targetRate);

            let bestLag = -1;
            let bestVal = -Infinity;
            for (let lag = minLag; lag <= maxLag; lag++) {
                let val = 0;
                for (let i = 0; i + lag < env.length; i++) val += env[i] * env[i + lag];
                if (val > bestVal) {
                    bestVal = val;
                    bestLag = lag;
                }
            }

            if (bestLag <= 0) return 0;
            const periodSec = bestLag / targetRate;
            const bpm = 60 / periodSec;
            return bpm;
        } catch (e) {
            console.warn('estimateBPM error', e);
            return 0;
        }
    }

    /**
     * Apply tempo matching so Track B follows Track A's BPM.
     * Uses playbackRate change + PitchShift compensation to preserve pitch.
     */
    applyTempoMatch() {
        if (!this.trackABPM || !this.trackBBPM || !this.trackBPlayer) return;
        const target = this.trackABPM;
        const source = this.trackBBPM;
        if (source <= 0) return;

        const rate = target / source;

        // Set playbackRate robustly
        try {
            if (this.trackBPlayer.playbackRate && typeof this.trackBPlayer.playbackRate === 'object' && this.trackBPlayer.playbackRate.value !== undefined) {
                this.trackBPlayer.playbackRate.value = rate;
            } else if (typeof this.trackBPlayer.playbackRate === 'number') {
                this.trackBPlayer.playbackRate = rate;
            } else if (this.trackBPlayer.set) {
                this.trackBPlayer.set({ playbackRate: rate });
            }
        } catch (e) {
            console.warn('Unable to set playbackRate on Track B', e);
        }

        // Compensate pitch change using PitchShift (semitones = 12*log2(rate))
        const semitones = 12 * Math.log2(rate || 1);
        const compensation = -semitones; // negate to cancel pitch change
        if (this.trackBPitch) {
            try {
                if (this.trackBPitch.pitch && this.trackBPitch.pitch.value !== undefined) {
                    this.trackBPitch.pitch.value = compensation;
                } else if (this.trackBPitch.set) {
                    this.trackBPitch.set({ pitch: compensation });
                } else {
                    this.trackBPitch.pitch = compensation;
                }
            } catch (e) {
                console.warn('Unable to set PitchShift for Track B', e);
            }
        }

        console.log(`Applied tempo match: TrackB rate=${rate.toFixed(3)}, pitch compensation=${compensation.toFixed(2)}st`);
    }

    async init() {
        if (this.initialized) return;

        await Tone.start();
        console.log('Audio Engine Initialized');

        // Initialize EQ filters
        // Bass: Low-shelf filter at 200Hz
        this.bassFilter = new Tone.Filter({
            type: 'lowshelf',
            frequency: 200,
            gain: 0
        }).toDestination();

        // Treble: High-shelf filter at 3000Hz
        this.trebleFilter = new Tone.Filter({
            type: 'highshelf',
            frequency: 3000,
            gain: 0
        }).connect(this.bassFilter);

        // FFT Analyzer for Audio Visualization (128 bins for edge detail)
        this.analyser = new Tone.Analyser('fft', 128);
        this.bassFilter.connect(this.analyser);

        console.log('EQ Filters & Analyser initialized');

        // Create per-track gain nodes and connect into the EQ chain
        this.trackAGain = new Tone.Gain(1).connect(this.trebleFilter);
        this.trackBGain = new Tone.Gain(1).connect(this.trebleFilter);

        // Create pitch-shift nodes and connect them into the per-track chains
        this.trackAPitch = new Tone.PitchShift(0).connect(this.trackAGain);
        this.trackBPitch = new Tone.PitchShift(0).connect(this.trackBGain);

        // Initialize Instruments (for sequencer - keeping for backwards compatibility)
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

    /**
     * Align the two loaded tracks to the current transport beat on a clap.
     * Performs a short crossfade while restarting track B (or A) at the computed offset
     * so both tracks share the same phase relative to the transport BPM.
     */
    async alignTracksOnClap() {
        if (!this.trackAPlayer || !this.trackBPlayer) return;

        // Ensure tempos are matched before phase alignment
        try {
            this.applyTempoMatch();
        } catch (e) {
            console.warn('applyTempoMatch error', e);
        }

        // Get beat duration from transport
        const bpm = Tone.Transport.bpm.value || 120;
        const beatDuration = 60 / bpm;

        // Helper to compute playback position for a player
        const getPosition = (player, trackKey) => {
            const pause = this.pauseState[trackKey];
            if (pause.isPaused) {
                return pause.pauseTime % player.buffer.duration;
            }
            // playing: elapsed = now - startTime
            const elapsed = Tone.now() - pause.startTime;
            return (elapsed % player.buffer.duration + player.buffer.duration) % player.buffer.duration;
        };

        try {
            const posA = getPosition(this.trackAPlayer, 'A');
            const posB = getPosition(this.trackBPlayer, 'B');

            // Position within the current beat
            const inBeatA = posA % beatDuration;
            const inBeatB = posB % beatDuration;

            // Compute smallest delta to align B to A (positive means B is behind and needs forward shift)
            let delta = inBeatA - inBeatB;
            // wrap to [-beatDuration/2, beatDuration/2]
            if (delta > beatDuration / 2) delta -= beatDuration;
            if (delta < -beatDuration / 2) delta += beatDuration;

            // New position for B to align to A
            const newPosB = (posB + delta + this.trackBPlayer.buffer.duration) % this.trackBPlayer.buffer.duration;

            const now = Tone.now();
            const fadeTime = 0.08; // 80ms quick crossfade

            // Perform crossfade: fade out B, restart at new offset, fade in
            if (this.trackBGain && this.trackBPlayer) {
                const gainNode = this.trackBGain.gain && this.trackBGain.gain instanceof AudioParam ? this.trackBGain.gain : null;
                if (gainNode) {
                    // linear ramp to near-zero
                    gainNode.cancelScheduledValues(now);
                    gainNode.linearRampToValueAtTime(0.0001, now + fadeTime);

                    // Stop and restart B shortly after fade
                    const restartTime = now + fadeTime + 0.01;
                    setTimeout(() => {
                        try {
                            this.trackBPlayer.stop();
                            // start at computed offset
                            this.pauseState.B.startTime = Tone.now() - newPosB;
                            this.trackBPlayer.start(undefined, newPosB);
                            // ensure gain is near 0 then ramp up
                            gainNode.setValueAtTime(0.0001, Tone.now());
                            gainNode.linearRampToValueAtTime(1.0, Tone.now() + fadeTime + 0.01);
                        } catch (e) {
                            console.warn('alignTracksOnClap restart error', e);
                        }
                    }, (fadeTime + 0.01) * 1000);
                }
            }

            console.log(`Tracks aligned on clap: delta=${(delta*1000).toFixed(1)}ms`);
        } catch (err) {
            console.error('Error aligning tracks on clap', err);
        }
    }

    /**
     * Calculate track volumes based on crossfader and master volume
     * Crossfader: 0 = Track A only, 0.5 = Both tracks, 1 = Track B only
     */
    calculateTrackVolumes(masterVolume, crossfaderPosition) {
        let trackAVolume, trackBVolume;

        // Crossfader logic:
        // - Position 0: Track A = 100%, Track B = 0%
        // - Position 0.5: Track A = 100%, Track B = 100%
        // - Position 1: Track A = 0%, Track B = 100%

        if (crossfaderPosition <= 0.5) {
            // Left half: Track A stays full, Track B fades in
            trackAVolume = 1;
            trackBVolume = crossfaderPosition * 2; // 0 -> 0, 0.5 -> 1
        } else {
            // Right half: Track A fades out, Track B stays full
            trackAVolume = 1 - (crossfaderPosition - 0.5) * 2; // 0.5 -> 1, 1 -> 0
            trackBVolume = 1;
        }

        // Apply master volume
        trackAVolume *= masterVolume;
        trackBVolume *= masterVolume;

        return { trackAVolume, trackBVolume };
    }

    handleStateChange(state) {
        if (!this.initialized) return;

        // Handle Play/Stop for sequencer
        if (state.isPlaying && Tone.Transport.state !== 'started') {
            Tone.Transport.start();
        } else if (!state.isPlaying && Tone.Transport.state === 'started') {
            Tone.Transport.stop();
        }

        // Handle Tempo
        Tone.Transport.bpm.value = state.tempo;

        // Calculate and apply track volumes based on crossfader and master volume
        const { trackAVolume, trackBVolume } = this.calculateTrackVolumes(
            state.masterVolume,
            state.crossfaderPosition
        );

        // Apply to Track A
        if (this.trackAPlayer) {
            const dbA = trackAVolume === 0 ? -Infinity : -40 * (1 - trackAVolume);
            this.trackAPlayer.volume.value = dbA;
        }

        // Apply to Track B
        if (this.trackBPlayer) {
            const dbB = trackBVolume === 0 ? -Infinity : -40 * (1 - trackBVolume);
            this.trackBPlayer.volume.value = dbB;
        }

        // Apply EQ (bass and treble)
        // Map -1 to +1 range to -12dB to +12dB
        if (this.bassFilter) {
            this.bassFilter.gain.value = state.bass * 12;
        }
        if (this.trebleFilter) {
            this.trebleFilter.gain.value = state.treble * 12;
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
     * @param {'A'|'B'} track - Which track to load (A or B)
     */
    async loadTrack(file, track) {
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
        console.log(`Loading Track ${track} from: ${url}`);

        // Stop and dispose of existing player if any
        if (track === 'A' && this.trackAPlayer) {
            this.trackAPlayer.stop();
            this.trackAPlayer.dispose();
            this.trackAPlayer = null;
        } else if (track === 'B' && this.trackBPlayer) {
            this.trackBPlayer.stop();
            this.trackBPlayer.dispose();
            this.trackBPlayer = null;
        }

        // Reset pause state for this track
        this.pauseState[track] = { isPaused: false, pauseTime: 0, startTime: 0 };

        // Create new player with promise-based loading
        // Connect through EQ chain: Player -> Treble -> Bass -> Destination
        return new Promise((resolve, reject) => {
            const player = new Tone.Player({
                url: url,
                loop: true,
                autostart: false,
                onload: () => {
                    console.log(`Track ${track} loaded successfully: ${file.name}`);

                    // Store the player and connect to per-track gain
                    if (track === 'A') {
                        this.trackAPlayer = player;
                        if (this.trackAPitch) player.connect(this.trackAPitch);
                        stateStore.setState({ trackALoaded: true });
                    } else {
                        this.trackBPlayer = player;
                        if (this.trackBPitch) player.connect(this.trackBPitch);
                        stateStore.setState({ trackBLoaded: true });
                    }

                    // Apply current volume based on crossfader and master
                    const state = stateStore.getState();
                    const { trackAVolume, trackBVolume } = this.calculateTrackVolumes(
                        state.masterVolume,
                        state.crossfaderPosition
                    );
                    const volume = track === 'A' ? trackAVolume : trackBVolume;
                    const db = volume === 0 ? -Infinity : -40 * (1 - volume);
                    player.volume.value = db;
                    console.log(`Track ${track} volume set to ${db.toFixed(1)}dB`);

                    // Estimate BPM asynchronously (non-blocking)
                    try {
                        const audioBuf = player.buffer && typeof player.buffer.get === 'function' ? player.buffer.get() : player.buffer;
                        if (audioBuf) {
                            const estimated = this.estimateBPM(audioBuf);
                            if (track === 'A') this.trackABPM = estimated;
                            else this.trackBBPM = estimated;
                            console.log(`Estimated BPM for Track ${track}: ${estimated.toFixed(1)}`);
                        }
                    } catch (e) {
                        console.warn('BPM estimation failed', e);
                    }

                    // If both BPMs available we keep them for manual/clap-triggered matching.
                    // Tempo matching will only run when a clap triggers `alignTracksOnClap()`.

                    resolve(player);
                },
                onerror: (error) => {
                    console.error(`Error loading Track ${track}:`, error);
                    reject(error);
                }
            });
        });
    }

    /**
     * Toggle play/pause for BOTH tracks (overall play/pause)
     * Used by right hand quick pinch
     */
    async toggleAllTracks() {
        // Ensure audio context is running
        if (Tone.context.state !== 'running') {
            await Tone.start();
            console.log('Tone.js audio context started before toggle');
        }

        const state = stateStore.getState();
        const anyPlaying = state.trackAPlaying || state.trackBPlaying;

        console.log(`toggleAllTracks called - currently ${anyPlaying ? 'playing' : 'paused'}`);

        if (anyPlaying) {
            // PAUSE both tracks
            await this.pauseTrack('A');
            await this.pauseTrack('B');
            stateStore.setState({ isPlaying: false });
            console.log('All tracks paused');
        } else {
            // PLAY both tracks (if loaded)
            let anyStarted = false;
            if (this.trackAPlayer && this.trackAPlayer.loaded) {
                await this.resumeTrack('A');
                anyStarted = true;
            }
            if (this.trackBPlayer && this.trackBPlayer.loaded) {
                await this.resumeTrack('B');
                anyStarted = true;
            }
            if (anyStarted) {
                stateStore.setState({ isPlaying: true });
                console.log('All tracks started');
            } else {
                console.warn('No tracks loaded to play');
            }
        }
    }

    /**
     * Pause a single track with position saving
     */
    async pauseTrack(track) {
        const player = track === 'A' ? this.trackAPlayer : this.trackBPlayer;
        const pauseState = this.pauseState[track];

        if (player && player.state === 'started') {
            const elapsed = Tone.now() - pauseState.startTime;
            pauseState.pauseTime = elapsed;
            pauseState.isPaused = true;
            player.stop();

            if (track === 'A') {
                stateStore.setState({ trackAPlaying: false });
            } else {
                stateStore.setState({ trackBPlaying: false });
            }
            console.log(`Track ${track} paused at ${elapsed.toFixed(2)}s`);
        }
    }

    /**
     * Resume a single track from saved position
     */
    async resumeTrack(track) {
        const player = track === 'A' ? this.trackAPlayer : this.trackBPlayer;
        const pauseState = this.pauseState[track];

        if (player && player.loaded) {
            let offset = 0;

            if (pauseState.isPaused && pauseState.pauseTime > 0) {
                const duration = player.buffer.duration;
                offset = pauseState.pauseTime % duration;
                console.log(`Track ${track} resuming from ${offset.toFixed(2)}s`);
            } else {
                console.log(`Track ${track} starting from beginning`);
            }

            pauseState.startTime = Tone.now() - offset;
            pauseState.isPaused = false;
            player.start(undefined, offset);

            if (track === 'A') {
                stateStore.setState({ trackAPlaying: true });
            } else {
                stateStore.setState({ trackBPlaying: true });
            }
        }
    }

    /**
     * Set master volume (0 to 1)
     * Used by right hand pinch + up/down
     */
    setMasterVolume(volume) {
        const clampedVolume = Math.max(0, Math.min(1, volume));
        stateStore.setState({ masterVolume: clampedVolume });
    }

    /**
     * Set crossfader position (0 to 1)
     * 0 = Track A only, 0.5 = Both, 1 = Track B only
     * Used by left hand pinch + move
     */
    setCrossfaderPosition(position) {
        const clampedPosition = Math.max(0, Math.min(1, position));
        stateStore.setState({ crossfaderPosition: clampedPosition });
    }

    /**
     * Set bass level (-1 to +1)
     * -1 = -12dB cut, 0 = neutral, +1 = +12dB boost
     * Used by right fist + up/down
     */
    setBass(level) {
        const clampedLevel = Math.max(-1, Math.min(1, level));
        stateStore.setState({ bass: clampedLevel });
    }

    /**
     * Set treble level (-1 to +1)
     * -1 = -12dB cut, 0 = neutral, +1 = +12dB boost
     * Used by left fist + up/down
     */
    setTreble(level) {
        const clampedLevel = Math.max(-1, Math.min(1, level));
        stateStore.setState({ treble: clampedLevel });
    }
}

export const audioEngine = new AudioEngine();
