
class StateStore {
    constructor() {
        this.state = {
            beatGrid: Array(4).fill(null).map(() => Array(16).fill(false)), // 4 rows, 16 steps
            tempo: 120,
            isPlaying: false,
            currentStep: 0,
            selectedRow: 0,
            selectedColumn: 0,
            mode: "edit", // "edit" | "tempo" | "effects"
            // Track-related state
            leftTrackVolume: 0.7, // 0 to 1
            rightTrackVolume: 0.7, // 0 to 1
            leftTrackLoaded: false,
            rightTrackLoaded: false,
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
