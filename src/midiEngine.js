import { audioEngine } from './audioEngine';
import { stateStore } from './stateStore';

class MidiEngine {
    constructor() {
        this.midiAccess = null;
    }

    async init() {
        if (!navigator.requestMIDIAccess) {
            console.warn('❌ Web MIDI API not supported in this browser');
            return;
        }

        try {
            this.midiAccess = await navigator.requestMIDIAccess();
            console.log('🎹 MIDI Engine initialized');

            for (const input of this.midiAccess.inputs.values()) {
                console.log('🎛️ MIDI Input detected:', input.name);
                input.onmidimessage = (e) => this.handleMidiMessage(e);
            }

            this.midiAccess.onstatechange = (e) => {
                console.log('🔌 MIDI state change:', e.port.name, e.port.state);
            };
        } catch (err) {
            console.error('❌ Failed to init MIDI:', err);
        }
    }

    handleMidiMessage(e) {
        const [status, data1, data2] = e.data;
        const type = status & 0xf0;

        // Control Change (sliders / knobs)
        if (type === 0xb0) {
            const value = data2 / 127;
            this.handleCC(data1, value);
        }

    }

    handleCC(cc, value) {
        const s = stateStore.getState();
        switch (cc) {
            case 0: // Slider 1 → Master volume
                audioEngine.setMasterVolume(value);
                break;

            case 1: // Slider 2 → Crossfader
                audioEngine.setCrossfaderPosition(value);
                break;

            case 16: // Knob 1 → Bass (-1..1)
                audioEngine.setBass(value * 2 - 1);
                break;

            case 17: // Knob 2 → Treble (-1..1)
                audioEngine.setTreble(value * 2 - 1);
                break;
            case 32:
                if(value==1)
                {
                    if (s.trackAPlaying) 
                    {
                        audioEngine.pauseTrack('A');
                    }
                    else 
                    {
                        audioEngine.resumeTrack('A');
                    }
                }
                break;
            case 33:
                if(value==1)
                {
                    if (s.trackBPlaying) 
                    {
                        audioEngine.pauseTrack('B');
                    }
                    else 
                    {
                        audioEngine.resumeTrack('B');
                    }
                }
                
                break;
            case 41: // Play → toggle all
                if(value==1){
                    audioEngine.toggleAllTracks();
                }
                break;

            case 42: // Stop → pause all
                if (s.trackAPlaying && value==1) audioEngine.pauseTrack('A');
                if (s.trackBPlaying && value==1) audioEngine.pauseTrack('B');
                break;

            case 45: // Rec → Clap trigger
                stateStore.setState({ lastClapTs: Date.now() });
                break;
        }
    }

}

export const midiEngine = new MidiEngine();
