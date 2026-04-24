import * as THREE from 'three';

export function initReportFeature(generateReportCallback) {
    const reportBtn = document.getElementById('generateReportBtn');
    const closeBtn = document.getElementById('closeReportBtn');
    const closeBtn2 = document.getElementById('closeReportBtn2');
    const modal = document.getElementById('report-modal');

    if (reportBtn) reportBtn.addEventListener('click', generateReportCallback);
    if (closeBtn) closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
    if (closeBtn2) closeBtn2.addEventListener('click', () => { modal.style.display = 'none'; });
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
}

export function showReportButton() {
    const el = document.getElementById('report-section');
    if (el) el.style.display = 'block';
}

export function hideReportButton() {
    const el = document.getElementById('report-section');
    if (el) el.style.display = 'none';
}

function analyzeLapConsistency(lapTimes) {
    if (lapTimes.length < 2) return { consistency: 100, trend: 'stable', variance: 0 };
    const avg = lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length;
    const variance = lapTimes.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / lapTimes.length;
    const stdDev = Math.sqrt(variance);
    const consistency = Math.max(0, 100 - (stdDev / avg) * 100);
    const firstHalf = lapTimes.slice(0, Math.floor(lapTimes.length / 2));
    const secondHalf = lapTimes.slice(Math.floor(lapTimes.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    let trend = 'stable';
    if (secondAvg < firstAvg * 0.98) trend = 'improving';
    else if (secondAvg > firstAvg * 1.02) trend = 'degrading';
    return { consistency, trend, variance, avg, stdDev };
}

function analyzeCarSettings(maxSpeed, acceleration, grip, brakePower, downforce, currentTireCompound, tireHealth) {
    const settings = { maxSpeed, acceleration, grip, brakePower, downforce, compound: currentTireCompound, tireHealth };
    const analysis = {
        speedRating: settings.maxSpeed / 350,
        accelRating: settings.acceleration / 100,
        gripRating: settings.grip,
        brakeRating: settings.brakePower / 15,
        aeroBalance: settings.downforce,
        compoundRating: settings.compound === 'soft' ? 1 : settings.compound === 'medium' ? 0.7 : 0.4,
        tireCondition: settings.tireHealth
    };
    return { settings, analysis };
}

function getCircuitCharacteristics(currentCircuitId, circuitConfigs, trackCurve) {
    const config = circuitConfigs[currentCircuitId];
    const points = config.points;
    let totalCurvature = 0, sharpCorners = 0, highSpeedSections = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const p3 = points[(i + 2) % points.length];
        const v1 = new THREE.Vector3().subVectors(p2, p1).normalize();
        const v2 = new THREE.Vector3().subVectors(p3, p2).normalize();
        const angle = v1.angleTo(v2);
        totalCurvature += angle;
        if (angle > 0.5) sharpCorners++;
        if (angle < 0.2) highSpeedSections++;
    }
    const avgCurvature = totalCurvature / points.length;
    const isTechnical = sharpCorners > points.length * 0.3;
    const isHighSpeed = highSpeedSections > points.length * 0.4;
    const trackLengthVal = trackCurve ? trackCurve.getLength() : 0;
    return { sharpCorners, highSpeedSections, isTechnical, isHighSpeed, avgCurvature, trackLength: trackLengthVal };
}

function generateRecommendations(lapAnalysis, settingsAnalysis, circuitCharacteristics, lapTimes, totalLaps, isRaining, currentCircuitId, circuitConfigs) {
    const recommendations = [];
    const { settings, analysis } = settingsAnalysis;
    const circuitName = circuitConfigs[currentCircuitId].name;

    if (analysis.speedRating > 0.85 && analysis.gripRating < 0.6 && circuitCharacteristics.isTechnical) {
        recommendations.push({
            type: 'critical',
            title: '⚠️ Speed/Grip Mismatch on Technical Track',
            desc: `Your max speed is high (${settings.maxSpeed} km/h) but cornering grip is low (${settings.grip}). On ${circuitName}, you're losing time in corners. <b>Recommendation:</b> Increase grip to 0.7+ or reduce speed to focus on corner exit.`
        });
    }

    if (analysis.aeroBalance > 1.6 && !circuitCharacteristics.isHighSpeed) {
        recommendations.push({
            type: 'warning',
            title: '🔧 High Downforce Reducing Straight-Line Speed',
            desc: `Your downforce (${settings.downforce.toFixed(1)}) is creating significant drag on a track with ${circuitCharacteristics.highSpeedSections} high-speed sections. <b>Recommendation:</b> Reduce downforce to 1.2-1.4 for better top speed.`
        });
    } else if (analysis.aeroBalance < 1.2 && circuitCharacteristics.isTechnical) {
        recommendations.push({
            type: 'warning',
            title: '🔧 Insufficient Downforce for Corners',
            desc: `Low downforce (${settings.downforce.toFixed(1)}) reduces cornering grip on this technical track with ${circuitCharacteristics.sharpCorners} sharp corners. <b>Recommendation:</b> Increase downforce to 1.4-1.7.`
        });
    }

    if (settings.compound === 'soft' && totalLaps > 5 && lapTimes.length > 3) {
        const lastLap = lapTimes[lapTimes.length - 1];
        const firstLap = lapTimes[0];
        if (lastLap > firstLap * 1.15) {
            recommendations.push({
                type: 'warning',
                title: '🛞 Soft Tire Degradation High',
                desc: `Your lap times increased ${((lastLap / firstLap - 1) * 100).toFixed(1)}% due to soft tire wear. For ${totalLaps} laps, consider Medium or Hard compounds for consistency.`
            });
        }
    }

    const potentialDecel = settings.brakePower * 18;
    const maxGripDecel = settings.grip * 110;

    if (potentialDecel > maxGripDecel) {
        recommendations.push({
            type: 'warning',
            title: '⚡ Braking Power Exceeds Tire Grip',
            desc: `Your braking power (${settings.brakePower}x) is higher than what your tires can handle (${settings.grip} grip). The simulation is capping your braking force. <b>Recommendation:</b> Either increase grip or reduce brake power to save on setup weight.`
        });
    }

    if (analysis.accelRating < 0.4 && circuitCharacteristics.sharpCorners > 5) {
        recommendations.push({
            type: 'warning',
            title: '🐌 Low Acceleration Hurting Exit Speed',
            desc: `With ${settings.acceleration}/100 acceleration and ${circuitCharacteristics.sharpCorners} corners, you're slow on corner exits. <b>Recommendation:</b> Increase acceleration to 60+ for better drive out of corners.`
        });
    }

    if (lapAnalysis.consistency < 70) {
        recommendations.push({
            type: lapAnalysis.trend === 'improving' ? 'info' : 'warning',
            title: lapAnalysis.trend === 'improving' ? '📈 Improving but Inconsistent' : '📉 Lap Time Inconsistency',
            desc: lapAnalysis.trend === 'improving'
                ? `Your times improved ${((1 - lapAnalysis.stdDev / lapAnalysis.avg) * 100).toFixed(0)}% but lap-to-lap variance is ${lapAnalysis.stdDev.toFixed(2)}s. Good learning curve, but tire wear or driver errors are causing variation.`
                : `Lap times vary by ${lapAnalysis.stdDev.toFixed(2)}s (consistency: ${lapAnalysis.consistency.toFixed(0)}%). This suggests setup instability. Check tire compound choice and aero balance.`
        });
    }

    if (isRaining && analysis.gripRating < 0.7) {
        recommendations.push({
            type: 'critical',
            title: '🌧️ Critical: Low Grip in Wet Conditions',
            desc: `Grip of ${settings.grip} is dangerously low for rain. The car will be unstable. <b>Recommendation:</b> Use Hard tires and increase downforce immediately.`
        });
    }

    if (recommendations.length === 0) {
        recommendations.push({
            type: 'info',
            title: '✅ Well-Balanced Setup',
            desc: `Your configuration shows good balance for this track. Speed (${settings.maxSpeed}), grip (${settings.grip}), and aero (${settings.downforce}) work well together on ${circuitName}.`
        });
    }

    const overallScore = Math.round(
        (analysis.speedRating * 0.25 + analysis.gripRating * 0.3 + analysis.accelRating * 0.2 + analysis.aeroBalance * 0.15 + analysis.compoundRating * 0.1) * 100
    );

    recommendations.push({
        type: overallScore > 80 ? 'info' : overallScore > 60 ? 'warning' : 'critical',
        title: `🎯 Overall Setup Score: ${overallScore}/100`,
        desc: overallScore > 80
            ? 'Excellent setup configuration! Your car is well-tuned for this circuit.'
            : overallScore > 60
                ? 'Good setup with room for improvement. Address the recommendations above.'
                : 'Setup needs significant adjustment. Follow the critical recommendations above.'
    });

    return recommendations;
}

export function generateReport(state) {
    const {
        lapTimes, currentCircuitId, totalLaps,
        maxSpeed, acceleration, grip, brakePower, downforce,
        currentTireCompound, tireHealth,
        circuitConfigs, trackCurve, tireCompounds, isRaining, formatTime
    } = state;

    const modal = document.getElementById('report-modal');
    const content = document.getElementById('report-content');

    if (!lapTimes.length) {
        alert('No lap data available. Complete at least one lap first.');
        return;
    }

    const lapAnalysis = analyzeLapConsistency(lapTimes);
    const settingsAnalysis = analyzeCarSettings(maxSpeed, acceleration, grip, brakePower, downforce, currentTireCompound, tireHealth);
    const circuitCharacteristics = getCircuitCharacteristics(currentCircuitId, circuitConfigs, trackCurve);
    const recommendations = generateRecommendations(lapAnalysis, settingsAnalysis, circuitCharacteristics, lapTimes, totalLaps, isRaining, currentCircuitId, circuitConfigs);

    const fastest = Math.min(...lapTimes);
    const slowest = Math.max(...lapTimes);
    const avg = lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length;

    const performanceClass = lapAnalysis.consistency > 90 ? 'excellent' :
        lapAnalysis.consistency > 75 ? 'good' :
            lapAnalysis.consistency > 50 ? 'average' : 'poor';

    const trendClass = lapAnalysis.trend === 'improving' ? 'trend-up' :
        lapAnalysis.trend === 'degrading' ? 'trend-down' : 'trend-stable';
    const trendLabel = lapAnalysis.trend === 'improving' ? '📈 Improving' :
        lapAnalysis.trend === 'degrading' ? '📉 Degrading' : '➡️ Stable';

    const circuitName = circuitConfigs[currentCircuitId].name;
    const tireName = tireCompounds[currentTireCompound].name;

    content.innerHTML = `
        <div class="report-section">
            <h3>📊 Race Summary</h3>
            <div class="report-grid">
                <div class="report-stat">
                    <div class="report-stat-label">Circuit</div>
                    <div class="report-stat-value">${circuitName}</div>
                </div>
                <div class="report-stat">
                    <div class="report-stat-label">Laps Completed</div>
                    <div class="report-stat-value">${lapTimes.length}</div>
                </div>
                <div class="report-stat">
                    <div class="report-stat-label">Best Lap</div>
                    <div class="report-stat-value">${formatTime(fastest)}</div>
                </div>
                <div class="report-stat">
                    <div class="report-stat-label">Average</div>
                    <div class="report-stat-value">${formatTime(avg)}</div>
                </div>
            </div>
            <div style="margin-top: 15px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>Lap Consistency</span>
                    <span class="trend-indicator ${trendClass}">
                        ${trendLabel}
                        (${lapAnalysis.consistency.toFixed(1)}%)
                    </span>
                </div>
                <div class="performance-bar">
                    <div class="performance-fill ${performanceClass}" style="width: ${lapAnalysis.consistency}%"></div>
                </div>
            </div>
        </div>

        <div class="report-section">
            <h3>⚙️ Current Settings Analysis</h3>
            <div class="report-grid">
                <div class="report-stat"><div class="report-stat-label">Max Speed</div><div class="report-stat-value">${settingsAnalysis.settings.maxSpeed}</div></div>
                <div class="report-stat"><div class="report-stat-label">Acceleration</div><div class="report-stat-value">${settingsAnalysis.settings.acceleration}</div></div>
                <div class="report-stat"><div class="report-stat-label">Grip</div><div class="report-stat-value">${settingsAnalysis.settings.grip}</div></div>
                <div class="report-stat"><div class="report-stat-label">Braking</div><div class="report-stat-value">${settingsAnalysis.settings.brakePower}x</div></div>
                <div class="report-stat"><div class="report-stat-label">Downforce</div><div class="report-stat-value">${settingsAnalysis.settings.downforce.toFixed(1)}</div></div>
                <div class="report-stat"><div class="report-stat-label">Tires</div><div class="report-stat-value">${tireName}</div></div>
            </div>
            <div style="margin-top: 10px; font-size: 0.85rem; color: var(--label-color);">
                Track: ${circuitCharacteristics.sharpCorners} sharp corners, ${circuitCharacteristics.highSpeedSections} high-speed sections
                ${isRaining ? ' | 🌧️ Wet conditions' : ''}
                | Tire Health: ${(settingsAnalysis.settings.tireHealth * 100).toFixed(0)}%
            </div>
        </div>

        <div class="report-section">
            <h3>💡 Recommendations & Analysis</h3>
            ${recommendations.map(rec => `
                <div class="recommendation-item ${rec.type}">
                    <div class="recommendation-title">${rec.title}</div>
                    <div class="recommendation-desc">${rec.desc}</div>
                </div>
            `).join('')}
        </div>

        <div class="report-section">
            <h3>📈 Lap Time Progression</h3>
            <div style="display: flex; align-items: end; gap: 4px; height: 100px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px;">
                ${lapTimes.map((time, i) => {
        const height = Math.max(10, (1 - (time - fastest) / (slowest - fastest || 1)) * 80 + 10);
        const isBest = time === fastest;
        return `
                        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                            <div style="width: 100%; height: ${height}px; background: ${isBest ? '#e10600' : '#4CAF50'}; border-radius: 3px 3px 0 0; position: relative;"
                                 title="Lap ${i + 1}: ${formatTime(time)}">
                            </div>
                            <span style="font-size: 0.7rem; color: var(--label-color);">${i + 1}</span>
                        </div>
                    `;
    }).join('')}
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 0.8rem;">
                <span style="color: #e10600;">■ Fastest: ${formatTime(fastest)}</span>
                <span style="color: #4CAF50;">■ Other Laps</span>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
}
