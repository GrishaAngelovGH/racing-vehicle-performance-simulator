# Racing Vehicle Performance Simulator

An interactive 3D racing simulation that allows users to configure vehicle parameters, race on various circuits, and analyze performance metrics in real-time.

## The project implements the following features:

* **Multiple Race Circuits** - Choose from Classic High-Speed, Forest Sprint, or City Street tracks
* **Custom Circuit Designer** - Draw and generate your own custom race tracks with an interactive canvas
* **Vehicle Physics Simulation** - Configure max speed, acceleration, cornering grip, braking strength, and aerodynamic downforce
* **Tyre Compound Selection** - Choose between Soft, Medium, and Hard tyres with different grip and wear characteristics
* **Dynamic Weather System** - Toggle rain conditions that affect grip and driving dynamics
* **Environment Decorations** - Toggle trees and buildings for immersive racing environments
* **Engine Sound Modes** - Switch between Dynamic and Real engine sound profiles
* **Race Engineer Voice** - Optional audio feedback from a virtual race engineer
* **Live Telemetry Dashboard** - Real-time display of lap times, speed, tire health, and camera mode
* **Lap History Tracking** - Complete record of all lap times with best lap highlighting
* **Race Analysis Reports** - Generate detailed post-race performance reports with statistics
* **Import/Export Circuits** - Share custom circuits via JSON export/import functionality
* **Multiple Camera Modes** - Switch between different camera perspectives during the race
* **Interactive Minimap** - Real-time track position visualization with HUD display

## Vehicle Parameters & Performance

### Core Settings

| Parameter | Effect | Range |
|-----------|--------|-------|
| **Max Speed** | Top velocity the vehicle can achieve on straight sections | 100-350 km/h |
| **Acceleration** | Rate at which the vehicle gains speed | 10-100 |
| **Cornering Grip** | Traction level determining how fast corners can be taken | 0.1-1.0 |
| **Braking Strength** | Deceleration multiplier for braking zones | 2x-15x |
| **Aero Downforce** | Trade-off between increased grip and increased drag | 1.0-2.0 |

Higher downforce improves cornering stability but reduces top speed on straights. Grip and braking strength work together to determine optimal racing lines and braking points.

### Tyre Compounds

| Compound | Grip Bonus | Wear Rate | Best For |
|----------|-----------|-----------|----------|
| **Soft** | +0.2 | 0.05/lap | Short races, qualifying |
| **Medium** | +0.1 | 0.03/lap | Balanced performance |
| **Hard** | 0 | 0.01/lap | Long races, endurance |

As tyres wear, grip decreases and lap times increase. Choosing the right compound for race length is critical for optimal performance.

### Environmental Effects

| Condition | Grip Impact | Strategy |
|-----------|-------------|----------|
| **Dry** | 100% baseline | Standard racing line |
| **Rain** | -40% grip | Earlier braking, slower corners |
| **Decorations** | Visual only | No performance impact |

Rain significantly reduces traction, requiring adjusted braking points and corner entry speeds to maintain control.

## The project is using the following technologies:

<img src="https://img.shields.io/badge/vite-%23646CFF.svg?style=flat&logo=vite&color=white" height="30"> <img src="https://img.shields.io/badge/Three.js-white?style=flat&logo=three.js&logoColor=black" height="30"> <img src="https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&color=white" height="30"> <img src="https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&color=white" height="30"> <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&color=white" height="30">
