import { stateStore } from './stateStore';
import { HAND_CONNECTIONS } from '@mediapipe/hands';

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

        // Video source dimensions (HD)
        const videoWidth = 1280;
        const videoHeight = 720;

        // Calculate COVER scale (fill screen, crop excess)
        const scale = Math.max(width / videoWidth, height / videoHeight);
        const scaledWidth = videoWidth * scale;
        const scaledHeight = videoHeight * scale;

        // Center the video
        const xOffset = (width - scaledWidth) / 2;
        const yOffset = (height - scaledHeight) / 2;

        ctx.save();
        ctx.clearRect(0, 0, width, height);

        // Mirror the content
        ctx.translate(width, 0);
        ctx.scale(-1, 1);

        // Draw video (Cover mode)
        ctx.drawImage(results.image, xOffset, yOffset, scaledWidth, scaledHeight);

        // Draw Landmarks with custom scaling
        if (results.multiHandLandmarks) {
            for (const landmarks of results.multiHandLandmarks) {
                this.drawSkeleton(ctx, landmarks, xOffset, yOffset, scaledWidth, scaledHeight);
            }
        }

        ctx.restore();

        // Draw DJ UI (not mirrored, full canvas overlay)
        const state = stateStore.getState();
        this.drawDJInterface(ctx, width, height, state);

        // Draw Hand Info (requires same coordinate transform as video)
        this.drawHandInfo(handsData, width, height, xOffset, yOffset, scaledWidth, scaledHeight);
    }

    /**
     * Custom skeleton drawer to match video scaling
     */
    drawSkeleton(ctx, landmarks, dx, dy, dw, dh) {
        // Draw Connectors
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#00FF00';
        for (const [start, end] of HAND_CONNECTIONS) {
            const p1 = landmarks[start];
            const p2 = landmarks[end];
            ctx.beginPath();
            ctx.moveTo(p1.x * dw + dx, p1.y * dh + dy);
            ctx.lineTo(p2.x * dw + dx, p2.y * dh + dy);
            ctx.stroke();
        }

        // Draw Landmarks
        ctx.fillStyle = '#FF0000';
        for (const point of landmarks) {
            const px = point.x * dw + dx;
            const py = point.y * dh + dy;
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, 2 * Math.PI); // Radius 3
            ctx.fill();
        }
    }

    /**
     * Draw the DJ mixing interface
     */
    drawDJInterface(ctx, width, height, state) {
        ctx.save();

        // Bottom Y position for all volume indicators
        const bottomY = height - 150;

        // Draw crossfader at bottom center
        this.drawCrossfader(ctx, width / 2, height - 60, state);

        // Draw Track A indicator (bottom left)
        this.drawTrackIndicator(ctx, 70, bottomY, 'A', state.trackALoaded, state.trackAPlaying, state);

        // Draw Track B indicator (bottom right)
        this.drawTrackIndicator(ctx, width - 70, bottomY, 'B', state.trackBLoaded, state.trackBPlaying, state);

        // Draw master volume (bottom center-right, between crossfader and Track B)
        this.drawMasterVolume(ctx, width - 180, bottomY, state);

        // Draw EQ indicators (top left area)
        this.drawEQIndicator(ctx, 60, 120, 'Bass', state.bass, '#ff6b35');
        this.drawEQIndicator(ctx, 140, 120, 'Treble', state.treble, '#4ecdc4');

        // Draw overall play status (top center)
        this.drawPlayStatus(ctx, width / 2, 50, state);

        ctx.restore();
    }

    /**
     * Draw the crossfader (horizontal slider at bottom)
     */
    drawCrossfader(ctx, x, y, state) {
        const barWidth = 300;
        const barHeight = 30;
        const barX = x - barWidth / 2;
        const barY = y - barHeight / 2;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // Border
        ctx.strokeStyle = 'rgba(138, 43, 226, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barWidth, barHeight);

        // Track A side (left gradient)
        const leftGradient = ctx.createLinearGradient(barX, 0, barX + barWidth / 2, 0);
        leftGradient.addColorStop(0, 'rgba(56, 239, 125, 0.8)');
        leftGradient.addColorStop(1, 'rgba(56, 239, 125, 0.2)');
        ctx.fillStyle = leftGradient;
        ctx.fillRect(barX + 2, barY + 2, barWidth / 2 - 4, barHeight - 4);

        // Track B side (right gradient)
        const rightGradient = ctx.createLinearGradient(barX + barWidth / 2, 0, barX + barWidth, 0);
        rightGradient.addColorStop(0, 'rgba(255, 107, 107, 0.2)');
        rightGradient.addColorStop(1, 'rgba(255, 107, 107, 0.8)');
        ctx.fillStyle = rightGradient;
        ctx.fillRect(barX + barWidth / 2 + 2, barY + 2, barWidth / 2 - 4, barHeight - 4);

        // Crossfader position indicator (thumb)
        const thumbX = barX + state.crossfaderPosition * barWidth;
        ctx.fillStyle = 'white';
        ctx.fillRect(thumbX - 5, barY - 5, 10, barHeight + 10);
        ctx.strokeStyle = 'rgba(138, 43, 226, 1)';
        ctx.lineWidth = 2;
        ctx.strokeRect(thumbX - 5, barY - 5, 10, barHeight + 10);

        // Labels
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#38ef7d';
        ctx.fillText('A', barX + 10, barY + barHeight / 2 + 4);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#ff6b6b';
        ctx.fillText('B', barX + barWidth - 10, barY + barHeight / 2 + 4);

        // Position percentage
        ctx.textAlign = 'center';
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.fillText(`${Math.round(state.crossfaderPosition * 100)}%`, x, barY - 15);

        // Description
        ctx.font = '11px Arial';
        ctx.fillStyle = '#aaa';
        let desc;
        if (state.crossfaderPosition < 0.25) {
            desc = 'Track A';
        } else if (state.crossfaderPosition > 0.75) {
            desc = 'Track B';
        } else {
            desc = 'Both Tracks';
        }
        ctx.fillText(desc, x, barY + barHeight + 18);
    }

    /**
     * Draw master volume indicator (vertical bar)
     */
    drawMasterVolume(ctx, x, y, state) {
        const barWidth = 25;
        const barHeight = 120;
        const barY = y - barHeight / 2;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x - barWidth / 2, barY, barWidth, barHeight);

        // Border
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - barWidth / 2, barY, barWidth, barHeight);

        // Volume fill
        const fillHeight = state.masterVolume * barHeight;
        const gradient = ctx.createLinearGradient(0, barY + barHeight, 0, barY);
        gradient.addColorStop(0, '#ffd700');
        gradient.addColorStop(1, '#ff8c00');

        ctx.fillStyle = gradient;
        ctx.fillRect(x - barWidth / 2 + 2, barY + barHeight - fillHeight, barWidth - 4, fillHeight);

        // Volume percentage
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(state.masterVolume * 100)}%`, x, barY - 8);

        // Label
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 10px Arial';
        ctx.fillText('MASTER', x, barY + barHeight + 15);
    }

    /**
     * Draw track status indicator
     */
    drawTrackIndicator(ctx, x, y, trackLabel, isLoaded, isPlaying, state) {
        const barWidth = 25;
        const barHeight = 120;
        const barY = y - barHeight / 2;

        // Calculate effective volume from crossfader
        let effectiveVolume;
        if (trackLabel === 'A') {
            if (state.crossfaderPosition <= 0.5) {
                effectiveVolume = 1;
            } else {
                effectiveVolume = 1 - (state.crossfaderPosition - 0.5) * 2;
            }
        } else {
            if (state.crossfaderPosition >= 0.5) {
                effectiveVolume = 1;
            } else {
                effectiveVolume = state.crossfaderPosition * 2;
            }
        }
        effectiveVolume *= state.masterVolume;

        const trackColor = trackLabel === 'A' ? '#38ef7d' : '#ff6b6b';

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x - barWidth / 2, barY, barWidth, barHeight);

        // Border
        ctx.strokeStyle = isPlaying ? trackColor : 'rgba(100, 100, 100, 0.5)';
        ctx.lineWidth = isPlaying ? 3 : 2;
        ctx.strokeRect(x - barWidth / 2, barY, barWidth, barHeight);

        // Volume fill
        const fillHeight = effectiveVolume * barHeight;
        ctx.fillStyle = trackColor;
        ctx.globalAlpha = isPlaying ? 0.8 : 0.3;
        ctx.fillRect(x - barWidth / 2 + 2, barY + barHeight - fillHeight, barWidth - 4, fillHeight);
        ctx.globalAlpha = 1;

        // Track label
        ctx.fillStyle = isLoaded ? trackColor : '#666';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Track ${trackLabel}`, x, barY - 8);

        // Status
        ctx.font = '12px Arial';
        if (!isLoaded) {
            ctx.fillStyle = '#666';
            ctx.fillText('No File', x, barY + barHeight + 20);
        } else {
            ctx.fillStyle = isPlaying ? trackColor : '#888';
            ctx.fillText(isPlaying ? '▶ Playing' : '⏸ Paused', x, barY + barHeight + 20);
        }

        // Effective volume
        ctx.font = '10px Arial';
        ctx.fillStyle = '#aaa';
        ctx.fillText(`${Math.round(effectiveVolume * 100)}%`, x, barY + barHeight + 38);
    }

    /**
     * Draw EQ indicator (bass or treble)
     * Value ranges from -1 (cut) to +1 (boost), 0 is neutral
     */
    drawEQIndicator(ctx, x, y, label, value, color) {
        const barWidth = 25;
        const barHeight = 80;
        const barY = y - barHeight / 2;
        const centerY = y; // Center line (neutral position)

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(x - barWidth / 2, barY, barWidth, barHeight);

        // Border
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - barWidth / 2, barY, barWidth, barHeight);

        // Center line (neutral)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - barWidth / 2, centerY);
        ctx.lineTo(x + barWidth / 2, centerY);
        ctx.stroke();

        // Value fill
        // Positive value (boost): fill upward from center
        // Negative value (cut): fill downward from center
        const fillHeight = Math.abs(value) * (barHeight / 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.7;

        if (value >= 0) {
            // Boost: fill upward
            ctx.fillRect(x - barWidth / 2 + 3, centerY - fillHeight, barWidth - 6, fillHeight);
        } else {
            // Cut: fill downward
            ctx.fillRect(x - barWidth / 2 + 3, centerY, barWidth - 6, fillHeight);
        }
        ctx.globalAlpha = 1;

        // Label
        ctx.fillStyle = color;
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, barY - 8);

        // dB value
        const dbValue = Math.round(value * 12);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 11px Arial';
        ctx.fillText(`${dbValue >= 0 ? '+' : ''}${dbValue}dB`, x, barY + barHeight + 15);
    }

    /**
     * Draw overall play status
     */
    drawPlayStatus(ctx, x, y, state) {
        const isPlaying = state.trackAPlaying || state.trackBPlaying;

        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = isPlaying ? '#ffd700' : '#888';
        ctx.fillText(isPlaying ? '▶ PLAYING' : '⏸ PAUSED', x, y);

        ctx.font = '12px Arial';
        ctx.fillStyle = '#666';
        ctx.fillText('Right Hand: Quick Pinch to Play/Pause', x, y + 20);
    }

    drawHandInfo(handsData, width, height, dx, dy, dw, dh) {
        if (!handsData) return;

        this.ctx.save();
        this.ctx.font = "18px Arial";
        this.ctx.fillStyle = "white";
        this.ctx.strokeStyle = "black";
        this.ctx.lineWidth = 3;

        handsData.forEach(hand => {
            const wrist = hand.landmarks[0];
            // Adjust coordinates to match video scaling and mirroring
            // Video is mirrored so X is flipped relative to canvas width
            const x = (1 - wrist.x) * dw + dx;
            const y = wrist.y * dh + dy;

            // Show hand label and control type
            const controlType = hand.controlType || '';
            const text = `${hand.label} | ${controlType}`;

            this.ctx.strokeText(text, x, y);
            this.ctx.fillText(text, x, y);

            // Draw Pinch Indicators
            if (hand.pinches && hand.pinches.index) {
                const indexTip = hand.landmarks[8];
                const ix = (1 - indexTip.x) * dw + dx;
                const iy = indexTip.y * dh + dy;

                // Circle indicator
                this.ctx.beginPath();
                this.ctx.arc(ix, iy, 20, 0, 2 * Math.PI);

                if (hand.label === 'Right') {
                    this.ctx.fillStyle = "rgba(255, 215, 0, 0.8)"; // Gold for master
                } else {
                    this.ctx.fillStyle = "rgba(138, 43, 226, 0.8)"; // Purple for crossfader
                }
                this.ctx.fill();

                // Label
                this.ctx.fillStyle = "white";
                const label = hand.label === 'Right' ? 'MASTER ↕' : 'XFADE ↕';
                this.ctx.strokeText(label, ix + 25, iy);
                this.ctx.fillText(label, ix + 25, iy);
            }
        });
        this.ctx.restore();
    }
}

export const visualEngine = new VisualEngine();
