
class StateStore {
    constructor() {
        this.state = {
            beatGrid: Array(4).fill(null).map(() => Array(16).fill(false)), // 4 rows, 16 steps
            tempo: 120,
            isPlaying: false, // Overall play/pause state
            currentStep: 0,
            selectedRow: 0,
            selectedColumn: 0,
            mode: "edit", // "edit" | "tempo" | "effects"

            // DJ Mixing Controls
            masterVolume: 0.7, // 0 to 1 - Overall volume (Right hand pinch + up/down)
            crossfaderPosition: 0.5, // 0 to 1 - Crossfader (Left hand pinch + move)
            // 0 = Track A only, 0.5 = Both tracks, 1 = Track B only

            // Track A (was left track)
            trackALoaded: false,
            trackAPlaying: false,

            // Track B (was right track)
            trackBLoaded: false,
            trackBPlaying: false,
        };
        this.listeners = new Set();
    }

    getState() {
        return this.state;
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.notify();
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }
}

export const stateStore = new StateStore();
