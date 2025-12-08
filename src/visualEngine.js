import { stateStore } from './stateStore';
import { HAND_CONNECTIONS } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

export class VisualEngine {
    constructor() {
        this.canvas = null;
        this.ctx = null;
    }

    init(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.resize();

        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        if (this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    }

    draw(results, handsData) {
        if (!this.ctx || !this.canvas) return;

        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.save();
        ctx.clearRect(0, 0, width, height);

        // Mirror the content
        ctx.translate(width, 0);
        ctx.scale(-1, 1);

        // Draw video
        ctx.drawImage(results.image, 0, 0, width, height);

        // Draw Landmarks
        if (results.multiHandLandmarks) {
            for (const landmarks of results.multiHandLandmarks) {
                drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
                drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 2 });
            }
        }

        ctx.restore();

        // Draw UI (not mirrored)
        this.drawGrid(width, height);
        this.drawHandInfo(handsData, width, height);
    }

    drawGrid(width, height) {
        const state = stateStore.getState();
        const rows = 4;
        const cols = 8;
        const rowHeight = height / rows;
        const colWidth = width / cols;

        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.lineWidth = 2;

        // Draw Rows
        for (let i = 0; i < rows; i++) {
            const y = i * rowHeight;

            // Highlight selected row
            if (i === state.selectedRow) {
                this.ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
                this.ctx.fillRect(0, y, width, rowHeight);
            }

            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
        }

        // Draw Columns
        for (let j = 0; j < cols; j++) {
            const x = j * colWidth;

            // Highlight selected column
            if (j === state.selectedColumn) {
                this.ctx.fillStyle = 'rgba(0, 0, 255, 0.1)';
                this.ctx.fillRect(x, 0, colWidth, height);
            }

            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
            this.ctx.stroke();
        }

        // Draw Active Beats
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                if (state.beatGrid[i][j]) {
                    const x = j * colWidth;
                    const y = i * rowHeight;

                    this.ctx.fillStyle = 'rgba(0, 255, 255, 0.6)';
                    this.ctx.fillRect(x + 5, y + 5, colWidth - 10, rowHeight - 10);
                }
            }
        }

        // Highlight Active Cell (Intersection)
        const activeX = state.selectedColumn * colWidth;
        const activeY = state.selectedRow * rowHeight;

        this.ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
        this.ctx.fillRect(activeX, activeY, colWidth, rowHeight);

        // Draw border for active cell
        this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(activeX, activeY, colWidth, rowHeight);

        // Draw Playhead
        if (state.isPlaying) {
            const playheadX = state.currentStep * (width / 16); // 16 steps total

            this.ctx.beginPath();
            this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
            this.ctx.lineWidth = 4;
            this.ctx.moveTo(playheadX, 0);
            this.ctx.lineTo(playheadX, height);
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    drawHandInfo(handsData, width, height) {
        if (!handsData) return;

        this.ctx.save();
        this.ctx.font = "20px Arial";
        this.ctx.fillStyle = "white";
        this.ctx.strokeStyle = "black";
        this.ctx.lineWidth = 3;

        handsData.forEach(hand => {
            const wrist = hand.landmarks[0];
            // Flip x because of mirroring
            const x = (1 - wrist.x) * width;
            const y = wrist.y * height;

            const text = `${hand.label} | ${hand.gesture}`;

            this.ctx.strokeText(text, x, y);
            this.ctx.fillText(text, x, y);

            // Draw Pinch Indicators
            if (hand.pinches) {
                // Index Pinch
                if (hand.pinches.index) {
                    const indexTip = hand.landmarks[8];
                    const ix = (1 - indexTip.x) * width;
                    const iy = indexTip.y * height;

                    this.ctx.beginPath();
                    this.ctx.arc(ix, iy, 15, 0, 2 * Math.PI);
                    this.ctx.fillStyle = "yellow";
                    this.ctx.fill();

                    this.ctx.strokeText("INDEX", ix + 20, iy);
                    this.ctx.fillText("INDEX", ix + 20, iy);
                }

                // Middle Pinch
                if (hand.pinches.middle) {
                    const middleTip = hand.landmarks[12];
                    const mx = (1 - middleTip.x) * width;
                    const my = middleTip.y * height;

                    this.ctx.beginPath();
                    this.ctx.arc(mx, my, 15, 0, 2 * Math.PI);
                    this.ctx.fillStyle = "cyan";
                    this.ctx.fill();

                    this.ctx.strokeText("MIDDLE", mx + 20, my);
                    this.ctx.fillText("MIDDLE", mx + 20, my);
                }
            }
        });
        this.ctx.restore();
    }
}

export const visualEngine = new VisualEngine();
