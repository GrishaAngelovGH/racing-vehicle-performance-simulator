/**
 * Manages the state and logic of a single race session,
 * including timing, laps, and tire health.
 */
export class RaceSession {
    constructor() {
        this.totalLaps = 5;
        this.currentLap = 1;
        this.lapTimes = [];
        this.bestLap = Infinity;
        this.tireHealth = 1.0;
        this.currentTireCompound = 'medium';
        this.pitRequested = false;
        this.simulationRunning = false;
    }

    reset() {
        this.currentLap = 1;
        this.lapTimes = [];
        this.bestLap = Infinity;
        this.tireHealth = 1.0;
        this.pitRequested = false;
        this.simulationRunning = false;
    }

    /**
     * Records a completed lap and handles pit stops
     * @returns {Object} Result of the lap recording (stopPerformed, adjustedTime, isLastLap, isNewBest)
     */
    recordLap(time) {
        const previousBest = this.bestLap;
        let stopPerformed = false;
        let adjustedTime = time;

        if (this.pitRequested) {
            adjustedTime += 12; // 12s pit lane penalty
            this.tireHealth = 1.0;
            this.pitRequested = false;
            stopPerformed = true;
        }

        this.lapTimes.push(adjustedTime);
        const lapNumber = this.lapTimes.length;
        const isLastLap = lapNumber >= this.totalLaps;
        const isNewBest = adjustedTime < this.bestLap;

        if (isNewBest) {
            this.bestLap = adjustedTime;
        }

        return {
            lapNumber,
            stopPerformed,
            adjustedTime,
            isLastLap,
            isNewBest,
            previousBest
        };
    }

    /**
     * Updates tire health based on wear rate and speed
     */
    updateTireWear(speed, wearRate, dt) {
        // Wear is proportional to speed and time
        const speedFactor = Math.max(0.2, speed / 200); 
        this.tireHealth = Math.max(0, this.tireHealth - speedFactor * wearRate * dt);
    }

    /**
     * Formats seconds into MM:SS.mmm
     */
    static formatTime(seconds) {
        if (seconds === Infinity || isNaN(seconds)) return '--:--.---';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }
}
