/**
 * Manages the state and logic of a single race session,
 * including timing, laps, tire health, and tire temperature.
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

        // Tire temperatures in Celsius (FL, FR, RL, RR)
        this.tireTemps = {
            frontLeft: 60,
            frontRight: 60,
            rearLeft: 60,
            rearRight: 60
        };
        this.lastAnnouncedTempStatus = null;
        this.lastTempStatus = RaceSession.TEMP_STATUS.COLD;
    }

    /**
     * Temperature status categories
     */
    static TEMP_STATUS = {
        COLD: 'cold',
        SUBOPTIMAL: 'suboptimal',
        OPTIMAL: 'optimal',
        OVERHEATED: 'overheated'
    };

    /**
     * Get temperature status for a given temperature
     */
    getTempStatus(temp) {
        const roundedTemp = Math.round(temp);
        if (roundedTemp < 70) return RaceSession.TEMP_STATUS.COLD;
        if (roundedTemp < 85) return RaceSession.TEMP_STATUS.SUBOPTIMAL;
        if (roundedTemp <= 100) return RaceSession.TEMP_STATUS.OPTIMAL;
        return RaceSession.TEMP_STATUS.OVERHEATED;
    }

    /**
     * Get temperature status with hysteresis to prevent flickering at boundaries.
     * Uses asymmetric hysteresis: exact thresholds on the way up, 1°C buffer on
     * the way down.
     *
     * WHY HYSTERESIS IS NEEDED:
     * At 84-85°C, tires are near their equilibrium point where heating ≈ cooling.
     * Tiny fluctuations in driving inputs (speed, braking) each frame cause small
     * ±0.1-0.2°C temperature wobbles. At 84.5°C, even a tiny wobble crosses the
     * threshold: 84.4°C → "suboptimal" (amber), 84.6°C → "optimal" (green),
     * creating rapid color flickering at the boundary.
     *
     * WHY YOU NOTICE IT AT 84/85 BUT NOT OTHER THRESHOLDS:
     * - 70°C boundary: Passed through quickly as tires warm up (no time to hover)
     * - 100°C boundary: Requires sustained aggressive driving; overheating triggers
     *   driver behavior changes
     * - 85°C boundary: This is the "normal operating window" - tires can hover
     *   here for minutes during steady driving, making the flickering obvious
     *
     * WHY ASYMMETRIC HYSTERESIS:
     * Applying a buffer on the way *up* (e.g. requiring 87°C to turn green) means
     * the display stays amber even when tires are genuinely at optimal temperature,
     * which feels broken to the driver. Instead, the buffer only applies on the way
     * *down*, so the indicator turns green the moment tires hit 85°C, but only
     * turns amber again once they cool to 84°C. This eliminates flickering without
     * delaying the positive feedback to the driver. Standard engineering practice
     * for threshold indicators where false negatives are worse than false positives.
     */
    getTempStatusWithHysteresis(temp) {
        const currentStatus = this.lastTempStatus;
        const roundedTemp = Math.round(temp);

        // Hysteresis buffer only applies when LEAVING a status (going downward).
        // Entering a higher status uses the exact threshold so the display
        // turns green/red as soon as the tire genuinely hits the target range.
        // Without this asymmetry, tires warming through 85°C would stay amber
        // until 87°C, making "optimal" feel broken to the driver.
        const HYSTERESIS = 1;

        if (currentStatus === RaceSession.TEMP_STATUS.COLD) {
            // Cold -> Suboptimal: exact threshold on the way up
            if (roundedTemp >= 70) return this._setTempStatus(RaceSession.TEMP_STATUS.SUBOPTIMAL);
            return this._setTempStatus(RaceSession.TEMP_STATUS.COLD);
        }

        if (currentStatus === RaceSession.TEMP_STATUS.SUBOPTIMAL) {
            // Suboptimal -> Cold: hysteresis buffer on the way down
            if (roundedTemp <= 70 - HYSTERESIS) return this._setTempStatus(RaceSession.TEMP_STATUS.COLD);
            // Suboptimal -> Optimal: exact threshold on the way up
            if (roundedTemp >= 85) return this._setTempStatus(RaceSession.TEMP_STATUS.OPTIMAL);
            return this._setTempStatus(RaceSession.TEMP_STATUS.SUBOPTIMAL);
        }

        if (currentStatus === RaceSession.TEMP_STATUS.OPTIMAL) {
            // Optimal -> Suboptimal: hysteresis buffer on the way down
            if (roundedTemp <= 85 - HYSTERESIS) return this._setTempStatus(RaceSession.TEMP_STATUS.SUBOPTIMAL);
            // Optimal -> Overheated: exact threshold on the way up
            if (roundedTemp > 100) return this._setTempStatus(RaceSession.TEMP_STATUS.OVERHEATED);
            return this._setTempStatus(RaceSession.TEMP_STATUS.OPTIMAL);
        }

        if (currentStatus === RaceSession.TEMP_STATUS.OVERHEATED) {
            // Overheated -> Optimal: hysteresis buffer on the way down
            if (roundedTemp <= 100 - HYSTERESIS) return this._setTempStatus(RaceSession.TEMP_STATUS.OPTIMAL);
            return this._setTempStatus(RaceSession.TEMP_STATUS.OVERHEATED);
        }

        return this._setTempStatus(currentStatus);
    }

    /**
     * Updates lastTempStatus and returns the new status.
     * Centralises state mutation so getTempStatusWithHysteresis() always
     * keeps the state machine consistent regardless of who calls it.
     */
    _setTempStatus(status) {
        this.lastTempStatus = status;
        return status;
    }

    /**
     * Get average tire temperature
     */
    getAverageTireTemp() {
        const temps = Object.values(this.tireTemps);
        return temps.reduce((sum, t) => sum + t, 0) / temps.length;
    }

    /**
     * Get overall temperature status based on average (with hysteresis)
     */
    getOverallTempStatus() {
        return this.getTempStatusWithHysteresis(this.getAverageTireTemp());
    }

    reset() {
        this.currentLap = 1;
        this.lapTimes = [];
        this.bestLap = Infinity;
        this.tireHealth = 1.0;
        this.pitRequested = false;
        this.simulationRunning = false;
        this.resetTireTemps();
        this.lastAnnouncedTempStatus = null;
        this.lastTempStatus = RaceSession.TEMP_STATUS.COLD;
    }

    /**
     * Reset tire temperatures to ambient
     */
    resetTireTemps() {
        this.tireTemps = {
            frontLeft: 60,
            frontRight: 60,
            rearLeft: 60,
            rearRight: 60
        };
    }

    /**
     * Update tire temperatures based on driving conditions
     * Real tires have thermal inertia - they warm up over 2-3 laps and cool slowly
     * @param {number} speed - Current speed in km/h
     * @param {number} braking - Braking intensity (0-1)
     * @param {number} acceleration - Acceleration intensity (0-1)
     * @param {number} corneringLoad - Lateral cornering force (0-1)
     * @param {number} dt - Time delta in seconds
     */
    updateTireTemps(speed, braking, acceleration, corneringLoad, dt) {
        const ambientTemp = 60;
        const optimalTemp = 90; // Target operating temperature
        const maxTemp = 110;

        // Heat generation from driving inputs (scaled for realistic lap-based warm-up)
        // Base heating from speed (friction with track)
        const speedHeat = Math.min(1.0, speed / 200) * 0.3;

        // Aggressive inputs generate more heat
        const brakingHeat = braking * 0.8;
        const accelHeat = acceleration * 0.6;
        const corneringHeat = corneringLoad * 0.5;

        // Total heat input (0-2.2 range)
        const totalHeatInput = speedHeat + brakingHeat + accelHeat + corneringHeat;

        // Target temperature based on driving intensity
        // At low intensity: closer to ambient, at high intensity: closer to max
        const targetTemp = ambientTemp + (optimalTemp - ambientTemp) * Math.min(1, totalHeatInput / 1.5);

        // Thermal inertia constant - governs how fast tires warm up/cool down
        // Tires should gain ~10-15°C per lap at racing pace
        const thermalInertia = 0.025;

        // Cooling from airflow (increases with speed but never zero)
        const coolingFactor = 0.02 + (speed / 300) * 0.04;

        // Update each tire with position-specific heating characteristics
        // Front tires: more heat from braking and cornering
        const frontLeftHeat = totalHeatInput + braking * 0.2 + corneringLoad * 0.15;
        const frontRightHeat = totalHeatInput + braking * 0.2 + corneringLoad * 0.1;

        // Rear tires: more heat from acceleration
        const rearLeftHeat = totalHeatInput + acceleration * 0.25;
        const rearRightHeat = totalHeatInput + acceleration * 0.2;

        this.tireTemps.frontLeft = this._updateSingleTemp(
            this.tireTemps.frontLeft, ambientTemp, targetTemp, maxTemp,
            frontLeftHeat, coolingFactor, thermalInertia, dt
        );
        this.tireTemps.frontRight = this._updateSingleTemp(
            this.tireTemps.frontRight, ambientTemp, targetTemp, maxTemp,
            frontRightHeat, coolingFactor, thermalInertia, dt
        );
        this.tireTemps.rearLeft = this._updateSingleTemp(
            this.tireTemps.rearLeft, ambientTemp, targetTemp, maxTemp,
            rearLeftHeat, coolingFactor, thermalInertia, dt
        );
        this.tireTemps.rearRight = this._updateSingleTemp(
            this.tireTemps.rearRight, ambientTemp, targetTemp, maxTemp,
            rearRightHeat, coolingFactor, thermalInertia, dt
        );
    }

    /**
     * Update single tire temperature with realistic thermal physics
     * Tires warm up gradually and cool down slowly
     */
    _updateSingleTemp(current, ambient, targetOperating, max, heatInput, cooling, inertia, dt) {
        // Heat gain: very gradual warming based on driving intensity
        // Typical tire warm-up: 2-3 laps (120-180 seconds) from 60°C to 90°C
        const heatingRate = Math.max(0, heatInput) * inertia * 0.5;

        // Cooling: always pulls toward ambient (slower than heating)
        const coolingRate = cooling * inertia * 0.3;

        // Temperature change per frame (very small increments)
        let change = 0;

        if (current < targetOperating) {
            // Warming up - gradual approach to target
            const tempDiff = targetOperating - current;
            // Target ~15-20°C per lap at racing pace
            // heatingRate * dt gives degrees per frame, cap at ~0.3°C per second
            // Minimum heating floor prevents asymptotic crawl near target temperature
            const rawHeating = Math.max(tempDiff * heatingRate, heatInput * 0.05);
            const maxHeatingPerSecond = 0.35;
            change = Math.min(rawHeating, maxHeatingPerSecond) * dt;
        }

        // Always apply some cooling toward ambient (very slow)
        const coolingAmount = (current - ambient) * coolingRate * dt;
        change -= coolingAmount;

        // Apply overheating if excessively pushed (very small increments)
        if (heatInput > 2.0 && current > targetOperating) {
            change += (heatInput - 2.0) * 0.1 * dt;
        }

        return Math.max(ambient, Math.min(max, current + change));
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
            this.resetTireTemps();
            this.lastAnnouncedTempStatus = null;
            this.lastTempStatus = RaceSession.TEMP_STATUS.COLD;
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
     * Updates tire health based on a calculated wear amount and current temperature
     * @param {number} wearAmount - The base wear to apply (scaled by distance/performance)
     */
    updateTireWear(wearAmount) {
        const tempWearFactor = this.getTempWearFactor();
        this.tireHealth = Math.max(0, this.tireHealth - (wearAmount * tempWearFactor));
    }

    /**
     * Get wear multiplier based on current average temperature
     */
    getTempWearFactor() {
        const avgTemp = Math.round(this.getAverageTireTemp());
        if (avgTemp < 70) return 1.4; // Cold tires tear and grain
        if (avgTemp < 80) return 1.15; // Suboptimal, slight increase
        if (avgTemp <= 95) return 1.0; // Sweet spot - normal wear
        if (avgTemp <= 100) return 1.25; // Getting hot
        return 1.6; // Overheating - rapid degradation
    }

    /**
     * Get grip multiplier based on current average temperature
     * Cold tires lack bite, overheated tires lose cohesion
     */
    getTempGripFactor() {
        const avgTemp = Math.round(this.getAverageTireTemp());
        if (avgTemp < 70) return 0.88;
        if (avgTemp < 85) return 0.96;
        if (avgTemp <= 100) return 1.0;
        return 0.90;
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
