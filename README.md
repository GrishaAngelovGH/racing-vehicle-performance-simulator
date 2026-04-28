# Racing Vehicle Performance Simulator

An interactive 3D racing simulation that allows users to configure vehicle parameters, race on various circuits, and analyze performance metrics in real-time.

## The project implements the following features:

* **Multiple Race Circuits** - Choose from Classic High-Speed, Forest Sprint, or City Street tracks
* **Custom Circuit Designer** - Draw and generate your own custom race tracks with an interactive canvas
* **Real-World Circuit Lengths** - Track lengths are calculated and displayed in km (scaled 1000:1), compared against average racing circuits (~3-7 km)
* **Vehicle Physics Simulation** - Configure max speed, acceleration, cornering grip, braking strength, and aerodynamic downforce
* **Tyre Compound Selection** - Choose between Soft, Medium, and Hard tyres with different grip and wear characteristics
* **Dynamic Weather System** - Toggle rain conditions that affect grip and driving dynamics
* **Environment Decorations** - Toggle trees and buildings for immersive racing environments
* **Engine Sound Modes** - Switch between Dynamic and Real engine sound profiles
*   **Dynamic Race Engineer Analysis** - Real-time audio feedback that evaluates your car setup against the specific geometry of the current track.
*   **Circuit Profiling System** - Automatically analyzes custom-drawn tracks to determine their speed, technicality, and braking requirements.
*   **Setup Optimization Logic** - Move beyond "maxing out" sliders; find the "Sweet Spot" for each circuit to balance top speed vs. cornering drag.
*   **Pit Stop (Box) System** - Request a mid-race pit stop to reset tire health for a 12-second lap time penalty (3s tire change + 9s pit lane travel).
*   **Race Engineer Voice** - Audio feedback from a virtual race engineer with lap summaries and setup advice.
* **Live Telemetry Dashboard** - Real-time display of lap times, speed, tire health, and camera mode
* **Lap History Tracking** - Complete record of all lap times with best lap highlighting
* **Race Analysis Reports** - Generate detailed post-race performance reports with statistics
* **Import/Export Circuits** - Share custom circuits via JSON export/import functionality
* **Car Livery Customization** - Personalize your car with predefined themes or a custom hex color picker
* **Multiple Camera Modes** - Switch between different camera perspectives during the race
* **Interactive Minimap** - Real-time track position visualization with HUD display

## Vehicle Parameters & Performance

### Core Settings

| Parameter | Effect | Range |
|-----------|--------|-------|
| **Max Speed** | Top velocity the vehicle can achieve on straight sections | 100-350 km/h |
| **Acceleration** | Rate at which the vehicle gains speed | 10-100 |
| **Cornering Grip** | Traction level determining how fast corners can be taken | 0.1-1.5 |
| **Braking Strength** | Deceleration multiplier for braking zones | 2x-15x |
| **Aero Downforce** | Trade-off between increased grip and increased drag | 1.0-2.0 |

Higher downforce improves cornering stability but reduces top speed on straights. Grip and braking strength work together to determine optimal racing lines and braking points.

### Tyre Compounds

| Compound | Grip Bonus | Wear Rate (Base) | Best For |
|----------|-----------|-----------|----------|
| **Soft** | +0.18 | 15% / 10 laps | Short races, qualifying |
| **Medium** | +0.08 | 8% / 10 laps | Balanced performance |
| **Hard** | -0.04 | 4% / 10 laps | Long races, endurance |
| **Intermediate** | +0.12 | 10% / 10 laps | Light to moderate rain |
| **Full Wet** | +0.18 | 7% / 10 laps | Heavy rain, standing water |

**Adaptive Scaling:** Tire wear is automatically scaled based on your session's total laps. A 5-lap sprint will have double the wear rate of a 10-lap race, ensuring tire strategy is a critical factor regardless of session length.

As tyres wear, grip decreases and lap times increase. Choosing the right compound for race length and weather conditions is critical for optimal performance.

### Environmental Effects

| Condition | Grip Impact | Strategy |
|-----------|-------------|----------|
| **Dry** | 100% baseline | Standard racing line on slicks. |
| **Rain** | -40% grip (Slicks)<br>-15% grip (Inters)<br>-5% grip (Wets) | Switch to Intermediate or Full Wet tires to maintain grip. Slicks are heavily penalized. |
| **Decorations** | Visual only | No performance impact |

Rain significantly reduces traction. When rain starts, dry tires (Soft, Medium, Hard) become unavailable and you must switch to Intermediate or Full Wet tires. Note that using rain tires in dry conditions will severely penalize your grip!

### Car Livery & Customization

Personalize your racing machine in the **Livery Workshop**. You can choose from predefined themes or create a completely unique look.

| Theme | Colors |
|-------|--------|
| **Midnight Blue** | Navy, Yellow, Red |
| **Scarlet Speed** | Red, White |
| **Platinum Pulse** | Silver, Teal |
| **Papaya Punch** | Orange, Blue |
| **Custom** | Any Hex Color |

Livery settings are persistent and will be remembered across different browser sessions.

---

### How the Race Engineer Works
The Race Engineer doesn't just give random advice; it follows a sophisticated technical workflow:

1.  **Circuit Profiling:** When a track is loaded, the system analyzes its geometry (segment lengths and turn angles) to determine its "DNA" (e.g., High-Speed, Technical, or Flowing).
2.  **Golden Setup Calculation:** Based on the track's profile, the system calculates a hidden "Golden Setup"—the theoretically perfect numerical targets for speed, downforce, and grip.
3.  **Real-Time Comparison:** As you move the sliders, the system compares your current values to these targets in real-time.
4.  **Intelligent Feedback:** Instead of simple "higher/lower" hints, the engineer identifies if you are **Under-tuned**, in the **Sweet Spot**, or **Over-tuned** (where a setting starts causing negative trade-offs like excessive drag).

---

## The project is using the following technologies:

<img src="https://img.shields.io/badge/vite-%23646CFF.svg?style=flat&logo=vite&color=white" height="30"> <img src="https://img.shields.io/badge/Three.js-white?style=flat&logo=three.js&logoColor=black" height="30"> <img src="https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&color=white" height="30"> <img src="https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&color=white" height="30"> <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&color=white" height="30">
