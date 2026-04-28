import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

const TOUR_STORAGE_KEY = 'racing-sim-tour-completed';

export function hasCompletedTour() {
    return localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
}

export function markTourCompleted() {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
}

export function resetTour() {
    localStorage.removeItem(TOUR_STORAGE_KEY);
}

export function startTour(autoStart = false) {
    if (autoStart && hasCompletedTour()) {
        return;
    }

    const driverObj = driver({
        showProgress: true,
        allowClose: true,
        overlayClickNext: false,
        disableActiveInteraction: true,
        popoverClass: 'racing-tour-popover',
        stagePadding: 4,
        stageRadius: 8,
        nextBtnText: 'Next →',
        prevBtnText: '← Previous',
        doneBtnText: 'Finish',
        steps: [
            {
                element: '#controls',
                popover: {
                    title: 'Simulation Setup Panel',
                    description: 'This is your main control center. Here you can configure all vehicle parameters, select circuits, adjust tire compounds, and launch the simulation.',
                    side: 'right',
                    align: 'start'
                }
            },
            {
                element: '#circuitSelect',
                popover: {
                    title: 'Circuit Selection',
                    description: 'Choose from built-in tracks (High-Speed Classic, Forest Sprint, City Street) or your custom-designed circuits. Each track has different characteristics that affect the ideal setup.',
                    side: 'bottom',
                    align: 'center'
                }
            },
            {
                element: '#laps',
                popover: {
                    title: 'Race Duration',
                    description: 'Set the number of laps for your race session. More laps mean more tire wear and strategic decisions about pit stops.',
                    side: 'bottom',
                    align: 'center'
                }
            },
            {
                element: '.circuit-actions',
                popover: {
                    title: 'Circuit Designer',
                    description: 'Create your own custom tracks! <strong>Draw New Circuit</strong> opens the designer, or use 📤/📥 to export/import track files to share with others.',
                    side: 'bottom',
                    align: 'center'
                }
            },
            {
                element: '#maxSpeed',
                popover: {
                    title: 'Max Speed',
                    description: 'Controls the top velocity your car can reach on long straights. Higher is better for speed tracks, but balance it with grip for corners. The slider color shows how close you are to the ideal value for the selected circuit.',
                    side: 'right',
                    align: 'center'
                }
            },
            {
                element: '#acceleration',
                popover: {
                    title: 'Acceleration',
                    description: 'Determines how quickly your car reaches top speed. Important for tracks with short straights where you need to get back to speed after corners.',
                    side: 'right',
                    align: 'center'
                }
            },
            {
                element: '#grip',
                popover: {
                    title: 'Cornering Grip',
                    description: 'The traction available to maintain speed through turns. Technical tracks with many corners require higher grip values. Watch the color - green means you\'re in the sweet spot!',
                    side: 'right',
                    align: 'center'
                }
            },
            {
                element: '#brakePower',
                popover: {
                    title: 'Braking Strength',
                    description: 'How efficiently your car can slow down for tight corners. Heavy braking zones need higher values.',
                    side: 'right',
                    align: 'center'
                }
            },
            {
                element: '#downforce',
                popover: {
                    title: 'Aero Downforce',
                    description: 'Uses airflow to "stick" the car to the track. Higher downforce improves cornering but creates drag on straights. Find the balance for your track!',
                    side: 'right',
                    align: 'center'
                }
            },
            {
                element: '.compound-group',
                popover: {
                    title: 'Tire Compounds',
                    description: 'Soft (red) = max grip but wears fast. Medium (yellow) = balanced. Hard (white) = durable but slower. In rain, switch to Intermediate or Wet tires!',
                    side: 'right',
                    align: 'center'
                }
            },
            {
                element: '.sound-mode-group',
                popover: {
                    title: 'Engine Sound Mode',
                    description: 'Choose between <strong>Dynamic</strong> (RPM-responsive synthesized engine) or <strong>Real</strong> (authentic recorded engine loop). Toggle with the buttons or press S to enable sound.',
                    side: 'right',
                    align: 'center'
                }
            },
            {
                element: '.env-group',
                popover: {
                    title: 'Environment Controls',
                    description: '🌲 <strong>Decorations</strong> — Toggle trees/buildings visibility.<br>🌧️ <strong>Rain</strong> — Enables rain (reduces grip 40%, use wet tires!)<br>📻 <strong>Virtual Race Engineer</strong> — a voice feedback with setup advice and lap summaries.',
                    side: 'right',
                    align: 'center'
                }
            },
            {
                element: '#launchBtn',
                popover: {
                    title: 'Launch Simulation',
                    description: 'Click this to start racing! The button changes to "Reset" during the race. You can also press SPACE to toggle.',
                    side: 'top',
                    align: 'center'
                }
            },
            {
                element: '#stats',
                popover: {
                    title: 'Live Stats Panel',
                    description: 'Real-time telemetry shows your current lap, lap time, best lap, speed, tire health, and lap history. Monitor this to optimize your performance.',
                    side: 'left',
                    align: 'start'
                }
            },
            {
                element: '#circuit-info',
                popover: {
                    title: 'Circuit Information',
                    description: 'Displays details about the current track including length, description, and a minimap preview. Helps you understand what setup will work best.',
                    side: 'bottom',
                    align: 'center'
                }
            },
            {
                element: '.rules-btn[title="How to Play"]',
                popover: {
                    title: 'Help & Rules',
                    description: 'Click the question mark anytime to view the detailed guide with physics explanations, controls, and pro tips.',
                    side: 'bottom',
                    align: 'center'
                }
            },
            {
                element: '.rules-btn[title="Customize Car Livery"]',
                popover: {
                    title: 'Livery Workshop',
                    description: 'Customize your car\'s appearance with predefined team themes or create your own color scheme!',
                    side: 'bottom',
                    align: 'center'
                }
            },
            {
                element: '#startTourBtn',
                popover: {
                    title: 'Guided Tour Access',
                    description: 'Click this button anytime to replay the guided tour and learn about the simulator\'s features and controls.', side: 'bottom',
                    align: 'start'
                }
            },
            {
                element: null,
                popover: {
                    title: '🏎️ Ready to Race!',
                    description: 'You\'re all set! Remember to listen to your race engineer for setup advice, watch those slider colors, and aim for the fastest lap times. Good luck! <br><br><label style="display:flex;align-items:center;gap:8px;margin-top:12px;cursor:pointer"><input type="checkbox" id="dontShowTourAgain" style="cursor:pointer"> <span>Don\'t show this tour again</span></label>',
                    side: 'center',
                    align: 'center'
                }
            }
        ],
        onDestroyStarted: () => {
            const checkbox = document.getElementById('dontShowTourAgain');
            if (checkbox && checkbox.checked) {
                markTourCompleted();
            }
            driverObj.destroy();
        }
    });

    driverObj.drive();
}

export function addTourButton(container) {
    const btn = document.createElement('button');
    btn.id = 'startTourBtn';
    btn.className = 'tour-btn';
    btn.innerHTML = '🎯 Start Tour';
    btn.title = 'Take a guided tour of the interface';
    btn.addEventListener('click', () => startTour(false));
    container.appendChild(btn);
}
