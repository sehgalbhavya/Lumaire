import { stateStore } from './stateStore';
import { HAND_CONNECTIONS } from '@mediapipe/hands';
import { audioEngine } from './audioEngine';

export class VisualEngine {
    constructor() {
        this.canvas = null;
        this.ctx = null;

        // Clap display state: keep showing notification for this many ms after detection
        this.lastClapTs = 0;
        this.clapDisplayMs = 1000; // 1000ms = 1s
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

        // Draw Audio Visualizer (edge waves)
        this.drawAudioVisualizer(ctx, width, height);

        // Draw DJ UI (not mirrored, full canvas overlay)
        const state = stateStore.getState();
        this.drawDJInterface(ctx, width, height, state);

        // Show clap notification if detected in this frame
        this.drawClapNotification(handsData, ctx, width, height);

        // Draw Hand Info (requires same coordinate transform as video)
        this.drawHandInfo(handsData, width, height, xOffset, yOffset, scaledWidth, scaledHeight);

        // Easter Egg: Check for middle finger gesture
        this.drawEasterEgg(handsData, width, height);
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

        // Bottom Y position for controls
        const bottomY = height - 150;

        // Draw crossfader at bottom center
        this.drawCrossfader(ctx, width / 2, height - 60, state);

        // Bottom right control group: Master + Bass + Treble
        const rightGroupX = width - 140;
        this.drawMasterVolume(ctx, rightGroupX, bottomY, state);
        this.drawEQIndicator(ctx, rightGroupX - 50, bottomY, 'Bass', state.bass, '#F5C77E');
        this.drawEQIndicator(ctx, rightGroupX + 50, bottomY, 'Treble', state.treble, '#A8C5D9');

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
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);

        // Track A side (left gradient)
        const leftGradient = ctx.createLinearGradient(barX, 0, barX + barWidth / 2, 0);
        leftGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        leftGradient.addColorStop(1, 'rgba(255, 255, 255, 0.1)');
        ctx.fillStyle = leftGradient;
        ctx.fillRect(barX + 2, barY + 2, barWidth / 2 - 4, barHeight - 4);

        // Track B side (right gradient)
        const rightGradient = ctx.createLinearGradient(barX + barWidth / 2, 0, barX + barWidth, 0);
        rightGradient.addColorStop(0, 'rgba(200, 180, 140, 0.1)');
        rightGradient.addColorStop(1, 'rgba(200, 180, 140, 0.4)');
        ctx.fillStyle = rightGradient;
        ctx.fillRect(barX + barWidth / 2 + 2, barY + 2, barWidth / 2 - 4, barHeight - 4);

        // Crossfader position indicator (thumb)
        const thumbX = barX + state.crossfaderPosition * barWidth;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fillRect(thumbX - 4, barY - 4, 8, barHeight + 8);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(thumbX - 4, barY - 4, 8, barHeight + 8);

        // Labels
        ctx.font = '500 11px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillText('A', barX + 10, barY + barHeight / 2 + 4);

        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(200, 180, 140, 0.7)';
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
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x - barWidth / 2, barY, barWidth, barHeight);

        // Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - barWidth / 2, barY, barWidth, barHeight);

        // Volume fill
        const fillHeight = state.masterVolume * barHeight;
        const gradient = ctx.createLinearGradient(0, barY + barHeight, 0, barY);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0.3)');

        ctx.fillStyle = gradient;
        ctx.fillRect(x - barWidth / 2 + 2, barY + barHeight - fillHeight, barWidth - 4, fillHeight);

        // Volume percentage
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = '500 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(state.masterVolume * 100)}%`, x, barY - 8);

        // Label
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '500 9px Inter, sans-serif';
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

        const trackColor = trackLabel === 'A' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(200, 180, 140, 0.8)';

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(x - barWidth / 2, barY, barWidth, barHeight);

        // Border
        ctx.strokeStyle = isPlaying ? trackColor : 'rgba(100, 100, 100, 0.3)';
        ctx.lineWidth = isPlaying ? 2 : 1;
        ctx.strokeRect(x - barWidth / 2, barY, barWidth, barHeight);

        // Volume fill
        const fillHeight = effectiveVolume * barHeight;
        ctx.fillStyle = trackColor;
        ctx.globalAlpha = isPlaying ? 0.6 : 0.2;
        ctx.fillRect(x - barWidth / 2 + 2, barY + barHeight - fillHeight, barWidth - 4, fillHeight);
        ctx.globalAlpha = 1;

        // Track label
        ctx.fillStyle = isLoaded ? trackColor : 'rgba(100, 100, 100, 0.5)';
        ctx.font = '500 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Track ${trackLabel}`, x, barY - 8);

        // Status
        ctx.font = '400 10px Inter, sans-serif';
        if (!isLoaded) {
            ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
            ctx.fillText('No File', x, barY + barHeight + 20);
        } else {
            ctx.fillStyle = isPlaying ? trackColor : 'rgba(150, 150, 150, 0.6)';
            ctx.fillText(isPlaying ? '▶ Playing' : '⏸ Paused', x, barY + barHeight + 20);
        }

        // Effective volume
        ctx.font = '400 9px Inter, sans-serif';
        ctx.fillStyle = 'rgba(150, 150, 150, 0.6)';
        ctx.fillText(`${Math.round(effectiveVolume * 100)}%`, x, barY + barHeight + 35);
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
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(x - barWidth / 2, barY, barWidth, barHeight);

        // Border
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - barWidth / 2, barY, barWidth, barHeight);

        // Center line (neutral)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - barWidth / 2, centerY);
        ctx.lineTo(x + barWidth / 2, centerY);
        ctx.stroke();

        // Value fill
        const fillHeight = Math.abs(value) * (barHeight / 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.5;

        if (value >= 0) {
            ctx.fillRect(x - barWidth / 2 + 3, centerY - fillHeight, barWidth - 6, fillHeight);
        } else {
            ctx.fillRect(x - barWidth / 2 + 3, centerY, barWidth - 6, fillHeight);
        }
        ctx.globalAlpha = 1;

        // Label
        ctx.fillStyle = color;
        ctx.font = '500 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, barY - 8);

        // dB value
        const dbValue = Math.round(value * 12);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '500 10px Inter, sans-serif';
        ctx.fillText(`${dbValue >= 0 ? '+' : ''}${dbValue}dB`, x, barY + barHeight + 15);
    }

    /**
     * Draw overall play status
     */
    drawPlayStatus(ctx, x, y, state) {
        const isPlaying = state.trackAPlaying || state.trackBPlaying;

        ctx.font = '600 20px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = isPlaying ? 'rgba(255, 255, 255, 0.9)' : 'rgba(100, 100, 100, 0.6)';
        ctx.fillText(isPlaying ? '▶ PLAYING' : '⏸ PAUSED', x, y);

        ctx.font = '400 11px Inter, sans-serif';
        ctx.fillStyle = 'rgba(150, 150, 150, 0.5)';
        ctx.fillText('Right Hand: Quick Pinch to Play/Pause', x, y + 22);
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
                const label = hand.label === 'Right' ? 'MASTER ↕' : 'XFADE ↔';
                this.ctx.strokeText(label, ix + 25, iy);
                this.ctx.fillText(label, ix + 25, iy);
            }
        });
        this.ctx.restore();
    }
    /**
     * Draw audio-reactive visualizer around canvas edges
     * Continuous gradient waves - futuristic minimal style
     */
    drawAudioVisualizer(ctx, width, height) {
        // Get FFT data (or use idle animation if no audio)
        let fftData = null;
        if (audioEngine.analyser) {
            fftData = audioEngine.analyser.getValue();
        }

        const points = 48;
        const maxWaveHeight = 35;
        const edgeOffset = 2;

        ctx.save();
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.2)';

        const getWaveValue = (index, total, offset = 0) => {
            if (!fftData) {
                const time = Date.now() / 1000;
                return 0.12 + Math.sin(time * 1.5 + (index + offset) * 0.1) * 0.08;
            }
            const binIndex = Math.floor((index / total) * fftData.length);
            const dB = fftData[binIndex] || -100;
            return Math.max(0, (dB + 100) / 100);
        };

        // ========== TOP EDGE ==========
        ctx.beginPath();
        ctx.moveTo(0, edgeOffset);
        for (let i = 0; i <= points; i++) {
            const x = (i / points) * width;
            const value = getWaveValue(i, points, 0);
            const y = edgeOffset + value * maxWaveHeight;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(width, edgeOffset);
        ctx.lineTo(0, edgeOffset);
        ctx.closePath();

        const topGrad = ctx.createLinearGradient(0, 0, 0, maxWaveHeight + edgeOffset);
        topGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        topGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = topGrad;
        ctx.fill();

        // ========== BOTTOM EDGE ==========
        ctx.beginPath();
        ctx.moveTo(0, height - edgeOffset);
        for (let i = 0; i <= points; i++) {
            const x = (i / points) * width;
            const value = getWaveValue(i, points, points);
            const y = height - edgeOffset - value * maxWaveHeight;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height - edgeOffset);
        ctx.lineTo(0, height - edgeOffset);
        ctx.closePath();

        const bottomGrad = ctx.createLinearGradient(0, height, 0, height - maxWaveHeight - edgeOffset);
        bottomGrad.addColorStop(0, 'rgba(200, 180, 140, 0.4)');
        bottomGrad.addColorStop(1, 'rgba(200, 180, 140, 0)');
        ctx.fillStyle = bottomGrad;
        ctx.fill();

        // ========== LEFT EDGE ==========
        ctx.beginPath();
        ctx.moveTo(edgeOffset, 0);
        for (let i = 0; i <= points; i++) {
            const y = (i / points) * height;
            const value = getWaveValue(i, points, points * 2);
            const x = edgeOffset + value * maxWaveHeight;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(edgeOffset, height);
        ctx.lineTo(edgeOffset, 0);
        ctx.closePath();

        const leftGrad = ctx.createLinearGradient(0, 0, maxWaveHeight + edgeOffset, 0);
        leftGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        leftGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = leftGrad;
        ctx.fill();

        // ========== RIGHT EDGE ==========
        ctx.beginPath();
        ctx.moveTo(width - edgeOffset, 0);
        for (let i = 0; i <= points; i++) {
            const y = (i / points) * height;
            const value = getWaveValue(i, points, points * 3);
            const x = width - edgeOffset - value * maxWaveHeight;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(width - edgeOffset, height);
        ctx.lineTo(width - edgeOffset, 0);
        ctx.closePath();

        const rightGrad = ctx.createLinearGradient(width, 0, width - maxWaveHeight - edgeOffset, 0);
        rightGrad.addColorStop(0, 'rgba(200, 180, 140, 0.4)');
        rightGrad.addColorStop(1, 'rgba(200, 180, 140, 0)');
        ctx.fillStyle = rightGrad;
        ctx.fill();

        ctx.restore();
    }

    /**
     * Easter Egg: Display message when user shows middle finger
     */
    drawEasterEgg(handsData, width, height) {
        if (!handsData) return;

        // Check if any hand is showing middle finger
        const hasMiddleFinger = handsData.some(hand => hand.isMiddleFinger);

        if (hasMiddleFinger) {
            this.ctx.save();

            // Semi-transparent dark overlay
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, width, height);

            // Configure text styling
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            // Main text with glow effect
            const text = "Yeah, well F*** you too";
            const centerX = width / 2;
            const centerY = height / 2;

            // Outer glow
            this.ctx.shadowBlur = 40;
            this.ctx.shadowColor = 'rgba(255, 0, 0, 0.8)';

            // Text stroke (outline)
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 8;
            this.ctx.font = 'bold 72px Arial, sans-serif';
            this.ctx.strokeText(text, centerX, centerY);

            // Text fill
            const gradient = this.ctx.createLinearGradient(0, centerY - 50, 0, centerY + 50);
            gradient.addColorStop(0, '#ff0000');
            gradient.addColorStop(0.5, '#ff6666');
            gradient.addColorStop(1, '#ff0000');
            this.ctx.fillStyle = gradient;
            this.ctx.fillText(text, centerX, centerY);

            // Add emoji below
            this.ctx.shadowBlur = 20;
            this.ctx.font = 'bold 60px Arial, sans-serif';
            this.ctx.fillStyle = '#fff';
            this.ctx.fillText('🖕', centerX, centerY + 80);

            this.ctx.restore();
        }
    }

    /**
     * Draw a short clap notification when gestureEngine marks clap: true
     */
    drawClapNotification(handsData, ctx, width, height) {
        if (!handsData || !Array.isArray(handsData) || !ctx) return;

        // If a clap is present in this frame, update timestamp
        const clapDetectedNow = handsData.some(h => h.clap);
        if (clapDetectedNow) {
            this.lastClapTs = Date.now();
        }

        // Show notification while within clapDisplayMs since last clap
        if (Date.now() - this.lastClapTs > this.clapDisplayMs) return;

        ctx.save();
        // Notification styling
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 26px Inter, sans-serif';
        ctx.fillStyle = 'rgba(255, 215, 0, 0.98)'; // bright yellow
        ctx.shadowBlur = 18;
        ctx.shadowColor = 'rgba(255, 215, 0, 0.6)';

        const x = width / 2;
        const y = 95;
        ctx.fillText('👏 CLAP', x, y);

        ctx.font = '500 12px Inter, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.shadowBlur = 0;
        ctx.fillText('Gesture detected and processed', x, y + 22);
        ctx.restore();
    }
}

export const visualEngine = new VisualEngine();
