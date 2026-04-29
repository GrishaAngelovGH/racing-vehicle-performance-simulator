import { isTTSEnabled, playRadioAndSpeak } from './Audio.js';
import { CIRCUIT_CONFIGS, analyzeCircuitGeometry, getIdealSetup } from './Circuit.js';

/**
 * High-level wrapper for speaking text through the radio
 */
export function playEngineerAnalysis(text) {
    if (isTTSEnabled()) {
        playRadioAndSpeak(text);
    }
}

/**
 * Announces tire temperature status to the driver
 * @param {string} status - Temperature status: 'cold', 'suboptimal', 'optimal', 'overheated'
 * @param {number} avgTemp - Average tire temperature in Celsius
 */
export function announceTireTemperature(status, avgTemp) {
    let text = "";

    switch (status) {
        case 'cold':
            text = `The tires are still cold, averaging ${Math.round(avgTemp)} degrees. Careful on the first few corners, we need to build some heat into the set.`;
            break;
        case 'suboptimal':
            text = `Temperatures are climbing across all corners, currently around ${Math.round(avgTemp)} degrees. Grip is building as they reach the window.`;
            break;
        case 'optimal':
            text = `The tire set is now in the optimal window, averaging ${Math.round(avgTemp)} degrees. We're in the sweet spot for maximum grip.`;
            break;
        case 'overheated':
            text = `We're seeing high temperatures, averaging ${Math.round(avgTemp)} degrees! Tires are starting to overheat. We'll see grip drop off if they stay this hot.`;
            break;
        default:
            return;
    }

    playEngineerAnalysis(text);
}

/**
 * Formats seconds into a human-readable string for TTS
 */
export function formatTimeForTTS(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    let text = '';
    if (mins > 0) text += `${mins} minute${mins !== 1 ? 's' : ''} `;
    text += `${secs} point ${ms.toString().padStart(3, '0')} seconds`;
    return text.trim();
}

/**
 * Generates a spoken summary of the lap performance
 */
export function generateLapSummary(time, lapNumber, previousBest, isLastLap, tireHealth, wearRate) {
    const ttsTime = formatTimeForTTS(time);
    let text = `Lap ${lapNumber} complete. Time, ${ttsTime}. `;

    if (isLastLap) {
        text += `That was the final lap. `;
    }

    if (lapNumber === 1) {
        text += `Good start, keep pushing.`;
    } else if (time < previousBest && previousBest !== Infinity) {
        text += `That is a new fastest lap. Well done.`;
    } else if (previousBest !== Infinity) {
        const diff = time - previousBest;
        if (diff > 0) {
            const diffMs = Math.round(diff * 1000);
            if (diffMs < 500) {
                const diffSecs = (diffMs / 1000).toFixed(2);
                text += `You are within ${diffSecs} seconds of your best. Nice consistency.`;
            } else if (diffMs < 2000) {
                text += `You are ${formatTimeForTTS(diff)} off your best pace. Keep pushing.`;
            } else {
                text += `You are ${formatTimeForTTS(diff)} off your best pace. We need to find some time.`;
            }
        }
    }

    const currentTireHealth = Math.max(0, Math.round(tireHealth * 100));
    const predictedWornHealth = Math.max(0, Math.round((tireHealth - wearRate) * 100));
    
    if (predictedWornHealth < 30 && !isLastLap) {
        text += ` Tire health is at ${currentTireHealth} percent. We expect it to drop to critical levels by the end of this lap. Box if you can.`;
    } else if (currentTireHealth < 60 && !isLastLap) {
        text += ` Tire health is at ${currentTireHealth} percent and dropping.`;
    }

    return text;
}

/**
 * Analyzes a setup parameter change and provides engineer feedback
 */
export function analyzeSetupChange(param, newValue, context) {
    const { lastSetupValues, totalLaps, weather, car } = context;
    const oldValue = lastSetupValues[param];
    
    if (oldValue === newValue && param !== 'tireCompound') return;

    const circuitId = document.getElementById('circuitSelect')?.value || 'classic';
    const config = CIRCUIT_CONFIGS[circuitId];
    if (!config.characteristics && circuitId === 'custom') {
        config.characteristics = analyzeCircuitGeometry(config.points);
    }
    const chars = config.characteristics;
    const targets = getIdealSetup(chars, totalLaps);
    const isRaining = weather.isRainEnabled();

    let text = "";
    
    if (param === 'maxSpeed') {
        const diffToTarget = newValue - targets.maxSpeed;
        if (Math.abs(diffToTarget) < targets.maxSpeed * 0.08) {
            text = "Spot on. This is the right top speed for this circuit's straights.";
        } else if (newValue > targets.maxSpeed) {
            text = "We've got too much top speed now. It's great for pace, but we'll destroy the tires at these velocities. I'd recommend backing it off.";
        } else {
            text = "We're still way too slow on the straights. We need to increase the max speed to be competitive here.";
        }
    } else if (param === 'acceleration') {
        if (Math.abs(newValue - targets.acceleration) < 5) {
            text = "That is the perfect configuration for acceleration. Great punch out of the corners.";
        } else if (newValue > targets.acceleration) {
            text = "This is too much torque for a long stint. We'll eat the rear tires too quickly. We should dial the acceleration back.";
        } else {
            text = "The car is feeling sluggish. We need more acceleration to get out of these turns effectively.";
        }
    } else if (param === 'grip') {
        if (Math.abs(newValue - targets.grip) < 0.1) {
            text = "The mechanical grip is perfect. This is exactly how the car should be balanced.";
        } else if (newValue > targets.grip) {
            text = "We have massive grip, perhaps more than we need. It's going to hurt our tire life if we stay this aggressive.";
        } else {
            text = "We're still sliding too much in the corners. We need to increase the mechanical grip for better stability.";
        }
    }
    else if (param === 'brakePower') {
        const diff = newValue - targets.brakePower;
        const currentGrip = lastSetupValues.grip;
        
        // Grip-based threshold: if braking force (18 * newValue) > grip capability (110 * grip)
        const isGripLimited = (newValue * 18) > (currentGrip * 110);

        if (Math.abs(diff) <= 1) {
            text = "Excellent stopping power. That's exactly what we need for these heavy braking zones.";
        } else if (diff > 0) {
            if (isGripLimited) {
                text = "That's massive braking power, but I'm worried the tires can't handle it. We'll likely just lock up or slide.";
            } else if (diff > 3) {
                text = "These brakes are extremely strong. It might be overkill, but you'll certainly stop in time.";
            } else {
                text = "Stronger brakes. This should give you more confidence into the deep braking zones.";
            }
        } else {
            if (newValue < targets.brakePower - 2) {
                text = "The brakes feel a bit weak for this layout. We're going to have to start braking very early.";
            } else {
                text = "Reduced braking force. The car will be smoother, but watch your stopping distances.";
            }
        }
    } else if (param === 'downforce') {
        const diff = newValue - targets.downforce;
        if (Math.abs(diff) < 0.15) {
            text = "Aero balance is perfect. Just enough downforce for the fast turns without too much drag.";
        } else if (newValue > targets.downforce) {
            text = "We've got huge downforce now, great for the sweeps, but the drag will make us a sitting duck on the straights.";
        } else {
            if (newValue > oldValue) text = "Better stability, but we can still add more wing for these fast corners.";
            else text = "Low downforce will help our top speed, but the car will be very nervous in the fast stuff.";
        }
    } else if (param === 'tireCompound') {
        const ideal = targets.idealCompound;
        
        if (newValue === 'soft') {
            if (ideal === 'soft') {
                text = "Perfect choice. Softs will give us the maximum bite needed for these tight corners.";
            } else {
                text = "Softs fitted. They'll be fast, but I'm worried about high-speed degradation on this layout.";
            }
        } else if (newValue === 'medium') {
            if (ideal === 'medium') {
                text = "Mediums are the smart choice here. Good consistency throughout the stint.";
            } else {
                text = "Switching to Mediums. A safe bet, but we might be leaving some time on the table compared to the optimal strategy.";
            }
        } else if (newValue === 'hard') {
            if (ideal === 'hard') {
                text = "Smart move. Hards are the way to go for these long high-speed runs. They'll stay consistent.";
            } else {
                text = "Hard tires? We'll struggle for grip in the slower sections. It's a bold strategy.";
            }
        } else if (newValue === 'intermediate') {
            text = isRaining ? "Good call on the Intermediates. Perfect for this amount of water." : "It's too dry for Intermediates. They'll be destroyed in no time.";
        } else if (newValue === 'wet') {
            text = isRaining ? "Full Wets are necessary now. Safety first in these conditions." : "Way too dry for Wets. You'll have zero grip and ruin the tires.";
        }
    }

    if (text) {
        playEngineerAnalysis(text);
    }
    
    lastSetupValues[param] = newValue;
}
