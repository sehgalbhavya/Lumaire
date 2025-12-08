import * as Tone from 'tone';
import { stateStore } from './stateStore';

export class AudioEngine {
    constructor() {
        this.initialized = false;
        this.synth = null;
        this.instruments = {};

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
}

export const audioEngine = new AudioEngine();
