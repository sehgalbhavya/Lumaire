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
        this.drawTrackInfo(handsData, width, height);
        this.drawHandInfo(handsData, width, height);
    }

    /**
     * Draw track volume indicators on screen
     * Shows visual feedback for each hand's track status and volume level
     */
    drawTrackInfo(handsData, width, height) {
        const state = stateStore.getState();
        const ctx = this.ctx;

        ctx.save();

        // Left Track Indicator (left side of screen)
        this.drawTrackIndicator(ctx, 50, height / 2, 'Left', state.leftTrackLoaded, state.leftTrackVolume, state.leftTrackPlaying);

        // Right Track Indicator (right side of screen)
        this.drawTrackIndicator(ctx, width - 50, height / 2, 'Right', state.rightTrackLoaded, state.rightTrackVolume, state.rightTrackPlaying);

        ctx.restore();
    }

    /**
     * Draw a single track's volume indicator
     */
    drawTrackIndicator(ctx, x, y, label, isLoaded, volume, isPlaying) {
        const barWidth = 30;
        const barHeight = 200;
        const barY = y - barHeight / 2;

        // Background bar
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x - barWidth / 2, barY, barWidth, barHeight);

        // Border - different color when playing
        ctx.strokeStyle = isPlaying ? 'rgba(255, 215, 0, 0.9)' : 'rgba(56, 239, 125, 0.8)';
        ctx.lineWidth = isPlaying ? 3 : 2;
        ctx.strokeRect(x - barWidth / 2, barY, barWidth, barHeight);

        // Volume fill (from bottom up) - always show, not just when loaded
        const fillHeight = volume * barHeight;
        const gradient = ctx.createLinearGradient(0, barY + barHeight, 0, barY);

        if (isPlaying) {
            gradient.addColorStop(0, '#ffd700');
            gradient.addColorStop(1, '#ff8c00');
        } else {
            gradient.addColorStop(0, '#11998e');
            gradient.addColorStop(1, '#38ef7d');
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(x - barWidth / 2 + 2, barY + barHeight - fillHeight, barWidth - 4, fillHeight);

        // Volume percentage text - always show
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(volume * 100)}%`, x, barY - 10);

        // Label
        ctx.fillStyle = isPlaying ? '#ffd700' : '#38ef7d';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, barY + barHeight + 25);

        // Play/Pause Status
        if (isLoaded) {
            ctx.font = 'bold 14px Arial';
            ctx.fillStyle = isPlaying ? '#ffd700' : '#38ef7d';
            ctx.fillText(isPlaying ? '▶️ PLAYING' : '⏸️ PAUSED', x, barY + barHeight + 45);
        } else {
            ctx.font = '12px Arial';
            ctx.fillStyle = '#888';
            ctx.fillText('(no track)', x, barY + barHeight + 45);
        }

        // Hint for pinch gesture
        ctx.font = '10px Arial';
        ctx.fillStyle = '#666';
        ctx.fillText('Pinch: Play/Pause', x, barY + barHeight + 65);
        ctx.fillText('Pinch+Move: Volume', x, barY + barHeight + 80);
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

            // Show hand label, gesture, and track status
            const trackStatus = hand.hasTrackLoaded ? '🎵' : '';
            const text = `${hand.label} ${trackStatus} | ${hand.gesture}`;

            this.ctx.strokeText(text, x, y);
            this.ctx.fillText(text, x, y);

            // Draw Pinch Indicators
            if (hand.pinches) {
                // Index Pinch - Volume Control
                if (hand.pinches.index) {
                    const indexTip = hand.landmarks[8];
                    const ix = (1 - indexTip.x) * width;
                    const iy = indexTip.y * height;

                    // Larger, more visible indicator for volume control
                    this.ctx.beginPath();
                    this.ctx.arc(ix, iy, 20, 0, 2 * Math.PI);
                    this.ctx.fillStyle = "rgba(56, 239, 125, 0.8)";
                    this.ctx.fill();

                    // Label - always show VOL since volume control works without tracks
                    this.ctx.fillStyle = "white";
                    this.ctx.strokeText("VOL ↕", ix + 25, iy);
                    this.ctx.fillText("VOL ↕", ix + 25, iy);
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
